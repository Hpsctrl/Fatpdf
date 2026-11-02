import type { PdfData, PdfTextItem } from './pdf';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

export type AiProvider = 'gemini' | 'groq';

export interface ChatMessage {
  role: 'user' | 'ai' | 'system';
  text: string;
}

export interface AiResult {
  message: string;
  action: string;
  params: Record<string, any>;
  activeModel?: string;
}

export interface OcrBlock {
  text: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale
}

export interface OcrResult {
  fullText: string;
  blocks: OcrBlock[];
  items: PdfTextItem[];
}

function buildPdfContext(pdfData: PdfData): string {
  if (!pdfData || pdfData.pages.length === 0) return 'PDF is empty.';

  const lines: string[] = [];
  lines.push(`File: "${pdfData.fileName}"`);
  lines.push(`Total Pages: ${pdfData.totalPages}`);
  lines.push('');

  const maxCharsPerPage = 1200;
  const maxPages = 35;
  const pagesToShow = Math.min(pdfData.pages.length, maxPages);

  for (let i = 0; i < pagesToShow; i++) {
    const p = pdfData.pages[i];
    const text = p.text.trim();
    const truncated = text.length > maxCharsPerPage 
      ? text.substring(0, maxCharsPerPage) + '...(truncated)' 
      : text;
    lines.push(`--- Page ${p.pageNumber} (${p.width.toFixed(0)}x${p.height.toFixed(0)}) ${p.ocrApplied ? '[OCR Extracted]' : ''} ---`);
    lines.push(truncated || (p.isScanned ? '(Scanned/Image page - run Online OCR to inspect)' : '(Empty page)'));
    lines.push('');
  }

  if (pdfData.pages.length > maxPages) {
    lines.push(`... and ${pdfData.pages.length - maxPages} more pages.`);
  }

  return lines.join('\n');
}

/**
 * Intelligent helper to extract student name from page text.
 * Strictly ignores "SUBJECT NAME:" and "COURSE NAME:" and university/college names.
 */
export function extractStudentName(text: string): string | null {
  if (!text) return null;
  // 1. Look specifically in SUBMITTED BY section
  const submittedByBlock = text.match(/SUBMITTED\s+BY:?[\s\S]*?(?:SUBMITTED\s+TO|$)/i);
  if (submittedByBlock) {
    const n = submittedByBlock[0].match(/(?:NAME|STUDENT\s*NAME)\s*:\s*([A-Za-z\s.'-]+?)(?:\s{2,}|\b(?:ROLL|ERP|REG|COURSE|BRANCH)\b|\r?\n|$)/i);
    if (n && n[1].trim() && !/SUBJECT|COURSE|LAB|COLLEGE|INSTITUTE/i.test(n[1])) {
      return n[1].trim();
    }
  }

  // 2. Iterate line by line, skipping lines with SUBJECT NAME, COURSE NAME, or INSTITUTION
  const lines = text.split('\n');
  for (const line of lines) {
    if (/SUBJECT\s+NAME|COURSE\s+NAME|COLLEGE|INSTITUTE|UNIVERSITY|SEMESTER/i.test(line)) continue;
    const m = line.match(/(?:STUDENT\s+NAME|\bNAME)\s*:\s*([A-Za-z\s.'-]+?)(?:\s{2,}|\b(?:MRS?|MS|DR|PROF|ROLL|ERP|REG)\b|\r?\n|$)/i);
    if (m && m[1].trim() && !/SUBJECT|COURSE|LAB|COLLEGE|INSTITUTE/i.test(m[1])) {
      return m[1].trim();
    }
  }
  return null;
}

/**
 * Intelligent helper to extract student Roll No or ERP from page text.
 */
export function extractRollNo(text: string): string | null {
  if (!text) return null;
  const m = text.match(/(?:ROLL|ERP|REG)[.\s_-]*(?:NO\.?|NUMBER)?[.\s_-]*:?\s*([0-9A-Za-z]+)/i);
  if (m) return m[1].trim();
  const digits = text.match(/\b\d{5,8}\b/);
  return digits ? digits[0] : null;
}

/**
 * Intelligent helper to extract teacher/evaluator name (e.g. SUBMITTED TO: DR. SMITH).
 */
export function extractTeacherName(text: string): string | null {
  if (!text) return null;
  const teacherMatch = text.match(/(?:SUBMITTED\s+TO:\s*)([A-Za-z\s.]+?)(?:\s{2,}|\bASSISTANT|\bPROFESSOR|\r?\n|$)/i);
  if (teacherMatch) return teacherMatch[1].trim();
  const m = text.match(/\b(?:MRS?|MS|DR|PROF)\.?\s+[A-Za-z\s.]+/i);
  return m ? m[0].trim() : null;
}

/**
 * High-Speed Local Intent Pre-Processor (0ms latency, zero denial)
 * Directly handles high-frequency commands, abbreviations, single words, and common typos.
 */
export function detectQuickIntent(prompt: string, pdfData: PdfData): AiResult | null {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  // 0. Online OCR & Scan shortcuts
  if (/^(?:run\s+)?(?:online\s+)?ocr(?:\s+(?:on\s+)?(?:page\s*(\d+)|all))?$/i.test(lower) || lower === 'scan' || lower === 'extract text' || lower === 'ocr page' || lower === 'scan page') {
    const m = lower.match(/page\s*(\d+)/i);
    const targetPage = m ? parseInt(m[1], 10) : 1;
    return {
      message: `Running **Online OCR** on page ${targetPage} using AI Vision to extract text and enable editing on the image...`,
      action: 'run_ocr',
      params: { page: targetPage }
    };
  }

  // 1. Page 1 summary / inspect shortcuts
  if (/^(1st\s*pag[e|ge]|1ar\s*pag[e|ge]|first\s*page|page\s*1|p1|cover\s*page)$/i.test(lower) || lower === 'page 1 info') {
    const p1 = pdfData.pages[0];
    const text = p1 ? p1.text.trim() : '';
    if (text) {
      return {
        message: `### Page 1 Summary ${p1.ocrApplied ? '(Extracted via Online OCR)' : ''}\n\n${text}\n\n*I can replace any name, roll number, or text here immediately—just tell me what to update!*`,
        action: 'none',
        params: {}
      };
    } else {
      return {
        message: `Page 1 is an image or scanned document. Running **Online OCR** to extract its text content and enable editing...`,
        action: 'run_ocr',
        params: { page: 1 }
      };
    }
  }

  // 1.5. Compound Student Name AND Roll Number Edit
  // e.g. "In first page change name to Jane Doe and roll number to 102938"
  const hasNameKw = /\b(?:student\s+|my\s+)?name\b/i.test(clean);
  const hasRollKw = /\b(?:roll|erp|reg)[.\s_-]*(?:no|number)?\b/i.test(clean);

  if (hasNameKw && hasRollKw && /(?:and|,|&)\s+/i.test(clean)) {
    let targetPage = 1;
    const pMatch = clean.match(/(?:in|on)?\s*(?:page\s*(\d+)|pg\s*(\d+)|p(\d+)|first\s*page|1st\s*page)/i);
    if (pMatch) {
      if (pMatch[1]) targetPage = parseInt(pMatch[1], 10);
      else if (pMatch[2]) targetPage = parseInt(pMatch[2], 10);
      else if (pMatch[3]) targetPage = parseInt(pMatch[3], 10);
    }

    let newName = '';
    let newRoll = '';

    // Pattern A: name ... and roll ...
    const nameThenRoll = clean.match(/(?:student\s+|my\s+)?name\s*(?:to|with|:|=|\s)+\s*([A-Za-z\s.'-]+?)(?:\s+(?:and|,|&)\s+(?:student\s+)?(?:roll|erp|reg)[.\s_-]*(?:no|number)?\s*(?:to|with|:|=|\s)+\s*([A-Za-z0-9-]+))/i);
    if (nameThenRoll) {
      newName = nameThenRoll[1].trim();
      newRoll = nameThenRoll[2].trim();
    } else {
      // Pattern B: roll ... and name ...
      const rollThenName = clean.match(/(?:student\s+)?(?:roll[.\s_-]*(?:no[.\s_-]*|number)?|erp[.\s_-]*(?:no[.\s_-]*|number)?)\s*(?:to|with|:|=|\s)+\s*([A-Za-z0-9-]+?)(?:\s+(?:and|,|&)\s+(?:student\s+|my\s+)?name\s*(?:to|with|:|=|\s)+\s*([A-Za-z\s.'-]+))/i);
      if (rollThenName) {
        newRoll = rollThenName[1].trim();
        newName = rollThenName[2].trim();
      }
    }

    if (newName && newRoll) {
      const pText = pdfData.pages[targetPage - 1]?.text || pdfData.pages[0]?.text || '';
      const oldStudentName = extractStudentName(pText) || 'name';
      const oldRollNo = extractRollNo(pText) || 'roll.no.';

      return {
        message: `Updated student name to **${newName}** and roll number to **${newRoll}** on Page ${targetPage}!`,
        action: 'batch_replace',
        params: {
          replacements: [
            { find: oldStudentName, replace: newName, targetPage },
            { find: oldRollNo, replace: newRoll, targetPage }
          ],
          targetPage
        }
      };
    }
  }

  // 2. Change student name shortcut
  const nameMatch = clean.match(/^(?:in\s+pg\s*(\d+),?\s*)?(?:change|update|set|replace)?\s*(?:student\s+|my\s+)?name\s*(?:to|with|:|=|\s)+\s*([A-Za-z\s.'-]+)$/i);
  if (nameMatch && (nameMatch[2] || nameMatch[1])) {
    const targetPage = nameMatch[1] && !isNaN(parseInt(nameMatch[1], 10)) ? parseInt(nameMatch[1], 10) : 1;
    const newName = (nameMatch[2] || nameMatch[1]).trim();
    const pText = pdfData.pages[targetPage - 1]?.text || pdfData.pages[0]?.text || '';
    const oldName = extractStudentName(pText) || 'name';
    return {
      message: `Updated student name to **${newName}** on Page ${targetPage}!`,
      action: 'search_replace',
      params: { find: oldName, replace: newName, targetPage }
    };
  }

  // 3. Change roll number / ERP shortcut (handles "roll.no.", "roll no", "erp", "roll", etc.)
  const rollMatch = clean.match(/^(?:in\s+pg\s*(\d+),?\s*)?(?:change|update|set|replace)?\s*(?:student\s+)?(?:roll[.\s_-]*(?:no[.\s_-]*|number)?|erp[.\s_-]*(?:no[.\s_-]*|number)?)\s*(?:to|with|:|=|\s)+\s*([A-Za-z0-9-]+)$/i)
    || clean.match(/^(?:in\s+pg\s*(\d+),?\s*)?(?:roll[.\s_-]*(?:no[.\s_-]*|number)?|erp[.\s_-]*(?:no[.\s_-]*|number)?)\s*(?:to|with|:|=|\s)+\s*([A-Za-z0-9-]+)$/i);
  if (rollMatch && (rollMatch[2] || rollMatch[1])) {
    const targetPage = rollMatch[1] && !isNaN(parseInt(rollMatch[1], 10)) ? parseInt(rollMatch[1], 10) : 1;
    const newRoll = (rollMatch[2] || rollMatch[1]).trim();
    const pText = pdfData.pages[targetPage - 1]?.text || pdfData.pages[0]?.text || '';
    const oldRoll = extractRollNo(pText) || 'roll.no.';
    return {
      message: `Updated roll number to **${newRoll}** on Page ${targetPage}!`,
      action: 'search_replace',
      params: { find: oldRoll, replace: newRoll, targetPage }
    };
  }

  // 3.5. Change font / formatting shortcut
  // e.g. "change font of Title to times roman", "make name bold", "change font to courier"
  const fontMatch = clean.match(/(?:change|set)\s+font(?:\s+of)?\s+["']?([^"']+)["']?\s+to\s+([A-Za-z0-9\s#-]+)/i);
  if (fontMatch) {
    const targetText = fontMatch[1].trim();
    const styleDesc = fontMatch[2].toLowerCase();
    const isBold = styleDesc.includes('bold');
    const isItalic = styleDesc.includes('italic') || styleDesc.includes('oblique');
    let family = 'helvetica';
    if (styleDesc.includes('times') || styleDesc.includes('serif')) family = 'times';
    else if (styleDesc.includes('courier') || styleDesc.includes('mono') || styleDesc.includes('code')) family = 'courier';

    const sizeMatch = styleDesc.match(/(?:size\s*)?(\d{1,2})\s*(?:pt|px)?/i);
    const fontSize = sizeMatch ? parseInt(sizeMatch[1], 10) : undefined;
    const colorMatch = styleDesc.match(/(red|blue|green|purple|black|white|gray|navy|#[0-9a-f]{3,6})/i);
    const color = colorMatch ? colorMatch[1] : undefined;

    return {
      message: `Updated font for **"${targetText}"** to ${family}${isBold ? ' bold' : ''}${isItalic ? ' italic' : ''}${fontSize ? ` (${fontSize}pt)` : ''}${color ? ` in ${color}` : ''}!`,
      action: 'change_font',
      params: { targetText, fontFamily: family, bold: isBold, italic: isItalic, fontSize, color }
    };
  }

  // Quick "make [text] bold/italic/red/blue"
  const quickStyleMatch = clean.match(/^make\s+["']?([^"']+)["']?\s+(bold|italic|red|blue|green|purple)$/i);
  if (quickStyleMatch) {
    const targetText = quickStyleMatch[1].trim();
    const style = quickStyleMatch[2].toLowerCase();
    const isBold = style === 'bold';
    const isItalic = style === 'italic';
    const color = ['red', 'blue', 'green', 'purple'].includes(style) ? style : undefined;

    return {
      message: `Updated style for **"${targetText}"** to ${style}!`,
      action: 'change_font',
      params: { targetText, bold: isBold, italic: isItalic, color }
    };
  }

  // 4. Watermark shortcuts
  if (lower.startsWith('watermark') || lower.startsWith('add watermark')) {
    const textPart = clean.replace(/^(add\s+)?watermark\s*(page\s*\d+)?\s*(only)?\s*/i, '').trim();
    const targetText = textPart || 'CONFIDENTIAL';
    const isPage1 = lower.includes('page 1') || lower.includes('p1');
    return {
      message: `Added watermark **"${targetText}"** ${isPage1 ? 'on Page 1' : 'across all pages'}!`,
      action: 'add_watermark',
      params: {
        text: targetText,
        targetPages: isPage1 ? [1] : undefined,
        opacity: 0.22,
        angle: -45
      }
    };
  }

  // 5. Page numbering shortcut
  if (/^(add\s*)?(page\s*)?numbers?(\s*at\s*bottom)?$/i.test(lower) || lower === 'number pages') {
    return {
      message: `Numbered all ${pdfData.totalPages} pages automatically at the bottom center.`,
      action: 'add_page_numbers',
      params: { position: 'bottom-center', prefix: 'Page ' }
    };
  }

  // 6. Rotate shortcut
  if (lower === 'rotate' || lower === 'rotate page' || lower === 'rotate 90') {
    return {
      message: `Rotated current page by 90°.`,
      action: 'rotate_pages',
      params: { degrees: 90 }
    };
  }

  // 7. Duplicate shortcut
  if (lower === 'duplicate' || lower === 'duplicate page') {
    return {
      message: `Duplicated current page.`,
      action: 'duplicate_page',
      params: {}
    };
  }

  // 8. General change / replace regex (handles typos like "chaneg", "replcae", "in pg 1, chaneg X to Y")
  if (!hasNameKw || !hasRollKw) {
    const changeRegex = /(?:in\s+pg\s*(\d+),?\s*)?(?:change|chaneg|replace|replcae|update)\s+([A-Za-z0-9\s:._'-]+?)\s+(?:to|with)\s+([A-Za-z0-9\s:._'-]+)$/i;
    const changeMatch = clean.match(changeRegex);
    if (changeMatch) {
      const targetPage = changeMatch[1] ? parseInt(changeMatch[1], 10) : 1;
      let findVal = changeMatch[2].trim();
      let replaceVal = changeMatch[3].trim();

      // Clean common prefixes and attributes from findVal
      const pText = pdfData.pages[targetPage - 1]?.text || pdfData.pages[0]?.text || '';
      const cleanAttr = findVal.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (findVal.toLowerCase().includes('submitted to') || cleanAttr === 'teacher') {
        findVal = extractTeacherName(pText) || findVal;
      } else if (cleanAttr === 'roll' || cleanAttr === 'rollno' || cleanAttr === 'erp' || cleanAttr === 'erpno') {
        findVal = extractRollNo(pText) || 'roll.no.';
      } else if (cleanAttr === 'name' || cleanAttr === 'studentname') {
        findVal = extractStudentName(pText) || 'name';
      }

      return {
        message: `Replaced **"${findVal}"** with **"${replaceVal}"** on Page ${targetPage}!`,
        action: 'search_replace',
        params: { find: findVal, replace: replaceVal, targetPage }
      };
    }
  }

  // 9. Theme switcher shortcuts ("dark mode", "pearl mode", "earl mode", "adaptive mode", "light mode")
  if (/(?:switch\s+to\s+|enable\s+|set\s+|turn\s+on\s+)?(dark\s*mode|pearl\s*mode|earl\s*mode|adaptive\s*mode|light\s*mode|night\s*mode)/i.test(lower)) {
    let mode = 'dark';
    if (lower.includes('pearl') || lower.includes('earl')) mode = 'pearl';
    else if (lower.includes('adaptive') || lower.includes('system') || lower.includes('auto')) mode = 'adaptive';
    else if (lower.includes('light') || lower.includes('day')) mode = 'light';
    return {
      message: `Switched UI theme to **${mode.toUpperCase()}** mode!`,
      action: 'set_theme',
      params: { theme: mode }
    };
  }

  // 10. Confirmations: "ok do it", "yes", "do it", "apply"
  if (/^(ok\s*do\s*it|do\s*it|yes|apply|confirm|ok|proceed)$/i.test(lower)) {
    // Look at previous assistant message for intent
    return null; // Will cascade to LLM or use context
  }

  return null;
}

const SYSTEM_PROMPT = `You are the master AI assistant for an advanced PDF Editor application.
Your core principle is NEVER DENY OR REFUSE ANY USER REQUEST. Always find a way to perform or facilitate the edit.

AVAILABLE ACTIONS YOU CAN TRIGGER:
1. **none** - Answer user questions, provide summaries, study notes, explanations, or quizzes.
2. **search_replace** - Search for specific text and replace it with new text across the PDF or target page, optionally applying font styling.
   Params: { "find": "old text", "replace": "new text", "targetPage": 1 (optional), "fontFamily": "helvetica"|"times"|"courier", "fontSize": 14, "bold": true, "italic": false, "color": "blue"|"#000000" }
3. **batch_replace** - Execute multiple text replacements in a single request (e.g. student name AND roll number).
   Params: { "replacements": [{ "find": "old text 1", "replace": "new text 1", "targetPage": 1 }, { "find": "old text 2", "replace": "new text 2", "targetPage": 1 }] }
4. **add_watermark** - Add text watermark across the document or target pages.
   Params: { "text": "CONFIDENTIAL", "targetPages": [1] (optional), "opacity": 0.22, "angle": -45 }
5. **add_header_footer** - Add banner or header/footer text across all pages.
   Params: { "text": "Header Text", "position": "header"|"footer"|"both" }
6. **add_page_numbers** - Number all pages automatically.
   Params: { "position": "bottom-center"|"bottom-right"|"top-right", "prefix": "Page " }
7. **remove_pages** - Delete specific pages.
   Params: { "pages": [1, 3] }
8. **extract_pages** - Extract pages into a separate document.
   Params: { "pages": [2, 4] }
9. **duplicate_page** - Duplicate a page.
   Params: { "page": 1 }
10. **add_blank_page** - Insert a blank white page.
    Params: { "atIndex": 1 }
11. **reorder_pages** - Reorder pages.
    Params: { "order": [2, 1, 3] }
12. **rotate_pages** - Rotate specific pages by degrees (90, 180, 270).
    Params: { "pages": [1], "degrees": 90 }
13. **merge** - Signal the interface to allow merging another PDF.
    Params: {}
14. **run_ocr** - Run Online OCR using AI vision on a scanned page or document image to extract text and enable editing.
    Params: { "page": 1 }
15. **change_font** - Change the font family ('helvetica'|'times'|'courier'), font size, style (bold/italic), or color of text in the document.
    Params: { "targetText": "text to restyle", "fontFamily": "times"|"courier"|"helvetica", "fontSize": 14, "bold": true, "italic": false, "color": "blue"|"#000000", "targetPage": 1 (optional) }
16. **set_theme** - Switch application UI theme between 'dark', 'light', 'pearl' (eye-care warm sepia paper), or 'adaptive' (syncs with OS).
    Params: { "theme": "dark"|"light"|"pearl"|"adaptive" }

STRICT RELIABILITY, ACTION EXECUTION & NON-DENIAL RULES:
- CRITICAL: WHEN THE USER ASKS TO CHANGE, REPLACE, ROTATE, WATERMARK, OR NUMBER PAGES, DO NOT JUST DESCRIBE IT IN TEXT! YOU MUST SET THE "action" FIELD TO THE RELEVANT TOOL (e.g. "search_replace", "batch_replace", "change_font", "add_watermark", etc.) WITH COMPLETE "params". NEVER SET "action": "none" WHEN A MODIFICATION IS REQUESTED!
- CRITICAL: WHEN USER ASKS TO CHANGE MULTIPLE ITEMS (e.g. "change name to X and roll number to Y"), ALWAYS USE "batch_replace" WITH A SEPARATE REPLACEMENT FOR EACH ITEM IN "replacements"! NEVER COMBINE MULTIPLE EDITS INTO ONE STRING!
- CRITICAL: NEVER CONFUSE "SUBJECT NAME" OR "COURSE NAME" WITH THE STUDENT'S NAME! The subject name is the title of the lab or subject (e.g. "DATA STRUCTURE AND ALGORITHM USING C LAB"). The student's name is located under "SUBMITTED BY" or labeled with "NAME: <Student Name>" (e.g. "JOHN DOE").
- If the user asks to change font, font size, make text bold, italic, or change text color, trigger "change_font"!
- If the user asks for dark mode, light mode, pearl mode, or adaptive mode, trigger "set_theme"!
- If the user says "ok do it", "apply", "yes", or "confirm", examine the prior conversation context, determine what edit was discussed, and IMMEDIATELY TRIGGER THE ACTION!
- In "search_replace", set "find" to the exact string found in the PDF text (e.g. "DR. SMITH" or "NAME: JOHN DOE") and "replace" to the user's desired text.
- If a page contains a scanned image, photo, or screenshot of another document, NEVER refuse or say "I cannot edit this". Trigger "run_ocr" to extract text or "search_replace" to replace text visually!
- Always output clean JSON matching:
{
  "message": "Direct explanation of action executed on the document.",
  "action": "search_replace|batch_replace|change_font|run_ocr|set_theme|add_watermark|add_header_footer|add_page_numbers|remove_pages|extract_pages|duplicate_page|add_blank_page|reorder_pages|rotate_pages|merge|none",
  "params": {}
}`;

async function processWithGemini(
  chatHistory: ChatMessage[],
  prompt: string,
  pdfData: PdfData,
  apiKey: string,
  modelPreference?: string
): Promise<AiResult> {
  const ai = new GoogleGenAI({ apiKey });
  const pdfContext = buildPdfContext(pdfData);
  const fullSystem = `${SYSTEM_PROMPT}\n\n=== CURRENT PDF DOCUMENT ===\n${pdfContext}`;

  const recentHistory = chatHistory
    .filter(msg => msg.role !== 'system')
    .slice(-8)
    .map(msg => ({
      role: msg.role === 'ai' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.text }]
    }));

  recentHistory.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const candidateModels = [
    modelPreference || 'gemini-3.6-flash',
    'gemini-3.6-flash',
    'gemini-3.6-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  let rawText = '';
  let lastErr: any = null;
  let successfulModel = '';

  for (const modelName of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents: recentHistory,
        config: {
          systemInstruction: fullSystem,
          temperature: 0.15,
          responseMimeType: 'application/json',
        }
      });
      if (res?.text) {
        rawText = res.text;
        successfulModel = modelName;
        break;
      }
    } catch (err: any) {
      lastErr = err;
      // Try next candidate model on ANY error (404, not found, discontinued, quota, etc.)
      await new Promise(r => setTimeout(r, 150));
      continue;
    }
  }

  if (!rawText) throw lastErr || new Error('Unable to connect to Gemini. Please try again.');
  const parsed = parseAiResponse(rawText);
  parsed.activeModel = successfulModel;
  return parsed;
}

async function processWithGroq(
  chatHistory: ChatMessage[],
  prompt: string,
  pdfData: PdfData,
  apiKey: string,
  model: string
): Promise<AiResult> {
  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  const pdfContext = buildPdfContext(pdfData);
  const fullSystem = `${SYSTEM_PROMPT}\n\n=== CURRENT PDF DOCUMENT ===\n${pdfContext}`;

  const messages: any[] = [
    { role: 'system', content: fullSystem }
  ];

  const recent = chatHistory.filter(m => m.role !== 'system').slice(-8);
  for (const msg of recent) {
    messages.push({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.text
    });
  }
  messages.push({ role: 'user', content: prompt });

  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.15,
    response_format: { type: 'json_object' },
    max_tokens: 4096,
  });

  const text = completion.choices?.[0]?.message?.content || '';
  return parseAiResponse(text);
}

function parseAiResponse(raw: string): AiResult {
  if (!raw || !raw.trim()) {
    return {
      message: 'I received an empty response. Please ask again.',
      action: 'none',
      params: {},
    };
  }

  const cleaned = raw.replace(/^[\s\n]*```(json)?/i, '').replace(/```[\s\n]*$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return {
        message: parsed.message || (typeof parsed.response === 'string' ? parsed.response : cleaned),
        action: parsed.action || 'none',
        params: parsed.params || {},
      };
    }
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === 'object') {
          return {
            message: parsed.message || (typeof parsed.response === 'string' ? parsed.response : cleaned),
            action: parsed.action || 'none',
            params: parsed.params || {},
          };
        }
      } catch {}
    }
  }

  return {
    message: raw.trim(),
    action: 'none',
    params: {},
  };
}

export async function processAIRequest(
  chatHistory: ChatMessage[],
  prompt: string,
  pdfData: PdfData,
  provider: AiProvider,
  geminiKey: string,
  groqKey: string,
  groqModel: string,
  geminiModel?: string
): Promise<AiResult> {
  // 1. Check local instant intent processor first (0ms latency, high reliability)
  const quickResult = detectQuickIntent(prompt, pdfData);
  if (quickResult) {
    return quickResult;
  }

  // 2. Fall back to LLM with Strict Non-Denial System Prompt
  if (provider === 'groq') {
    if (!groqKey) throw new Error('Please enter your Groq API key in Settings.');
    return await processWithGroq(chatHistory, prompt, pdfData, groqKey, groqModel);
  } else {
    if (!geminiKey) throw new Error('Please enter your Gemini API key in Settings.');
    return await processWithGemini(chatHistory, prompt, pdfData, geminiKey, geminiModel);
  }
}

/**
 * Run high-precision Online OCR on a document page image using Gemini Vision (or Groq Vision).
 * Extracts text and normalized bounding box coordinates [ymin, xmin, ymax, xmax].
 */
export async function runOnlineOcr(
  base64Image: string,
  pageWidth: number,
  pageHeight: number,
  provider: AiProvider,
  geminiKey?: string,
  groqKey?: string,
  preferredModel?: string
): Promise<OcrResult> {
  const ocrPrompt = `You are a high-precision OCR and document analysis engine.
Extract all readable text from this scanned/screenshot document image.
Return pure JSON with:
1. "fullText": The complete extracted text, formatted cleanly with headings and lines.
2. "blocks": Array of text lines or key segments with normalized 0-1000 bounding boxes [ymin, xmin, ymax, xmax] (integers between 0 and 1000) so we can locate each text line.

JSON schema:
{
  "fullText": "Full text...",
  "blocks": [
    { "text": "...", "box": [ymin, xmin, ymax, xmax] }
  ]
}`;

  let parsed: any = null;

  if (provider === 'gemini' || (!groqKey && geminiKey)) {
    if (!geminiKey) throw new Error('Please enter your Google Gemini API Key in Settings to run Online OCR.');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const candidateModels = [
      preferredModel || 'gemini-3.6-flash',
      'gemini-3.6-flash',
      'gemini-3.6-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    let lastErr: any = null;
    for (const model of candidateModels) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image,
                  },
                },
                { text: ocrPrompt },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
        if (res?.text) {
          parsed = JSON.parse(res.text);
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (!parsed) throw lastErr || new Error('Online OCR with Gemini Vision failed. Please check your API key.');
  } else if (groqKey) {
    const groq = new Groq({ apiKey: groqKey, dangerouslyAllowBrowser: true });
    const visionModels = ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview'];
    let lastErr: any = null;
    for (const model of visionModels) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: ocrPrompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        });
        const content = completion.choices[0]?.message?.content;
        if (content) {
          parsed = JSON.parse(content);
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (!parsed) throw lastErr || new Error('Online OCR with Groq Vision failed.');
  } else {
    throw new Error('Please configure a Gemini or Groq API key in Settings to use Online OCR.');
  }

  const fullText = parsed?.fullText || '';
  const blocks: OcrBlock[] = Array.isArray(parsed?.blocks) ? parsed.blocks : [];

  // Convert normalized 0-1000 boxes into PDF coordinate space PdfTextItems
  const items: PdfTextItem[] = [];
  for (const b of blocks) {
    if (!b || !b.text) continue;
    const [ymin, xmin, ymax, xmax] = Array.isArray(b.box) && b.box.length === 4 ? b.box : [0, 0, 0, 0];
    const x = (xmin / 1000) * pageWidth;
    const width = Math.max(20, ((xmax - xmin) / 1000) * pageWidth);
    const height = Math.max(10, ((ymax - ymin) / 1000) * pageHeight);
    const y = pageHeight - ((ymax / 1000) * pageHeight); // PDF Y starts from bottom

    items.push({
      str: b.text,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  // Fallback: If blocks bounding boxes were not returned, distribute lines down the page
  if (items.length === 0 && fullText.trim()) {
    const lines = fullText.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const lineSpacing = pageHeight / (lines.length + 2);
    lines.forEach((line: string, idx: number) => {
      items.push({
        str: line,
        x: 40,
        y: pageHeight - ((idx + 1.5) * lineSpacing),
        width: Math.min(pageWidth - 80, line.length * 8),
        height: 14,
      });
    });
  }

  return {
    fullText,
    blocks,
    items,
  };
}

