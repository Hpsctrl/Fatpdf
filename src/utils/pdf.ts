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
  isScanned?: boolean;
  ocrApplied?: boolean;
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
    
    const pageText = textParts.join(' ').trim();
    pages.push({
      pageNumber: i,
      text: pageText,
      width: viewport.width,
      height: viewport.height,
      items,
      isScanned: pageText.length === 0,
      ocrApplied: false,
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

export interface FontOptions {
  family?: string; // 'helvetica' | 'times' | 'courier'
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string | { r: number; g: number; b: number };
}

export function parseColor(c?: string | { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (!c) return { r: 0, g: 0, b: 0 };
  if (typeof c === 'object' && 'r' in c) return c;
  const str = String(c).toLowerCase().trim();
  const NAMED: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 1, g: 1, b: 1 },
    red: { r: 0.86, g: 0.15, b: 0.15 },
    blue: { r: 0.12, g: 0.35, b: 0.9 },
    navy: { r: 0.05, g: 0.15, b: 0.5 },
    green: { r: 0.1, g: 0.65, b: 0.25 },
    purple: { r: 0.55, g: 0.15, b: 0.8 },
    gray: { r: 0.45, g: 0.45, b: 0.45 },
    orange: { r: 0.95, g: 0.45, b: 0.05 },
    darkgray: { r: 0.25, g: 0.25, b: 0.25 },
  };
  if (NAMED[str]) return NAMED[str];
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
      };
    } else if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
      };
    }
  }
  return { r: 0, g: 0, b: 0 };
}

export async function resolvePdfFont(
  doc: PDFDocument,
  family: string = 'helvetica',
  bold: boolean = false,
  italic: boolean = false
) {
  const fam = (family || 'helvetica').toLowerCase();
  if (fam.includes('times') || fam.includes('serif')) {
    if (bold && italic) return await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
    if (bold) return await doc.embedFont(StandardFonts.TimesRomanBold);
    if (italic) return await doc.embedFont(StandardFonts.TimesRomanItalic);
    return await doc.embedFont(StandardFonts.TimesRoman);
  }
  if (fam.includes('courier') || fam.includes('mono') || fam.includes('code')) {
    if (bold && italic) return await doc.embedFont(StandardFonts.CourierBoldOblique);
    if (bold) return await doc.embedFont(StandardFonts.CourierBold);
    if (italic) return await doc.embedFont(StandardFonts.CourierOblique);
    return await doc.embedFont(StandardFonts.Courier);
  }
  // Default: Helvetica / Sans-serif
  if (bold && italic) return await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  if (bold) return await doc.embedFont(StandardFonts.HelveticaBold);
  if (italic) return await doc.embedFont(StandardFonts.HelveticaOblique);
  return await doc.embedFont(StandardFonts.Helvetica);
}

export interface ReplaceResult {
  pdfBytes: Uint8Array;
  count: number;
}

/**
 * Search & Replace text in PDF with intelligent label matching, punctuation-insensitivity,
 * line-chunk grouping, and replacement count tracking.
 */
export async function searchAndReplaceTextResult(
  pdfBytes: Uint8Array,
  findText: string,
  replaceText: string,
  targetPageNum?: number,
  fallbackOcrItems?: Map<number, PdfTextItem[]>,
  fontOptions?: FontOptions
): Promise<ReplaceResult> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await resolvePdfFont(
    doc,
    fontOptions?.family || 'helvetica',
    Boolean(fontOptions?.bold),
    Boolean(fontOptions?.italic)
  );
  const textColor = parseColor(fontOptions?.color);
  
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const startP = targetPageNum ? targetPageNum : 1;
  const endP = targetPageNum ? targetPageNum : pdf.numPages;

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripPunct = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const lowerFind = normalize(findText);
  const cleanFind = stripPunct(findText);
  let replaceCount = 0;

  // Detect if findText is a common label like "roll.no.", "roll no", "erp", "name"
  const isRollLabel = /^(?:roll|rollno|rollnumber|erp|erpno|enrollment|regno)$/.test(cleanFind);
  const isNameLabel = /^(?:name|studentname|myname)$/.test(cleanFind);

  for (let pno = startP; pno <= endP; pno++) {
    const page = await pdf.getPage(pno);
    const textContent = await page.getTextContent();
    const pdfLibPage = doc.getPage(pno - 1);

    // Collect candidate items
    let candidateItems: PdfTextItem[] = (textContent.items as any[])
      .filter((item: any) => item.str && item.str.trim())
      .map((item: any) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 60,
        height: item.height || 14,
      }));

    if (fallbackOcrItems?.has(pno)) {
      const ocrItems = fallbackOcrItems.get(pno) || [];
      if (candidateItems.length === 0) candidateItems = ocrItems;
      else candidateItems = [...candidateItems, ...ocrItems];
    }

    // Pass 1: Individual item check
    for (const item of candidateItems) {
      const str = item.str || '';
      if (!str.trim()) continue;

      // When replacing a student name, strictly skip subject/course headers
      if (isNameLabel && /subject\s*name|course\s*name|college|institute|university/i.test(str)) {
        continue;
      }

      const normStr = normalize(str);
      const cleanStr = stripPunct(str);

      let matched = false;
      let updatedStr = str;

      // 1.1 Direct substring match
      if (normStr.includes(lowerFind) || str.toLowerCase().includes(findText.toLowerCase())) {
        matched = true;
        try {
          const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          updatedStr = str.replace(new RegExp(escaped, 'gi'), replaceText);
        } catch {
          updatedStr = replaceText;
        }
      }
      // 1.2 Student Name specific match: e.g. "NAME: ALOK KUMAR MISHRA"
      else if (isNameLabel && /(?:NAME|STUDENT\s*NAME)\s*:\s*([A-Za-z\s.'-]+)/i.test(str)) {
        matched = true;
        const m = str.match(/((?:NAME|STUDENT\s*NAME)\s*:\s*)([A-Za-z\s.'-]+)/i);
        if (m) {
          updatedStr = str.replace(m[0], `${m[1]}${replaceText}`);
        } else {
          updatedStr = `NAME: ${replaceText}`;
        }
      }
      // 1.3 Punctuation-insensitive match (e.g. "roll.no." matching "roll no: 263712" or "ROLL NO")
      else if (cleanFind.length >= 3 && cleanStr.includes(cleanFind)) {
        matched = true;
        // If string has a label: value pattern and user gave a value
        const colonIdx = str.indexOf(':');
        if (colonIdx !== -1 && (isRollLabel || isNameLabel)) {
          const labelPart = str.substring(0, colonIdx + 1);
          // If replaceText doesn't already contain the label, preserve label
          if (!replaceText.toLowerCase().includes(labelPart.toLowerCase().trim())) {
            updatedStr = `${labelPart} ${replaceText}`;
          } else {
            updatedStr = replaceText;
          }
        } else {
          updatedStr = replaceText;
        }
      }
      // 1.3 Label-aware match on item (e.g., user said "roll.no." or "erp", item is "ROLL NO: 263712")
      else if (isRollLabel && /(?:roll|erp|reg)[.\s_-]*(?:no|number)?[.\s_-]*:?\s*([0-9A-Za-z]+)/i.test(str)) {
        matched = true;
        const m = str.match(/((?:ROLL|ERP|REG)[.\s_-]*(?:NO|NUMBER)?[.\s_-]*:?\s*)([0-9A-Za-z]+)/i);
        if (m) {
          updatedStr = str.replace(m[0], `${m[1]}${replaceText}`);
        } else {
          updatedStr = `ROLL NO: ${replaceText}`;
        }
      }

      if (matched) {
        replaceCount++;
        const tx = item.x;
        const ty = item.y;
        const itemW = item.width || 60;
        const itemH = item.height || 14;

        // Whiteout box
        pdfLibPage.drawRectangle({
          x: tx - 2,
          y: ty - 2,
          width: Math.max(itemW + 12, updatedStr.length * 7.5),
          height: itemH + 4,
          color: rgb(1, 1, 1),
        });

        const fontSize = fontOptions?.size && fontOptions.size > 0
          ? fontOptions.size
          : Math.max(9, Math.min(22, itemH * 0.95));

        pdfLibPage.drawText(updatedStr, {
          x: tx,
          y: ty,
          size: fontSize,
          font,
          color: rgb(textColor.r, textColor.g, textColor.b),
        });
      }
    }

    // Pass 2: Line-level grouping (for items split horizontally like ["ROLL NO: ", "263712"])
    if (replaceCount === 0) {
      // Group items by baseline Y (within 4 points)
      const lineMap = new Map<number, PdfTextItem[]>();
      candidateItems.forEach(item => {
        const key = Math.round(item.y / 4) * 4;
        if (!lineMap.has(key)) lineMap.set(key, []);
        lineMap.get(key)!.push(item);
      });

      for (const [, lineItems] of lineMap.entries()) {
        lineItems.sort((a, b) => a.x - b.x);
        const lineText = lineItems.map(it => it.str).join(' ');
        if (isNameLabel && /subject\s*name|course\s*name|college|institute/i.test(lineText)) {
          continue;
        }
        const cleanLine = stripPunct(lineText);

        if (cleanLine.includes(cleanFind) || (isRollLabel && /(?:roll|erp|reg)[.\s_-]*(?:no|number)?[.\s_-]*:?\s*([0-9A-Za-z]+)/i.test(lineText))) {
          // Find the value item on this line (often the last item on the line)
          const targetItem = lineItems[lineItems.length - 1];
          if (targetItem) {
            replaceCount++;
            const tx = targetItem.x;
            const ty = targetItem.y;
            const itemW = targetItem.width || 60;
            const itemH = targetItem.height || 14;

            pdfLibPage.drawRectangle({
              x: tx - 2,
              y: ty - 2,
              width: Math.max(itemW + 10, replaceText.length * 7.5),
              height: itemH + 4,
              color: rgb(1, 1, 1),
            });

            const fontSize = fontOptions?.size && fontOptions.size > 0
              ? fontOptions.size
              : Math.max(9, Math.min(22, itemH * 0.95));

            pdfLibPage.drawText(replaceText, {
              x: tx,
              y: ty,
              size: fontSize,
              font,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });
            break;
          }
        }
      }
    }

    // Pass 3: Fallback for student Roll / ERP ID on Page
    if (replaceCount === 0 && isRollLabel) {
      for (const item of candidateItems) {
        // If an item contains a 5 to 8 digit number (common roll / ERP length)
        const numMatch = (item.str || '').match(/\b\d{5,8}\b/);
        if (numMatch) {
          replaceCount++;
          const tx = item.x;
          const ty = item.y;
          const itemW = item.width || 60;
          const itemH = item.height || 14;

          const updatedStr = (item.str || '').replace(numMatch[0], replaceText);

          pdfLibPage.drawRectangle({
            x: tx - 2,
            y: ty - 2,
            width: Math.max(itemW + 10, updatedStr.length * 7.5),
            height: itemH + 4,
            color: rgb(1, 1, 1),
          });

          const fontSize = fontOptions?.size && fontOptions.size > 0
            ? fontOptions.size
            : Math.max(9, Math.min(22, itemH * 0.95));

          pdfLibPage.drawText(updatedStr, {
            x: tx,
            y: ty,
            size: fontSize,
            font,
            color: rgb(textColor.r, textColor.g, textColor.b),
          });
          break;
        }
      }
    }
  }

  const savedBytes = await doc.save();
  return { pdfBytes: savedBytes, count: replaceCount };
}

export async function searchAndReplaceText(
  pdfBytes: Uint8Array,
  findText: string,
  replaceText: string,
  targetPageNum?: number,
  fallbackOcrItems?: Map<number, PdfTextItem[]>,
  fontOptions?: FontOptions
): Promise<Uint8Array> {
  const result = await searchAndReplaceTextResult(
    pdfBytes,
    findText,
    replaceText,
    targetPageNum,
    fallbackOcrItems,
    fontOptions
  );
  return result.pdfBytes;
}

/**
 * Change the font family, font size, style (bold/italic), and color of text in a PDF.
 */
export async function changeTextFont(
  pdfBytes: Uint8Array,
  targetText: string,
  fontOptions: FontOptions,
  targetPageNum?: number,
  fallbackOcrItems?: Map<number, PdfTextItem[]>
): Promise<Uint8Array> {
  return await searchAndReplaceText(
    pdfBytes,
    targetText,
    targetText,
    targetPageNum,
    fallbackOcrItems,
    fontOptions
  );
}

export async function overlayTextOnPage(
  pdfBytes: Uint8Array,
  pageNum: number,
  x: number,
  y: number,
  text: string,
  fontSize: number = 14,
  whiteoutUnderneath: boolean = true,
  color: { r: number; g: number; b: number } | string = { r: 0, g: 0, b: 0 },
  fontFamily: string = 'helvetica',
  bold: boolean = true,
  italic: boolean = false
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  if (pageNum < 1 || pageNum > doc.getPageCount()) return pdfBytes;
  
  const page = doc.getPage(pageNum - 1);
  const font = await resolvePdfFont(doc, fontFamily, bold, italic);
  const rgbColor = parseColor(color);
  
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
    color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
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

/**
 * Converts an image file (PNG, JPG, WEBP, etc.) or screenshot directly into a standard PDF page.
 */
export async function convertImageFileToPdf(file: File): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let image: any;

  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.(jpe?g)$/i.test(file.name);

  if (isPng) {
    try {
      image = await doc.embedPng(bytes);
    } catch {
      // fallback to canvas
    }
  } else if (isJpg) {
    try {
      image = await doc.embedJpg(bytes);
    } catch {
      // fallback to canvas
    }
  }

  if (!image) {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.src = blobUrl;
    });
    URL.revokeObjectURL(blobUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 1000;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBase64 = pngDataUrl.split(',')[1];
    const binary = atob(pngBase64);
    const pngBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      pngBytes[i] = binary.charCodeAt(i);
    }
    image = await doc.embedPng(pngBytes);
  }

  const page = doc.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });

  return await doc.save();
}

/**
 * Render a page to an offscreen canvas and return high-res base64 image for online OCR.
 */
export async function extractPageAsBase64Image(
  pdfBytes: Uint8Array,
  pageNum: number,
  scale: number = 2.0
): Promise<{ base64: string; width: number; height: number }> {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(pdfBytes, pageNum, canvas, scale);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.split(',')[1];
  return { base64, width: canvas.width, height: canvas.height };
}

