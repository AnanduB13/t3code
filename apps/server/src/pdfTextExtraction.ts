import * as Predicate from "effect/Predicate";

export const PDF_EXTRACTION_MAX_PAGES = 500;
export const PDF_EXTRACTION_MAX_CHARS = 2_000_000;

export interface ExtractedPdfText {
  readonly text: string;
  readonly pageCount: number;
  readonly characterCount: number;
}

export class PdfTextExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfTextExtractionError";
  }
}

type PdfTextItem = {
  readonly str: string;
  readonly transform: ReadonlyArray<unknown>;
  readonly width: number;
  readonly height: number;
  readonly hasEOL: boolean;
};

const isTextItem = (item: unknown): item is PdfTextItem =>
  Predicate.isObject(item) && Predicate.isString(item.str);

const finiteTransformNumber = (item: PdfTextItem, index: number): number | null => {
  const value = item.transform[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const needsVisualSpace = (previous: PdfTextItem, current: PdfTextItem): boolean => {
  if (/\s$/u.test(previous.str) || /^\s/u.test(current.str)) return false;
  const previousX = finiteTransformNumber(previous, 4);
  const previousY = finiteTransformNumber(previous, 5);
  const currentX = finiteTransformNumber(current, 4);
  const currentY = finiteTransformNumber(current, 5);
  if (previousX === null || previousY === null || currentX === null || currentY === null) {
    return false;
  }
  const lineTolerance = Math.max(1, Math.min(previous.height, current.height) * 0.35);
  if (Math.abs(previousY - currentY) > lineTolerance) return false;
  const gap = currentX - (previousX + previous.width);
  return gap > Math.max(0.5, Math.min(previous.height, current.height) * 0.08);
};

const pageTextFromItems = (items: ReadonlyArray<unknown>): string => {
  let result = "";
  let previous: PdfTextItem | null = null;
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const text = item.str.replaceAll("\u0000", "");
    if (previous?.hasEOL && !result.endsWith("\n")) {
      result += "\n";
    } else if (previous && text.length > 0 && needsVisualSpace(previous, item)) {
      result += " ";
    }
    result += text;
    previous = item;
  }
  if (previous?.hasEOL && !result.endsWith("\n")) result += "\n";
  return result
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};

export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdfText> {
  if (
    bytes.byteLength < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    throw new PdfTextExtractionError("The file does not contain a valid PDF header.");
  }

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1) {
      throw new PdfTextExtractionError("The PDF has no pages.");
    }
    if (document.numPages > PDF_EXTRACTION_MAX_PAGES) {
      throw new PdfTextExtractionError(
        `The PDF has ${document.numPages} pages; the supported maximum is ${PDF_EXTRACTION_MAX_PAGES}.`,
      );
    }

    const pages: string[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false,
        disableNormalization: false,
      });
      const pageText = pageTextFromItems(content.items);
      characterCount += pageText.length;
      if (characterCount > PDF_EXTRACTION_MAX_CHARS) {
        throw new PdfTextExtractionError(
          `The extracted PDF text exceeds the supported ${PDF_EXTRACTION_MAX_CHARS.toLocaleString("en-US")} characters.`,
        );
      }
      pages.push(
        `--- Page ${pageNumber} of ${document.numPages} ---\n${pageText || "[No extractable text on this page]"}`,
      );
      page.cleanup();
    }

    return {
      text: pages.join("\n\n"),
      pageCount: document.numPages,
      characterCount,
    };
  } catch (cause) {
    if (cause instanceof PdfTextExtractionError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PdfTextExtractionError(`PDF text extraction failed: ${message}`, { cause });
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
