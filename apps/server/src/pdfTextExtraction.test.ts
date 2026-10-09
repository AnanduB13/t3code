import { describe, expect, it } from "vite-plus/test";

import { extractPdfText, PdfTextExtractionError } from "./pdfTextExtraction.ts";

function makeTextPdf(pageTexts: ReadonlyArray<string>): Uint8Array {
  const fontObjectNumber = 3 + pageTexts.length * 2;
  const pageObjectNumbers = pageTexts.map((_, index) => 3 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`,
    ...pageTexts.flatMap((text, index) => {
      const pageObjectNumber = pageObjectNumbers[index]!;
      const contentObjectNumber = pageObjectNumber + 1;
      const escapedText = text
        .replaceAll("\\", "\\\\")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)");
      const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
      ];
    }),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

describe("extractPdfText", () => {
  it("extracts all pages with stable page boundaries", async () => {
    const result = await extractPdfText(
      makeTextPdf(["Holiday booking reference NL2221525978142", "Return flight confirmed"]),
    );

    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("--- Page 1 of 2 ---");
    expect(result.text).toContain("Holiday booking reference NL2221525978142");
    expect(result.text).toContain("--- Page 2 of 2 ---");
    expect(result.text).toContain("Return flight confirmed");
  });

  it("rejects files that merely claim to be PDFs", async () => {
    await expect(extractPdfText(Buffer.from("not a pdf"))).rejects.toBeInstanceOf(
      PdfTextExtractionError,
    );
  });

  it("keeps scanned or image-only pages attachable when no text is extractable", async () => {
    const result = await extractPdfText(makeTextPdf([""]));

    expect(result.characterCount).toBe(0);
    expect(result.text).toContain("[No extractable text on this page]");
  });
});
