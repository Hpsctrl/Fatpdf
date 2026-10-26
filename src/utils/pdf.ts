import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

const PDFJS_VERSION = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageInfo {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  items?: PdfTextItem[];
}

export interface PdfData {
  fileName: string;
  totalPages: number;
  pages: PdfPageInfo[];
  rawBytes: Uint8Array;
}

/**
 * Parse PDF and extract page text along with detailed item positions for search & replace.
 */
export async function parsePdfFile(file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<PdfData> {
  const arrayBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(arrayBuffer);
  
  const pdf = await pdfjsLib.getDocument({ data: rawBytes.slice() }).promise;
  const pages: PdfPageInfo[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    
    const items: PdfTextItem[] = [];
    const textParts: string[] = [];
    
    for (const item of textContent.items as any[]) {
      if (item.str) {
        textParts.push(item.str);
        // Transform coordinates: item.transform = [scaleX, skewY, skewX, scaleY, tx, ty]
        const tx = item.transform[4];
        const ty = item.transform[5];
        items.push({
          str: item.str,
          x: tx,
          y: ty,
          width: item.width || 50,
          height: item.height || 12,
        });
      }
    }
    
    pages.push({
      pageNumber: i,
      text: textParts.join(' '),
      width: viewport.width,
      height: viewport.height,
      items,
    });
  }
  
  return {
    fileName: file.name,
    totalPages: pdf.numPages,
    pages,
    rawBytes,
  };
}

/**
 * Render single page to canvas.
 */
export async function renderPageToCanvas(
  pdfBytes: Uint8Array,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<void> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
}

/**
 * Search & Replace text in PDF by placing a clean white redaction over original matches
 * and inserting new text in identical coordinate space.
 */
export async function searchAndReplaceText(
  pdfBytes: Uint8Array,
  findText: string,
  replaceText: string,
  targetPageNum?: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  
  // Re-read PDF with pdf.js to get exact coordinate matches
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const startP = targetPageNum ? targetPageNum : 1;
  const endP = targetPageNum ? targetPageNum : pdf.numPages;

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const lowerFind = normalize(findText);

  // Helper to extract the minimal changed core between find and replace
  // e.g. "SUBMITTED TO: MRS. VAISHALI" -> "SUBMITTED TO: MR. VAISHALI" yields { diffFind: "MRS.", diffReplace: "MR." }
  const extractDiff = (f: string, r: string) => {
    const fWords = f.trim().split(/\s+/);
    const rWords = r.trim().split(/\s+/);
    while (fWords.length > 0 && rWords.length > 0 && fWords[0].toLowerCase() === rWords[0].toLowerCase()) {
      fWords.shift();
      rWords.shift();
    }
    while (fWords.length > 0 && rWords.length > 0 && fWords[fWords.length - 1].toLowerCase() === rWords[rWords.length - 1].toLowerCase()) {
      fWords.pop();
      rWords.pop();
    }
    return {
      diffFind: fWords.join(' '),
      diffReplace: rWords.join(' ')
    };
  };

  const { diffFind, diffReplace } = extractDiff(findText, replaceText);
  const coreFind = diffFind ? normalize(diffFind) : '';

  for (let pno = startP; pno <= endP; pno++) {
    const page = await pdf.getPage(pno);
    const textContent = await page.getTextContent();
    const pdfLibPage = doc.getPage(pno - 1);

    for (const item of textContent.items as any[]) {
      const str = item.str || '';
      if (!str.trim()) continue;
      const normStr = normalize(str);

      // Match either full findText, raw string, or minimal core diff
      const matchesFull = normStr.includes(lowerFind) || str.toLowerCase().includes(findText.toLowerCase());
      const matchesCore = coreFind && normStr.includes(coreFind);

      if (matchesFull || matchesCore) {
        const tx = item.transform[4];
        const ty = item.transform[5];
        const itemW = item.width || 60;
        const itemH = item.height || 14;

        // Draw whiteout rectangle over the item
        pdfLibPage.drawRectangle({
          x: tx - 2,
          y: ty - 2,
          width: Math.max(itemW + 8, replaceText.length * 7),
          height: itemH + 4,
          color: rgb(1, 1, 1),
        });

        // Calculate replaced string
        let updatedStr = str;
        if (matchesFull) {
          try {
            const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            updatedStr = str.replace(new RegExp(escaped, 'gi'), replaceText);
          } catch {
            updatedStr = replaceText;
          }
        } else if (matchesCore && diffFind) {
          try {
            const escaped = diffFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            updatedStr = str.replace(new RegExp(escaped, 'gi'), diffReplace);
          } catch {
            updatedStr = replaceText;
          }
        }

        const fontSize = Math.max(9, Math.min(16, itemH * 0.95));
        pdfLibPage.drawText(updatedStr, {
          x: tx,
          y: ty,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return await doc.save();
}

export async function overlayTextOnPage(
  pdfBytes: Uint8Array,
  pageNum: number,
  x: number,
  y: number,
  text: string,
  fontSize: number = 14,
  whiteoutUnderneath: boolean = true,
  color: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  if (pageNum < 1 || pageNum > doc.getPageCount()) return pdfBytes;
  
  const page = doc.getPage(pageNum - 1);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  if (whiteoutUnderneath) {
    page.drawRectangle({
      x: x - 4,
      y: y - 3,
      width: textWidth + 8,
      height: textHeight + 6,
      color: rgb(1, 1, 1),
    });
  }

  page.drawText(text, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(color.r, color.g, color.b),
  });

  return await doc.save();
}

/**
 * Draw a whiteout box (Redaction) on a page.
 */
export async function redactAreaOnPage(
  pdfBytes: Uint8Array,
  pageNum: number,
  box: { x: number; y: number; width: number; height: number },
  fillColor: { r: number; g: number; b: number } = { r: 1, g: 1, b: 1 }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  if (pageNum < 1 || pageNum > doc.getPageCount()) return pdfBytes;
  const page = doc.getPage(pageNum - 1);

  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: rgb(fillColor.r, fillColor.g, fillColor.b),
  });

  return await doc.save();
}

/**
 * Add watermark to specific pages (or all pages).
 */
export async function addWatermark(
  pdfBytes: Uint8Array,
  text: string,
  targetPages?: number[], // undefined means all pages
  opacity: number = 0.22,
  angle: number = -45,
  fontSizeMultiplier: number = 0.05
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const total = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  
  const pagesToStamp = targetPages && targetPages.length > 0
    ? targetPages.filter(p => p >= 1 && p <= total)
    : Array.from({ length: total }, (_, i) => i + 1);

  for (const pn of pagesToStamp) {
    const page = doc.getPage(pn - 1);
    const { width, height } = page.getSize();
    const fontSize = Math.max(16, Math.min(width, height) * fontSizeMultiplier);
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    
    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: fontSize,
      opacity,
      color: rgb(0.2, 0.2, 0.2),
      font,
      rotate: degrees(angle),
    });
  }
  return await doc.save();
}

/**
 * Add page numbers (Page X of Y) at top or bottom.
 */
export async function addPageNumbers(
  pdfBytes: Uint8Array,
  position: 'bottom-center' | 'bottom-right' | 'top-right' = 'bottom-center',
  prefix: string = 'Page ',
  startFrom: number = 1
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const total = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < total; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const text = `${prefix}${i + startFrom} of ${total}`;
    const fontSize = 10;
    const textW = font.widthOfTextAtSize(text, fontSize);

    let x = width / 2 - textW / 2;
    let y = 20;

    if (position === 'bottom-right') {
      x = width - textW - 30;
      y = 20;
    } else if (position === 'top-right') {
      x = width - textW - 30;
      y = height - 25;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return await doc.save();
}

/**
 * Add Header / Footer banner.
 */
export async function addHeaderFooter(
  pdfBytes: Uint8Array,
  text: string,
  position: 'header' | 'footer' | 'both' = 'header',
  fontSize: number = 10,
  opacity: number = 0.7
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = width / 2 - textWidth / 2;
    
    if (position === 'header' || position === 'both') {
      page.drawText(text, {
        x,
        y: height - 25,
        size: fontSize,
        opacity,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
    
    if (position === 'footer' || position === 'both') {
      page.drawText(text, {
        x,
        y: 20,
        size: fontSize,
        opacity,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }
  return await doc.save();
}

/**
 * Page management: Remove, Extract, Reorder, Rotate, Duplicate, Add Blank.
 */
export async function removePages(pdfBytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const sorted = [...pageNumbers].sort((a, b) => b - a);
  for (const pn of sorted) {
    if (pn >= 1 && pn <= doc.getPageCount()) {
      doc.removePage(pn - 1);
    }
  }
  return await doc.save();
}

export async function extractPages(pdfBytes: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  for (const pn of pageNumbers) {
    if (pn >= 1 && pn <= srcDoc.getPageCount()) {
      const [copied] = await newDoc.copyPages(srcDoc, [pn - 1]);
      newDoc.addPage(copied);
    }
  }
  return await newDoc.save();
}

export async function duplicatePage(pdfBytes: Uint8Array, pageNum: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  if (pageNum >= 1 && pageNum <= doc.getPageCount()) {
    const [copied] = await doc.copyPages(doc, [pageNum - 1]);
    doc.insertPage(pageNum, copied);
  }
  return await doc.save();
}

export async function addBlankPage(pdfBytes: Uint8Array, atIndex?: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const first = doc.getPage(0);
  const { width, height } = first ? first.getSize() : { width: 595, height: 842 };
  
  if (atIndex !== undefined && atIndex >= 0 && atIndex <= doc.getPageCount()) {
    doc.insertPage(atIndex, [width, height]);
  } else {
    doc.addPage([width, height]);
  }
  return await doc.save();
}

export async function reorderPages(pdfBytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  for (const pn of newOrder) {
    if (pn >= 1 && pn <= srcDoc.getPageCount()) {
      const [copied] = await newDoc.copyPages(srcDoc, [pn - 1]);
      newDoc.addPage(copied);
    }
  }
  return await newDoc.save();
}

export async function rotatePages(pdfBytes: Uint8Array, pageNumbers: number[], deg: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  for (const pn of pageNumbers) {
    if (pn >= 1 && pn <= doc.getPageCount()) {
      const page = doc.getPage(pn - 1);
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + deg) % 360));
    }
  }
  return await doc.save();
}

export async function mergePdfs(pdfBytesList: Uint8Array[]): Promise<Uint8Array> {
  const mergedDoc = await PDFDocument.create();
  for (const bytes of pdfBytesList) {
    const srcDoc = await PDFDocument.load(bytes);
    const indices = srcDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
  }
  return await mergedDoc.save();
}

/**
 * Add drawn signature image on a page.
 */
export async function addSignatureToPage(
  pdfBytes: Uint8Array,
  pageNum: number,
  signatureDataUrl: string,
  box: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  if (pageNum < 1 || pageNum > doc.getPageCount()) return pdfBytes;
  
  const page = doc.getPage(pageNum - 1);
  const pngImage = await doc.embedPng(signatureDataUrl);

  page.drawImage(pngImage, {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });

  return await doc.save();
}

/**
 * Download bytes as file.
 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export PDF extracted text to a .txt file.
 */
export function exportPdfAsTxt(pdfData: PdfData): void {
  const allText = pdfData.pages.map(p => `=== Page ${p.pageNumber} ===\n${p.text}\n`).join('\n\n');
  const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfData.fileName.replace(/\.pdf$/i, '') + '_extracted.txt';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export PDF extracted text to a formatted Word .doc file.
 */
export function exportPdfAsWord(pdfData: PdfData): void {
  const bodyContent = pdfData.pages.map(p => `<h3>Page ${p.pageNumber}</h3><p>${p.text.replace(/\n/g, '<br/>')}</p><hr/>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pdfData.fileName}</title></head><body><h2>${pdfData.fileName}</h2>${bodyContent}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfData.fileName.replace(/\.pdf$/i, '') + '.doc';
  a.click();
  URL.revokeObjectURL(url);
}
