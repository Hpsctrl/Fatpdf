import type { PdfData } from './pdf';
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
    lines.push(`--- Page ${p.pageNumber} (${p.width.toFixed(0)}x${p.height.toFixed(0)}) ---`);
    lines.push(truncated || '(Image or scan - no raw text)');
    lines.push('');
  }

  if (pdfData.pages.length > maxPages) {
    lines.push(`... and ${pdfData.pages.length - maxPages} more pages.`);
  }

  return lines.join('\n');
}

/**
 * High-Speed Local Intent Pre-Processor (0ms latency, zero denial)
 * Directly handles high-frequency commands, abbreviations, single words, and common typos.
 */
export function detectQuickIntent(prompt: string, pdfData: PdfData): AiResult | null {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  // 1. Page 1 summary / inspect shortcuts
  if (/^(1st\s*pag[e|ge]|1ar\s*pag[e|ge]|first\s*page|page\s*1|p1|cover\s*page)$/i.test(lower) || lower === 'page 1 info') {
    const p1 = pdfData.pages[0];
    const text = p1 ? p1.text.trim() : '';
    if (text) {
      return {
        message: `### Page 1 Summary\n\n${text}\n\n*I can replace any name, roll number, or text here immediately—just tell me what to update!*`,
        action: 'none',
        params: {}
      };
    } else {
      return {
        message: `Page 1 contains visual content. You can click **"Type Text"** or **"Whiteout Box"** to add or edit content directly on top of it.`,
        action: 'none',
        params: {}
      };
    }
  }

  // 2. Change student name shortcut
  const nameMatch = clean.match(/^(?:change\s+)?name(?:\s+to|:)?\s+([A-Za-z\s.'-]+)$/i);
  if (nameMatch && nameMatch[1]) {
    const newName = nameMatch[1].trim();
    const p1Text = pdfData.pages[0]?.text || '';
    const oldNameMatch = p1Text.match(/NAME:\s*([A-Za-z\s.'-]+?)(?:\s+ROLL|\r?\n|$)/i);
    const oldName = oldNameMatch ? oldNameMatch[1].trim() : 'HARENDRA PRATAP SINGH';
    return {
      message: `Updated student name to **${newName}**!`,
      action: 'search_replace',
      params: { find: oldName, replace: newName, targetPage: 1 }
    };
  }

  // 3. Change roll number shortcut
  const rollMatch = clean.match(/^(?:change\s+)?roll(?:\s*no\.?)?(?:\s+to|:)?\s+([A-Za-z0-9-]+)$/i);
  if (rollMatch && rollMatch[1]) {
    const newRoll = rollMatch[1].trim();
    const p1Text = pdfData.pages[0]?.text || '';
    const oldRollMatch = p1Text.match(/ROLL(?:\s*NO\.?)?:\s*([0-9A-Za-z]+)/i);
    const oldRoll = oldRollMatch ? oldRollMatch[1].trim() : '252681';
    return {
      message: `Updated roll number to **${newRoll}**!`,
      action: 'search_replace',
      params: { find: oldRoll, replace: newRoll, targetPage: 1 }
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
  const changeRegex = /(?:in\s+pg\s*(\d+),?\s*)?(?:change|chaneg|replace|replcae|update)\s+([A-Za-z0-9\s:._'-]+?)\s+(?:to|with)\s+([A-Za-z0-9\s:._'-]+)$/i;
  const changeMatch = clean.match(changeRegex);
  if (changeMatch) {
    const targetPage = changeMatch[1] ? parseInt(changeMatch[1], 10) : 1;
    let findVal = changeMatch[2].trim();
    let replaceVal = changeMatch[3].trim();

    // Clean common prefixes from findVal (e.g., "submitted to" -> look for full instructor line on page 1)
    const pText = pdfData.pages[targetPage - 1]?.text || pdfData.pages[0]?.text || '';
    if (findVal.toLowerCase().includes('submitted to')) {
      const teacherMatch = pText.match(/(?:SUBMITTED\s+TO:\s*)([A-Za-z\s.]+)/i);
      if (teacherMatch) {
        findVal = teacherMatch[1].trim(); // e.g. "MRS. VAISHALI" or "MS. AMRITA"
      }
    }

    return {
      message: `Replaced **"${findVal}"** with **"${replaceVal}"** on Page ${targetPage}!`,
      action: 'search_replace',
      params: { find: findVal, replace: replaceVal, targetPage }
    };
  }

  // 9. Confirmations: "ok do it", "yes", "do it", "apply"
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
2. **search_replace** - Search for specific text and replace it with new text across the PDF or target page.
   Params: { "find": "old text", "replace": "new text", "targetPage": 1 (optional) }
3. **add_watermark** - Add text watermark across the document or target pages.
   Params: { "text": "CONFIDENTIAL", "targetPages": [1] (optional), "opacity": 0.22, "angle": -45 }
4. **add_header_footer** - Add banner or header/footer text across all pages.
   Params: { "text": "Header Text", "position": "header"|"footer"|"both" }
5. **add_page_numbers** - Number all pages automatically.
   Params: { "position": "bottom-center"|"bottom-right"|"top-right", "prefix": "Page " }
6. **remove_pages** - Delete specific pages.
   Params: { "pages": [1, 3] }
7. **extract_pages** - Extract pages into a separate document.
   Params: { "pages": [2, 4] }
8. **duplicate_page** - Duplicate a page.
   Params: { "page": 1 }
9. **add_blank_page** - Insert a blank white page.
   Params: { "atIndex": 1 }
10. **reorder_pages** - Reorder pages.
    Params: { "order": [2, 1, 3] }
11. **rotate_pages** - Rotate specific pages by degrees (90, 180, 270).
    Params: { "pages": [1], "degrees": 90 }
12. **merge** - Signal the interface to allow merging another PDF.
    Params: {}

STRICT RELIABILITY, ACTION EXECUTION & NON-DENIAL RULES:
- CRITICAL: WHEN THE USER ASKS TO CHANGE, REPLACE, ROTATE, WATERMARK, OR NUMBER PAGES, DO NOT JUST DESCRIBE IT IN TEXT! YOU MUST SET THE "action" FIELD TO THE RELEVANT TOOL (e.g. "search_replace", "add_watermark", etc.) WITH COMPLETE "params". NEVER SET "action": "none" WHEN A MODIFICATION IS REQUESTED!
- If the user says "ok do it", "apply", "yes", or "confirm", examine the prior conversation context, determine what edit was discussed, and IMMEDIATELY TRIGGER THE ACTION!
- In "search_replace", set "find" to the exact string found in the PDF text (e.g. "MRS. VAISHALI" or "NAME: HARENDRA PRATAP SINGH") and "replace" to the user's desired text.
- NEVER say "I cannot edit this", "this page is an image/scanned", or ask vague clarification questions.
- Always output clean JSON matching:
{
  "message": "Direct explanation of action executed on the document.",
  "action": "search_replace|add_watermark|add_header_footer|add_page_numbers|remove_pages|extract_pages|duplicate_page|add_blank_page|reorder_pages|rotate_pages|merge|none",
  "params": {}
}`;

async function processWithGemini(
  chatHistory: ChatMessage[],
  prompt: string,
  pdfData: PdfData,
  apiKey: string
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
    'gemini-3.6-flash',
    'gemini-3.6-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];

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
  groqModel: string
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
    return await processWithGemini(chatHistory, prompt, pdfData, geminiKey);
  }
}
