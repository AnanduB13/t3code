import { useMemo } from "react";

const MAX_RENDERED_CELLS = 10_000;

export function parseDelimitedText(contents: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [[""]];
  let quoted = false;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents.charAt(index);
    const currentRow = rows[rows.length - 1]!;
    if (character === '"') {
      if (quoted && contents[index + 1] === '"') {
        const cellIndex = currentRow.length - 1;
        currentRow[cellIndex] = (currentRow[cellIndex] ?? "") + '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      currentRow.push("");
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && contents[index + 1] === "\n") index += 1;
      rows.push([""]);
      continue;
    }
    const cellIndex = currentRow.length - 1;
    currentRow[cellIndex] = (currentRow[cellIndex] ?? "") + character;
  }
  if (contents.length > 0 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop();
  return rows;
}

function serializeCell(value: string, delimiter: "," | "\t") {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export function serializeDelimitedText(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  delimiter: "," | "\t",
) {
  return rows
    .map((row) => row.map((cell) => serializeCell(cell, delimiter)).join(delimiter))
    .join("\n");
}

export function FinderSpreadsheetEditor(props: {
  readonly contents: string;
  readonly delimiter: "," | "\t";
  readonly readOnly: boolean;
  readonly onChange: (contents: string) => void;
}) {
  const rows = useMemo(
    () => parseDelimitedText(props.contents, props.delimiter),
    [props.contents, props.delimiter],
  );
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const visibleRowCount = Math.min(
    rows.length,
    Math.max(1, Math.floor(MAX_RENDERED_CELLS / Math.max(1, columnCount))),
  );

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    const nextRows = rows.map((row) => [...row]);
    while (nextRows[rowIndex]!.length <= columnIndex) nextRows[rowIndex]!.push("");
    nextRows[rowIndex]![columnIndex] = value;
    props.onChange(serializeDelimitedText(nextRows, props.delimiter));
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-auto bg-background">
      {visibleRowCount < rows.length ? (
        <div className="sticky left-0 top-0 z-40 border-b bg-amber-950/90 px-3 py-2 text-xs text-amber-100">
          Showing the first {visibleRowCount.toLocaleString()} of {rows.length.toLocaleString()}{" "}
          rows to keep this large sheet responsive.
        </div>
      ) : null}
      <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-xs">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-30 h-7 w-12 border-b border-r bg-muted px-2" />
            {Array.from({ length: columnCount }, (_, index) => (
              <th
                key={columnLabel(index)}
                className="h-7 min-w-36 border-b border-r bg-muted px-2 text-center font-medium text-muted-foreground"
              >
                {columnLabel(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, visibleRowCount).map((row, rowIndex) => (
            // Sheet coordinates are positional; inserting or sorting rows is not supported here.
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIndex}>
              <th className="sticky left-0 z-10 h-8 border-b border-r bg-muted px-2 text-right font-normal text-muted-foreground">
                {rowIndex + 1}
              </th>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td key={columnLabel(columnIndex)} className="h-8 border-b border-r p-0">
                  <input
                    aria-label={`${columnLabel(columnIndex)}${rowIndex + 1}`}
                    className="h-full w-36 bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-inset focus:ring-primary"
                    value={row[columnIndex] ?? ""}
                    readOnly={props.readOnly}
                    onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function columnLabel(index: number) {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}
