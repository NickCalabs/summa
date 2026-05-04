// Use the legacy build for Node.js environments (no DOM APIs available).
// The default import path requires `DOMMatrix`, which doesn't exist in Node.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item: any) => typeof item.str === "string")
      .map((item: any) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  doc.destroy();
  return pages.join("\n\n");
}
