import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, Download, Bot, Settings, Loader2, ChevronDown,
  Sparkles, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  FileText, Trash2, RotateCw, Merge, FilePlus2, Stamp,
  Search, Type, Eraser, PenTool, Hash, Copy, Plus,
  FileCode, FileSpreadsheet, Undo2, Redo2, Check, Scissors, Scan,
  Sun, Moon, Monitor, Eye, Smartphone
} from 'lucide-react';
import {
  parsePdfFile, removePages, extractPages, reorderPages, rotatePages,
  addWatermark, addHeaderFooter, addPageNumbers, duplicatePage, addBlankPage,
  searchAndReplaceText, searchAndReplaceTextResult, overlayTextOnPage, redactAreaOnPage, addSignatureToPage,
  mergePdfs, downloadPdf, exportPdfAsTxt, exportPdfAsWord,
  convertImageFileToPdf, extractPageAsBase64Image, changeTextFont
} from './utils/pdf';
import type { PdfData, PdfTextItem, FontOptions } from './utils/pdf';
import { processAIRequest, runOnlineOcr } from './utils/ai';
import type { AiProvider, ChatMessage } from './utils/ai';
import PdfViewer from './components/PdfViewer';
import { SignatureModal } from './components/SignatureModal';

export const APP_VERSION = 'v1.1.0';
export type AppTheme = 'adaptive' | 'light' | 'dark' | 'pearl';

const APPLE_GREETINGS = [
  { word: 'hello', lang: 'English', sub: 'Welcome', isScript: true },
  { word: 'bonjour', lang: 'Français', sub: 'Bienvenue', isScript: true },
  { word: 'hola', lang: 'Español', sub: 'Bienvenido', isScript: true },
  { word: 'ciao', lang: 'Italiano', sub: 'Benvenuto', isScript: true },
  { word: 'hallo', lang: 'Deutsch', sub: 'Willkommen', isScript: true },
  { word: 'olá', lang: 'Português', sub: 'Bem-vindo', isScript: true },
  { word: 'नमस्ते', lang: 'Hindi', sub: 'स्वागत है', isScript: false },
  { word: 'こんにちは', lang: 'Japanese', sub: 'ようこそ', isScript: false },
  { word: '你好', lang: 'Chinese', sub: '欢迎', isScript: false },
  { word: '안녕하세요', lang: 'Korean', sub: '환영합니다', isScript: false },
  { word: 'مرحبا', lang: 'Arabic', sub: 'أهلاً وسهلاً', isScript: false },
  { word: 'привет', lang: 'Russian', sub: 'Добро пожаловать', isScript: false },
];

type ToolCategory = 'ai' | 'edit' | 'pages' | 'export';

/* ─── Formatted Chat Message ─── */
const FormattedChatMessage: React.FC<{ text: string }> = ({ text }) => {
  const parseInline = (line: string) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;
    const regex = /(\*\*.*?\*\*|`.*?`)/;
    while (remaining.length > 0) {
      const match = remaining.match(regex);
      if (!match || match.index === undefined) { parts.push(remaining); break; }
      if (match.index > 0) parts.push(remaining.substring(0, match.index));
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**'))
        parts.push(<strong key={keyIdx++}>{token.slice(2, -2)}</strong>);
      else if (token.startsWith('`') && token.endsWith('`'))
        parts.push(<code key={keyIdx++} className="inline-code">{token.slice(1, -1)}</code>);
      remaining = remaining.substring(match.index + token.length);
    }
    return parts;
  };
  const lines = text.split('\n');
  return (
    <div className="chat-text-content">
      {lines.map((line, idx) => {
        const t = line.trim();
        if (!t) return <div key={idx} style={{ height: '0.4rem' }} />;
        if (t.startsWith('• ') || t.startsWith('- ') || t.startsWith('* '))
          return (
            <div key={idx} style={{ display: 'flex', gap: '6px', marginLeft: '2px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0 }}>•</span>
              <div>{parseInline(t.substring(2))}</div>
            </div>
          );
        return <div key={idx} style={{ marginBottom: '2px' }}>{parseInline(line)}</div>;
      })}
    </div>
  );
};

/* ─── Main App ─── */
const App: React.FC = () => {
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const [fadeLoading, setFadeLoading] = useState(false);

  // Undo / Redo history stack
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [redoStack, setRedoStack] = useState<Uint8Array[]>([]);

  // UI Tabs & Interactive Canvas Tool State
  const [activeTab, setActiveTab] = useState<ToolCategory>('ai');
  const [canvasTool, setCanvasTool] = useState<'select' | 'text' | 'redact'>('select');

  // Modals & Panels
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchFind, setSearchFind] = useState('');
  const [searchReplace, setSearchReplace] = useState('');
  const [searchAllPages, setSearchAllPages] = useState(true);

  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [wmText, setWmText] = useState('HARENDRA PRATAP SINGH 252681');
  const [wmTargetAll, setWmTargetAll] = useState(true);
  const [wmOpacity, setWmOpacity] = useState(0.22);
  const [wmAngle, setWmAngle] = useState(-45);

  const [showPageNumberModal, setShowPageNumberModal] = useState(false);
  const [pnPosition, setPnPosition] = useState<'bottom-center' | 'bottom-right' | 'top-right'>('bottom-center');
  const [pnPrefix, setPnPrefix] = useState('Page ');

  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingTextCoords, setPendingTextCoords] = useState<{ x: number; y: number; pageNum: number } | null>(null);
  const [overlayInputText, setOverlayInputText] = useState('');
  const [whiteoutBeforeAdd, setWhiteoutBeforeAdd] = useState(true);
  const [overlayFontFamily, setOverlayFontFamily] = useState<string>('helvetica');
  const [overlayFontSize, setOverlayFontSize] = useState<number>(14);
  const [overlayIsBold, setOverlayIsBold] = useState<boolean>(true);
  const [overlayIsItalic, setOverlayIsItalic] = useState<boolean>(false);
  const [overlayColor, setOverlayColor] = useState<string>('#000000');

  // AI State
  const [provider, setProvider] = useState<AiProvider>(() => {
    return (localStorage.getItem('ai_pdf_provider') as AiProvider) || 'gemini';
  });
  const [geminiKey, setGeminiKey] = useState(() =>
    localStorage.getItem('ai_pdf_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || ''
  );
  const [groqKey, setGroqKey] = useState(() =>
    localStorage.getItem('ai_pdf_groq_key') || import.meta.env.VITE_GROQ_API_KEY || ''
  );
  const [groqModel, setGroqModel] = useState(() =>
    localStorage.getItem('ai_pdf_groq_model') || 'llama-3.3-70b-versatile'
  );
  const [activeModelName, setActiveModelName] = useState<string>(() =>
    localStorage.getItem('ai_pdf_gemini_model') || 'gemini-3.6-flash'
  );
  const [showSettings, setShowSettings] = useState(false);

  // Theme State (adaptive | light | dark | pearl)
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('ai_pdf_theme') as AppTheme) || 'adaptive';
  });

  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      if (theme === 'adaptive') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', theme);
      }
    };

    applyTheme();

    if (theme === 'adaptive' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
    localStorage.setItem('ai_pdf_theme', newTheme);
  };

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      alert('To install FatPDF as an App:\n\n• On Android (Chrome / Edge): Tap the browser menu (⋮) and select "Install app" or "Add to Home screen".\n• On iPhone (Safari): Tap Share (⎋) and select "Add to Home Screen".\n• On PC/Mac (Chrome/Edge): Click the Install icon in the address bar.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [mergeWaiting, setMergeWaiting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Random Apple Hello greeting chosen on each load
  const [randomGreeting] = useState(() => {
    const idx = Math.floor(Math.random() * APPLE_GREETINGS.length);
    return APPLE_GREETINGS[idx];
  });

  useEffect(() => {
    // Exactly 1.0 second Apple Hello animation (0.8s animated reveal, 0.2s fade)
    const t1 = setTimeout(() => setFadeLoading(true), 800);
    const t2 = setTimeout(() => setIsEntering(false), 1000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, redoStack, pdfData]);

  const updatePdfStateWithHistory = async (newBytes: Uint8Array, actionName?: string) => {
    if (!pdfData) return;
    setHistory(prev => [...prev, pdfData.rawBytes]);
    setRedoStack([]); // Clear redo on fresh action

    const newData = await parsePdfFile(
      new File([newBytes as any], pdfData.fileName, { type: 'application/pdf' })
    );
    setPdfData(newData);
    if (currentPage > newData.totalPages) setCurrentPage(newData.totalPages);

    if (actionName) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `✨ Done: ${actionName}` }]);
    }
  };

  const handleUndo = async () => {
    if (history.length === 0 || !pdfData) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, pdfData.rawBytes]);
    setHistory(prev => prev.slice(0, -1));

    const restored = await parsePdfFile(
      new File([previous as any], pdfData.fileName, { type: 'application/pdf' })
    );
    setPdfData(restored);
    if (currentPage > restored.totalPages) setCurrentPage(restored.totalPages);
    setChatHistory(prev => [...prev, { role: 'ai', text: '↩️ Undid last change.' }]);
  };

  const handleRedo = async () => {
    if (redoStack.length === 0 || !pdfData) return;
    const nextBytes = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, pdfData.rawBytes]);
    setRedoStack(prev => prev.slice(0, -1));

    const restored = await parsePdfFile(
      new File([nextBytes as any], pdfData.fileName, { type: 'application/pdf' })
    );
    setPdfData(restored);
    if (currentPage > restored.totalPages) setCurrentPage(restored.totalPages);
    setChatHistory(prev => [...prev, { role: 'ai', text: '🔁 Redid change.' }]);
  };

  /* ─── Online OCR Handler ─── */
  const handleRunOcr = async (targetPageNum?: number, customData?: PdfData) => {
    const activeDoc = customData || pdfData;
    if (!activeDoc) return;
    const pageNum = targetPageNum || currentPage;
    if (pageNum < 1 || pageNum > activeDoc.totalPages) return;

    try {
      setLoading(true);
      setChatHistory(prev => [
        ...prev,
        { role: 'system', text: `⚡ Running Online OCR on Page ${pageNum} using AI Vision...` }
      ]);

      const { base64 } = await extractPageAsBase64Image(activeDoc.rawBytes, pageNum, 2.0);
      const pageInfo = activeDoc.pages[pageNum - 1];
      const ocrResult = await runOnlineOcr(
        base64,
        pageInfo.width,
        pageInfo.height,
        provider,
        geminiKey,
        groqKey,
        activeModelName
      );

      const updatedPages = [...activeDoc.pages];
      updatedPages[pageNum - 1] = {
        ...pageInfo,
        text: ocrResult.fullText,
        items: ocrResult.items,
        isScanned: false,
        ocrApplied: true,
      };

      const updatedDoc: PdfData = {
        ...activeDoc,
        pages: updatedPages,
      };

      setPdfData(updatedDoc);

      setChatHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: `✅ **Online OCR Completed for Page ${pageNum}!**\n\n**Extracted Document Text:**\n${ocrResult.fullText.substring(0, 350)}${ocrResult.fullText.length > 350 ? '...' : ''}\n\n*Text and coordinate boxes are now indexed. You can search, replace, watermark, or edit text on this image directly!*`
        }
      ]);
    } catch (err: any) {
      let msg = err?.message || String(err);
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        }
      } catch {}
      setChatHistory(prev => [
        ...prev,
        { role: 'ai', text: `❌ Online OCR Notice: ${msg}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  /* ─── File Handling ─── */
  const handleFileUpload = async (file: File) => {
    try {
      setLoading(true);
      let targetFile: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> } = file;
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);

      if (isImg) {
        setChatHistory(prev => [
          ...prev,
          { role: 'system', text: `🖼️ Document image detected ("${file.name}"). Converting to PDF format...` }
        ]);
        const convertedBytes = await convertImageFileToPdf(file);
        const pdfFileName = file.name.replace(/\.[^.]+$/i, '') + '.pdf';
        targetFile = new File([convertedBytes as any], pdfFileName, { type: 'application/pdf' });
      }

      const data = await parsePdfFile(targetFile);
      setPdfData(data);
      setCurrentPage(1);
      setZoom(1.2);
      setHistory([]);
      setRedoStack([]);

      if (isImg) {
        setChatHistory(prev => [
          ...prev,
          { role: 'system', text: `✨ Converted "${file.name}" to document! Running Online OCR to extract text...` }
        ]);
        setTimeout(() => {
          handleRunOcr(1, data);
        }, 120);
      } else {
        const hasScanned = data.pages.some(p => p.isScanned);
        setChatHistory([
          {
            role: 'system',
            text: `Loaded "${data.fileName}" — ${data.totalPages} pages.${hasScanned ? ' 📸 Note: Scanned/image page detected. Indexing Page 1 with Online OCR automatically...' : ''}`
          }
        ]);
        if (hasScanned) {
          setTimeout(() => {
            handleRunOcr(1, data);
          }, 150);
        }
      }
    } catch (err: any) {
      alert('Failed to parse file: ' + (err.message || String(err)));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMergeUpload = async (file: File) => {
    if (!pdfData) return;
    try {
      setLoading(true);
      const arrayBuf = await file.arrayBuffer();
      const otherBytes = new Uint8Array(arrayBuf);
      const merged = await mergePdfs([pdfData.rawBytes, otherBytes]);
      await updatePdfStateWithHistory(merged, `Merged "${file.name}" into document`);
      setMergeWaiting(false);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `Merge failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Search and Replace ─── */
  const handleExecuteSearchReplace = async () => {
    if (!pdfData || !searchFind.trim()) return;
    try {
      setLoading(true);
      const targetPage = searchAllPages ? undefined : currentPage;
      const ocrMap = new Map<number, PdfTextItem[]>();
      pdfData.pages.forEach(p => {
        if (p.items && p.items.length > 0) ocrMap.set(p.pageNumber, p.items);
      });
      const replaceRes = await searchAndReplaceTextResult(
        pdfData.rawBytes,
        searchFind.trim(),
        searchReplace,
        targetPage,
        ocrMap
      );
      if (replaceRes.count === 0) {
        alert(`No matches found for "${searchFind}". If this is a scanned document or screenshot, please click Online OCR first.`);
        return;
      }
      await updatePdfStateWithHistory(
        replaceRes.pdfBytes,
        `Replaced "${searchFind}" with "${searchReplace}" ${targetPage ? `on page ${targetPage}` : 'across all pages'}`
      );
      setShowSearchModal(false);
      setSearchFind('');
      setSearchReplace('');
    } catch (err: any) {
      alert(`Search & Replace error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Watermark Execution ─── */
  const handleExecuteWatermark = async () => {
    if (!pdfData || !wmText.trim()) return;
    try {
      setLoading(true);
      const targetPages = wmTargetAll ? undefined : [currentPage];
      const newBytes = await addWatermark(
        pdfData.rawBytes,
        wmText.trim(),
        targetPages,
        wmOpacity,
        wmAngle
      );
      await updatePdfStateWithHistory(
        newBytes,
        `Added watermark "${wmText}" ${wmTargetAll ? 'on all pages' : `on page ${currentPage}`}`
      );
      setShowWatermarkModal(false);
    } catch (err: any) {
      alert(`Watermark error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Page Numbers Execution ─── */
  const handleExecutePageNumbers = async () => {
    if (!pdfData) return;
    try {
      setLoading(true);
      const newBytes = await addPageNumbers(pdfData.rawBytes, pnPosition, pnPrefix);
      await updatePdfStateWithHistory(newBytes, `Added page numbers (${pnPosition})`);
      setShowPageNumberModal(false);
    } catch (err: any) {
      alert(`Page numbers error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ─── On-Canvas Interaction Handlers ─── */
  const handleCanvasClick = (coords: { x: number; y: number; pageNum: number }) => {
    setPendingTextCoords(coords);
  };

  const handleApplyOverlayText = async () => {
    if (!pdfData || !pendingTextCoords || !overlayInputText.trim()) {
      setPendingTextCoords(null);
      return;
    }
    try {
      setLoading(true);
      const newBytes = await overlayTextOnPage(
        pdfData.rawBytes,
        pendingTextCoords.pageNum,
        pendingTextCoords.x,
        pendingTextCoords.y,
        overlayInputText.trim(),
        overlayFontSize,
        whiteoutBeforeAdd,
        overlayColor,
        overlayFontFamily,
        overlayIsBold,
        overlayIsItalic
      );
      await updatePdfStateWithHistory(
        newBytes,
        `Added text "${overlayInputText}" on page ${pendingTextCoords.pageNum}`
      );
      setPendingTextCoords(null);
      setOverlayInputText('');
      setCanvasTool('select');
    } catch (err: any) {
      alert(`Error inserting text: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBoxSelectedForRedact = async (box: { x: number; y: number; width: number; height: number; pageNum: number }) => {
    if (!pdfData) return;
    try {
      setLoading(true);
      const newBytes = await redactAreaOnPage(pdfData.rawBytes, box.pageNum, box);
      await updatePdfStateWithHistory(newBytes, `Redacted region on page ${box.pageNum}`);
      setCanvasTool('select');
    } catch (err: any) {
      alert(`Redaction error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplySignature = async (signatureDataUrl: string) => {
    if (!pdfData) return;
    try {
      setLoading(true);
      const box = { x: 120, y: 150, width: 180, height: 70 };
      const newBytes = await addSignatureToPage(pdfData.rawBytes, currentPage, signatureDataUrl, box);
      await updatePdfStateWithHistory(newBytes, `Stamped signature on page ${currentPage}`);
    } catch (err: any) {
      alert(`Signature error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ─── AI Chat & Unified Action Dispatcher ─── */
  const applyAction = async (action: string, params: Record<string, any>, customDoc?: PdfData) => {
    if (action === 'set_theme') {
      const targetTheme = (params.theme || 'dark') as AppTheme;
      handleThemeChange(targetTheme);
      return;
    }
    const docToUse = customDoc || pdfData;
    if (!docToUse) return;
    try {
      setLoading(true);
      let newBytes: Uint8Array;

      switch (action) {
        case 'set_theme':
          handleThemeChange((params.theme || 'dark') as AppTheme);
          return;
        case 'run_ocr':
          await handleRunOcr(params.page || currentPage, docToUse);
          return;
        case 'change_font': {
          const ocrMap = new Map<number, PdfTextItem[]>();
          docToUse.pages.forEach(p => {
            if (p.items && p.items.length > 0) ocrMap.set(p.pageNumber, p.items);
          });
          const target = params.targetText || params.text || params.find || '';
          newBytes = await changeTextFont(
            docToUse.rawBytes,
            target,
            {
              family: params.fontFamily || params.family,
              size: params.fontSize || params.size,
              bold: params.bold,
              italic: params.italic,
              color: params.color
            },
            params.targetPage,
            ocrMap
          );
          break;
        }
        case 'batch_replace':
        case 'search_replace': {
          const ocrMap = new Map<number, PdfTextItem[]>();
          docToUse.pages.forEach(p => {
            if (p.items && p.items.length > 0) ocrMap.set(p.pageNumber, p.items);
          });

          const replacements: Array<{
            find: string;
            replace: string;
            targetPage?: number;
            fontFamily?: string;
            fontSize?: number;
            bold?: boolean;
            italic?: boolean;
            color?: string;
          }> = params.replacements && Array.isArray(params.replacements) && params.replacements.length > 0
            ? params.replacements
            : [{
                find: params.find || '',
                replace: params.replace || '',
                targetPage: params.targetPage || (params.allPages ? undefined : currentPage),
                fontFamily: params.fontFamily || params.family,
                fontSize: params.fontSize || params.size,
                bold: params.bold,
                italic: params.italic,
                color: params.color
              }];

          let currentBytes = docToUse.rawBytes;
          let anyReplaced = 0;

          for (const rep of replacements) {
            if (!rep.find && !rep.replace) continue;
            const targetP = rep.targetPage || (params.allPages ? undefined : currentPage);

            // Auto OCR safety net: if target page is scanned and not yet indexed, run OCR on the fly!
            if (targetP && docToUse.pages[targetP - 1]?.isScanned && (!ocrMap.has(targetP) || ocrMap.get(targetP)!.length === 0)) {
              try {
                const { base64 } = await extractPageAsBase64Image(currentBytes, targetP, 2.0);
                const pageInfo = docToUse.pages[targetP - 1];
                const ocrResult = await runOnlineOcr(
                  base64,
                  pageInfo.width,
                  pageInfo.height,
                  provider,
                  geminiKey,
                  groqKey,
                  activeModelName
                );
                ocrMap.set(targetP, ocrResult.items);
                docToUse.pages[targetP - 1].items = ocrResult.items;
                docToUse.pages[targetP - 1].ocrApplied = true;
                docToUse.pages[targetP - 1].text = ocrResult.fullText;
              } catch (e) {
                console.warn('Auto OCR on-the-fly warning:', e);
              }
            }

            const replaceRes = await searchAndReplaceTextResult(
              currentBytes,
              rep.find,
              rep.replace,
              targetP,
              ocrMap,
              {
                family: rep.fontFamily || params.fontFamily || params.family,
                size: rep.fontSize || params.fontSize || params.size,
                bold: rep.bold !== undefined ? rep.bold : params.bold,
                italic: rep.italic !== undefined ? rep.italic : params.italic,
                color: rep.color || params.color
              }
            );

            if (replaceRes.count > 0) {
              currentBytes = replaceRes.pdfBytes;
              anyReplaced += replaceRes.count;
            }
          }

          if (anyReplaced === 0) {
            setChatHistory(prev => [
              ...prev.slice(0, -1),
              {
                role: 'ai',
                text: `⚠️ Could not find matches for requested replacements on Page ${params.targetPage || currentPage}.`
              }
            ]);
            return;
          }
          newBytes = currentBytes;
          break;
        }
        case 'add_watermark':
          newBytes = await addWatermark(
            docToUse.rawBytes,
            params.text || 'CONFIDENTIAL',
            params.targetPages,
            params.opacity || 0.22,
            params.angle || -45
          );
          break;
        case 'add_header_footer':
          newBytes = await addHeaderFooter(
            docToUse.rawBytes,
            params.text || '',
            params.position || 'header',
            params.fontSize || 10
          );
          break;
        case 'add_page_numbers':
          newBytes = await addPageNumbers(
            docToUse.rawBytes,
            params.position || 'bottom-center',
            params.prefix || 'Page '
          );
          break;
        case 'remove_pages':
          newBytes = await removePages(docToUse.rawBytes, params.pages || [currentPage]);
          break;
        case 'extract_pages':
          newBytes = await extractPages(docToUse.rawBytes, params.pages || [currentPage]);
          break;
        case 'duplicate_page':
          newBytes = await duplicatePage(docToUse.rawBytes, params.page || currentPage);
          break;
        case 'add_blank_page':
          newBytes = await addBlankPage(docToUse.rawBytes, params.atIndex);
          break;
        case 'reorder_pages':
          newBytes = await reorderPages(docToUse.rawBytes, params.order);
          break;
        case 'rotate_pages':
          newBytes = await rotatePages(docToUse.rawBytes, params.pages || [currentPage], params.degrees || 90);
          break;
        case 'merge':
          setMergeWaiting(true);
          return;
        default:
          return;
      }

      await updatePdfStateWithHistory(newBytes);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: 'ai', text: `Action error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userMsg = prompt.trim();
    setPrompt('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);

    if (!pdfData) {
      setTimeout(() => {
        setChatHistory(prev => [...prev, { role: 'ai', text: 'Please upload a PDF file first so I can assist you with it!' }]);
      }, 200);
      return;
    }

    try {
      setLoading(true);
      await new Promise(r => setTimeout(r, 40));

      let currentDoc = pdfData;
      const currPageInfo = pdfData.pages[currentPage - 1];
      if (currPageInfo?.isScanned && !currPageInfo?.ocrApplied) {
        try {
          setChatHistory(prev => [
            ...prev,
            { role: 'system', text: `📸 Image/scanned page detected. Running Online OCR so AI can read and edit it...` }
          ]);
          const { base64 } = await extractPageAsBase64Image(pdfData.rawBytes, currentPage, 2.0);
          const ocrResult = await runOnlineOcr(
            base64,
            currPageInfo.width,
            currPageInfo.height,
            provider,
            geminiKey,
            groqKey,
            activeModelName
          );
          const updatedPages = [...pdfData.pages];
          updatedPages[currentPage - 1] = {
            ...currPageInfo,
            text: ocrResult.fullText,
            items: ocrResult.items,
            isScanned: false,
            ocrApplied: true,
          };
          currentDoc = { ...pdfData, pages: updatedPages };
          setPdfData(currentDoc);
        } catch (ocrErr) {
          console.warn('Auto OCR before AI prompt warning:', ocrErr);
        }
      }
      
      const result = await processAIRequest(
        chatHistory, userMsg, currentDoc, provider, geminiKey, groqKey, groqModel, activeModelName
      );

      if (result.activeModel) {
        setActiveModelName(result.activeModel);
      }

      setChatHistory(prev => [...prev, { role: 'ai', text: result.message }]);

      if (result.action && result.action !== 'none') {
        await applyAction(result.action, result.params, currentDoc);
      }
    } catch (err: any) {
      let errorMsg = err.message || String(err);
      const lower = errorMsg.toLowerCase();
      if (lower.includes('429') || lower.includes('quota'))
        errorMsg = 'Rate limit reached. Please wait ~30 seconds before trying again.';
      else if (lower.includes('503') || lower.includes('overloaded'))
        errorMsg = 'AI service is temporarily busy. Please try again.';
      
      setChatHistory(prev => [...prev, { role: 'ai', text: `Notice: ${errorMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    if (!pdfData) return;
    const exportName = pdfData.fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
    downloadPdf(pdfData.rawBytes, exportName);
  };

  /* ─── Drag & Drop ─── */
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(true); };
  const onDragLeave = () => setIsDragActive(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
      if (isPdf || isImg) {
        await handleFileUpload(file);
      }
    }
  };

  return (
    <>
      {isEntering && (
        <div className={`loading-screen ${fadeLoading ? 'fade-out' : ''}`}>
          <div className="apple-hello-stage">
            <div className="apple-ambient-glow" />
            <div className={`apple-hello-text ${randomGreeting.isScript ? 'apple-script' : 'apple-universal'}`}>
              {randomGreeting.word}
            </div>
            <svg className="apple-hello-stroke" viewBox="0 0 220 22" fill="none">
              <path
                d="M 12 14 Q 75 4, 130 14 T 208 8"
                stroke="url(#appleUnderlineGrad)"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="appleUnderlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="50%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
            </svg>
            <div className="apple-lang-badge">
              <span className="apple-dot" />
              <span>{randomGreeting.lang} • {randomGreeting.sub}</span>
            </div>
          </div>
        </div>
      )}
      <div className="app-container">
        <main className="main-content glass-panel">
          <header className="app-header">
            <div className="logo">
              <FileText size={22} />
              <span className="logo-title">FatPDF</span>
            </div>

            <div className="header-actions">
              {/* Theme Switcher Toggle (Adaptive, Light, Dark, Pearl) */}
              <div className="theme-toggle-group" title="Theme (Adaptive, Light, Dark, Pearl)">
                <button
                  className={`theme-btn ${theme === 'adaptive' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('adaptive')}
                  title="Adaptive (Sync with OS)"
                  aria-label="Adaptive Mode"
                >
                  <Monitor size={14} />
                </button>
                <button
                  className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                  title="Light Mode"
                  aria-label="Light Mode"
                >
                  <Sun size={14} />
                </button>
                <button
                  className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                  title="Dark Mode"
                  aria-label="Dark Mode"
                >
                  <Moon size={14} />
                </button>
                <button
                  className={`theme-btn ${theme === 'pearl' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('pearl')}
                  title="Pearl Mode (Eye-Care Warm Sepia)"
                  aria-label="Pearl Mode"
                >
                  <Eye size={14} />
                </button>
              </div>

              {pdfData && (
                <>
                  <div className="file-info-badge hide-mobile">
                    <span className="file-name">{pdfData.fileName}</span>
                    <span>{pdfData.totalPages} pg</span>
                  </div>

                  <button
                    className="btn-icon"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 size={15} />
                  </button>
                  <button
                    className="btn-icon"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 size={15} />
                  </button>
                </>
              )}

              <button className="btn-icon" onClick={handleInstallApp} title="Install FatPDF Web App">
                <Smartphone size={16} />
              </button>

              <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
                <Settings size={16} />
              </button>

              {pdfData && (
                <>
                  <button className="btn-icon hide-mobile" onClick={() => { setPdfData(null); setChatHistory([]); setCurrentPage(1); }} title="New Document">
                    <FilePlus2 size={15} />
                  </button>
                  <button className="btn btn-sm" onClick={handleExportPdf} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                    <Download size={14} /> <span className="hide-mobile">Export</span>
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Feature Category Tabs */}
          {pdfData && (
            <div className="tool-tabs-bar">
              <button
                className={`tool-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                <Sparkles size={14} /> AI Assistant
              </button>
              <button
                className={`tool-tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
                onClick={() => setActiveTab('edit')}
              >
                <Type size={14} /> Edit & Redact
              </button>
              <button
                className={`tool-tab-btn ${activeTab === 'pages' ? 'active' : ''}`}
                onClick={() => setActiveTab('pages')}
              >
                <Scissors size={14} /> Page Tools
              </button>
              <button
                className={`tool-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
                onClick={() => setActiveTab('export')}
              >
                <FileCode size={14} /> Convert & Export
              </button>
            </div>
          )}

          {/* Quick Action Shelves per Tab */}
          {pdfData && activeTab === 'edit' && (
            <div className="action-shelf">
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tools:</span>
              <button
                className={`btn btn-secondary ${canvasTool === 'select' ? 'btn-icon active' : ''}`}
                onClick={() => setCanvasTool('select')}
                style={{ padding: '4px 10px' }}
              >
                Cursor / Pan
              </button>
              <button
                className={`btn btn-secondary ${canvasTool === 'text' ? 'btn-icon active' : ''}`}
                onClick={() => setCanvasTool('text')}
                style={{ padding: '4px 10px' }}
                title="Click anywhere on the document canvas to type text"
              >
                <Type size={14} /> Click to Add Text
              </button>
              <button
                className={`btn btn-secondary ${canvasTool === 'redact' ? 'btn-icon active' : ''}`}
                onClick={() => setCanvasTool('redact')}
                style={{ padding: '4px 10px' }}
                title="Drag a rectangle over sensitive text to white it out"
              >
                <Eraser size={14} /> Whiteout / Redact Box
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSearchModal(true)}
                style={{ padding: '4px 10px' }}
              >
                <Search size={14} /> Find & Replace Text
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowWatermarkModal(true)}
                style={{ padding: '4px 10px' }}
              >
                <Stamp size={14} /> Watermark
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSignatureModal(true)}
                style={{ padding: '4px 10px' }}
              >
                <PenTool size={14} /> Sign Document
              </button>
              <button
                className={`btn btn-secondary ${pdfData.pages[currentPage - 1]?.ocrApplied ? 'active' : ''}`}
                onClick={() => handleRunOcr(currentPage)}
                style={{ padding: '4px 10px' }}
                title="Extract and edit text from scanned or screenshot pages using Online OCR"
              >
                <Scan size={14} /> {pdfData.pages[currentPage - 1]?.ocrApplied ? 'OCR Done' : 'Online OCR'}
              </button>
            </div>
          )}

          {pdfData && activeTab === 'pages' && (
            <div className="action-shelf">
              <button
                className="btn btn-secondary"
                onClick={() => setShowPageNumberModal(true)}
                style={{ padding: '4px 10px' }}
              >
                <Hash size={14} /> Number All Pages
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => applyAction('duplicate_page', { page: currentPage })}
                style={{ padding: '4px 10px' }}
              >
                <Copy size={14} /> Duplicate Page {currentPage}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => applyAction('add_blank_page', { atIndex: currentPage })}
                style={{ padding: '4px 10px' }}
              >
                <Plus size={14} /> Insert Blank Page
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => applyAction('rotate_pages', { pages: [currentPage], degrees: 90 })}
                style={{ padding: '4px 10px' }}
              >
                <RotateCw size={14} /> Rotate Current Page
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const allPages = Array.from({ length: pdfData.totalPages }, (_, i) => i + 1);
                  applyAction('rotate_pages', { pages: allPages, degrees: 90 });
                }}
                style={{ padding: '4px 10px' }}
              >
                <RotateCw size={14} /> Rotate ALL Pages
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setMergeWaiting(true)}
                style={{ padding: '4px 10px' }}
              >
                <Merge size={14} /> Merge Another PDF
              </button>
            </div>
          )}

          {pdfData && activeTab === 'export' && (
            <div className="action-shelf">
              <button
                className="btn btn-secondary"
                onClick={() => exportPdfAsTxt(pdfData)}
                style={{ padding: '4px 10px' }}
              >
                <FileText size={14} /> Export to Text (.txt)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportPdfAsWord(pdfData)}
                style={{ padding: '4px 10px' }}
              >
                <FileSpreadsheet size={14} /> Export to Word (.doc)
              </button>
              <button
                className="btn"
                onClick={handleExportPdf}
                style={{ padding: '4px 12px' }}
              >
                <Download size={14} /> Download Modified PDF
              </button>
            </div>
          )}

          {!pdfData ? (
            <div
              className={`upload-container ${isDragActive ? 'drag-active' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon-circle">
                <UploadCloud size={32} color="var(--primary)" />
              </div>
              <h2 className="upload-title">
                Upload PDF or Document Image
              </h2>
              <p className="upload-subtitle">
                Drag & drop or tap to browse PDF, PNG, JPG, or Screenshots
              </p>
              <div className="upload-btn-hint">
                <FilePlus2 size={15} /> Select Document
              </div>
              <div className="upload-formats-row">
                <span className="upload-format-tag">PDF</span>
                <span className="upload-format-tag">PNG</span>
                <span className="upload-format-tag">JPG</span>
                <span className="upload-format-tag">Screenshots</span>
                <span className="upload-format-tag">Scans</span>
              </div>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="pdf-viewer-container">
              <div className="pdf-toolbar">
                <div className="pdf-toolbar-nav">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                    <ChevronLeft size={15} />
                  </button>
                  <span>{currentPage} / {pdfData.totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(pdfData.totalPages, p + 1))} disabled={currentPage >= pdfData.totalPages}>
                    <ChevronRight size={15} />
                  </button>
                  <div style={{ width: 1, height: 16, background: 'var(--panel-border)' }} />
                  <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} title="Zoom Out">
                    <ZoomOut size={14} />
                  </button>
                  <span className="zoom-display">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom In">
                    <ZoomIn size={14} />
                  </button>
                </div>

                <div className="pdf-toolbar-tools">
                  <button
                    className={canvasTool === 'text' ? 'active-tool' : ''}
                    onClick={() => setCanvasTool(t => t === 'text' ? 'select' : 'text')}
                    title="Click on canvas to type text"
                  >
                    <Type size={14} /> Type Text
                  </button>
                  <button
                    className={canvasTool === 'redact' ? 'active-tool' : ''}
                    onClick={() => setCanvasTool(t => t === 'redact' ? 'select' : 'redact')}
                    title="Draw whiteout box over content"
                  >
                    <Eraser size={14} /> Whiteout
                  </button>
                  <button
                    className={pdfData.pages[currentPage - 1]?.ocrApplied ? 'active-tool' : ''}
                    onClick={() => handleRunOcr(currentPage)}
                    title="Run Online OCR on this page to recognize and edit image text"
                    disabled={loading}
                  >
                    <Scan size={14} /> {pdfData.pages[currentPage - 1]?.ocrApplied ? 'OCR Done' : 'Online OCR'}
                  </button>
                  <button
                    onClick={() => setShowWatermarkModal(true)}
                    title="Add Watermark"
                  >
                    <Stamp size={14} /> Watermark
                  </button>
                  <button
                    onClick={() => setShowSearchModal(true)}
                    title="Find and replace text"
                  >
                    <Search size={14} /> Replace
                  </button>
                  <button
                    onClick={() => {
                      if (pdfData.totalPages <= 1) return;
                      if (window.confirm(`Delete page ${currentPage}?`)) {
                        applyAction('remove_pages', { pages: [currentPage] });
                        setChatHistory(prev => [...prev, { role: 'ai', text: `Removed page ${currentPage}.` }]);
                      }
                    }}
                    title="Delete Current Page"
                    disabled={pdfData.totalPages <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {pdfData.pages[currentPage - 1]?.isScanned && !pdfData.pages[currentPage - 1]?.ocrApplied && (
                <div className="scanned-page-banner">
                  <span>📸 Scanned or screenshot image detected on Page {currentPage}. Run Online OCR to extract and edit its text.</span>
                  <button className="btn-banner-action" onClick={() => handleRunOcr(currentPage)} disabled={loading}>
                    <Scan size={14} /> Run Online OCR
                  </button>
                </div>
              )}

              {canvasTool !== 'select' && (
                <div style={{
                  padding: '6px 12px',
                  background: '#eef2ff',
                  borderBottom: '1px solid #c7d2fe',
                  fontSize: '0.8rem',
                  color: 'var(--primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>
                    {canvasTool === 'text' ? '📍 Click anywhere on the document page to type text' : '✂️ Drag a box on the document to white out text/images'}
                  </span>
                  <button
                    onClick={() => setCanvasTool('select')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Done / Exit Tool
                  </button>
                </div>
              )}

              <PdfViewer
                pdfBytes={pdfData.rawBytes}
                currentPage={currentPage}
                zoom={zoom}
                activeTool={canvasTool}
                onCanvasClick={handleCanvasClick}
                onBoxSelected={handleBoxSelectedForRedact}
              />

              {pdfData.totalPages > 1 && (
                <div className="page-thumbs-bar">
                  {Array.from({ length: pdfData.totalPages }, (_, i) => i + 1).map(pn => (
                    <div
                      key={pn}
                      className={`page-thumb ${pn === currentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pn)}
                    >
                      {pn}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Mobile FAB */}
        <button className="mobile-chat-fab" onClick={() => setIsMobileChatOpen(true)} aria-label="Open AI Assistant">
          <Bot size={18} />
          <span>Ask AI</span>
          {loading && <Loader2 size={14} className="spin" />}
        </button>
        {isMobileChatOpen && <div className="mobile-chat-backdrop" onClick={() => setIsMobileChatOpen(false)} />}

        {/* AI Sidebar */}
        <aside className={`sidebar glass-panel ${isMobileChatOpen ? 'mobile-open' : ''}`}>
          <div className="chat-container">
            <div className="chat-header">
              <div className="chat-header-info">
                <div className="chat-avatar-badge">
                  <Bot size={17} color="#fff" />
                </div>
                <div>
                  <div className="chat-title">AI PDF Assistant</div>
                  <div className="chat-status">
                    <span className="online-dot" />
                    {provider === 'gemini' ? (activeModelName || 'Gemini 3.6 Flash') : `Groq · ${groqModel.split('-').slice(0,2).join('-')}`}
                  </div>
                </div>
              </div>
              <button className="chat-close-btn" onClick={() => setIsMobileChatOpen(false)} title="Close Chat">
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="messages">
              {chatHistory.length === 0 && (
                <div className="message ai">
                  <div style={{ marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
                    <Sparkles size={16} color="var(--primary)" /> How can I help with your PDF?
                  </div>
                  Upload a document, then ask me to summarize it, find answers, replace text, change fonts, add watermarks, remove pages, or reorder pages.
                  {pdfData && (
                    <div className="quick-suggestions">
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Summarize this document')}>📝 Summarize</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Change name on page 1 to Harendra Pratap Singh')}>✏️ Change Name</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Change font of name to Times Roman Bold 16')}>🔤 Edit Font</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Add watermark Harendra Pratap Singh ERP 252681 on page 1 only')}>💧 Watermark Page 1</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Add page numbers at bottom')}>🔢 Number Pages</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Switch to dark mode')}>🌙 Dark Mode</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Switch to pearl mode')}>📜 Pearl Mode</button>
                    </div>
                  )}
                </div>
              )}
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  {msg.role === 'ai' ? <FormattedChatMessage text={msg.text} /> : msg.text}
                </div>
              ))}
              {loading && (
                <div className="message ai">
                  <div className="typing-indicator">
                    <div className="dot" /><div className="dot" /><div className="dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {mergeWaiting && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--primary-light)', borderTop: '1px solid var(--panel-border)' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  <Merge size={14} /> Select a PDF to merge:
                </div>
                <button className="btn" onClick={() => mergeInputRef.current?.click()} style={{ width: '100%' }}>
                  <UploadCloud size={16} /> Choose PDF File
                </button>
                <input
                  type="file"
                  accept=".pdf"
                  ref={mergeInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleMergeUpload(f);
                  }}
                />
              </div>
            )}

            {pdfData && (
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '6px 12px', background: 'var(--card-bg)', borderTop: '1px solid var(--panel-border)', whiteSpace: 'nowrap' }}>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt(`Online OCR on Page ${currentPage}`)}>⚡ Online OCR</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Summarize Page 1')}>📑 Page 1 Info</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Change student name on page 1 to Harendra Pratap Singh')}>✏️ Change Name</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Change font of name to Times Roman Bold 16')}>🔤 Change Font</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Number all pages at bottom-center')}>🔢 Page Numbers</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Switch to dark mode')}>🌙 Dark Mode</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Switch to pearl mode')}>📜 Pearl Mode</button>
              </div>
            )}
            <form className="chat-input-wrapper" onSubmit={handleSendPrompt}>
              <input
                type="text"
                className="chat-input"
                placeholder={pdfData ? "Ask AI or give command (e.g. Change name to...)" : "Upload a PDF first..."}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
              />
              <button type="submit" className="send-btn" disabled={loading || !prompt.trim()}>
                {loading ? <Loader2 size={16} className="spin" /> : '➤'}
              </button>
            </form>
          </div>
        </aside>

        {/* ─── MODALS ─── */}

        {/* On-Canvas Text Input Dialog */}
        {pendingTextCoords && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPendingTextCoords(null); }}>
            <div className="modal" style={{ width: 400 }}>
              <h2 className="modal-title">Insert Text</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Inserting on Page {pendingTextCoords.pageNum} at ({pendingTextCoords.x}, {pendingTextCoords.y})
              </p>
              <div className="form-group">
                <label>Text to Add:</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. HARENDRA PRATAP SINGH"
                  value={overlayInputText}
                  onChange={(e) => setOverlayInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyOverlayText(); }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Font:</label>
                  <select
                    value={overlayFontFamily}
                    onChange={(e) => setOverlayFontFamily(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value="helvetica">Helvetica (Sans)</option>
                    <option value="times">Times Roman (Serif)</option>
                    <option value="courier">Courier (Mono)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Size (pt):</label>
                  <input
                    type="number"
                    min="8"
                    max="72"
                    value={overlayFontSize}
                    onChange={(e) => setOverlayFontSize(Math.max(6, parseInt(e.target.value, 10) || 12))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-secondary ${overlayIsBold ? 'active' : ''}`}
                    onClick={() => setOverlayIsBold(b => !b)}
                    style={{ fontWeight: 800, padding: '4px 10px', fontSize: '0.85rem' }}
                    title="Toggle Bold"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${overlayIsItalic ? 'active' : ''}`}
                    onClick={() => setOverlayIsItalic(i => !i)}
                    style={{ fontStyle: 'italic', padding: '4px 10px', fontSize: '0.85rem' }}
                    title="Toggle Italic"
                  >
                    I
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Color:</span>
                  <input
                    type="color"
                    value={overlayColor}
                    onChange={(e) => setOverlayColor(e.target.value)}
                    style={{ width: 34, height: 30, padding: 0, border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="whiteoutCheck"
                  checked={whiteoutBeforeAdd}
                  onChange={(e) => setWhiteoutBeforeAdd(e.target.checked)}
                />
                <label htmlFor="whiteoutCheck" style={{ fontSize: '0.8rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                  White out area underneath (cover existing text)
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setPendingTextCoords(null)}>Cancel</button>
                <button className="btn" onClick={handleApplyOverlayText} disabled={!overlayInputText.trim()}>
                  <Check size={14} /> Place Text
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Find & Replace Modal */}
        {showSearchModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSearchModal(false); }}>
            <div className="modal" style={{ width: 420 }}>
              <h2 className="modal-title">Find & Replace Text</h2>
              <div className="form-group">
                <label>Find Text:</label>
                <input
                  type="text"
                  placeholder="e.g. ALOK KUMAR MISHRA"
                  value={searchFind}
                  onChange={(e) => setSearchFind(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Replace With:</label>
                <input
                  type="text"
                  placeholder="e.g. HARENDRA PRATAP SINGH"
                  value={searchReplace}
                  onChange={(e) => setSearchReplace(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="allPagesCheck"
                  checked={searchAllPages}
                  onChange={(e) => setSearchAllPages(e.target.checked)}
                />
                <label htmlFor="allPagesCheck" style={{ fontSize: '0.82rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                  Replace across all {pdfData?.totalPages} pages (unchecked = current page only)
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowSearchModal(false)}>Cancel</button>
                <button className="btn" onClick={handleExecuteSearchReplace} disabled={!searchFind.trim()}>
                  <Check size={14} /> Replace Text
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Watermark Modal */}
        {showWatermarkModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowWatermarkModal(false); }}>
            <div className="modal" style={{ width: 420 }}>
              <h2 className="modal-title">Add Watermark</h2>
              <div className="form-group">
                <label>Watermark Text:</label>
                <input
                  type="text"
                  placeholder="e.g. CONFIDENTIAL"
                  value={wmText}
                  onChange={(e) => setWmText(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Opacity ({Math.round(wmOpacity * 100)}%):</label>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={wmOpacity}
                  onChange={(e) => setWmOpacity(parseFloat(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Angle ({wmAngle}°):</label>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  step="15"
                  value={wmAngle}
                  onChange={(e) => setWmAngle(parseInt(e.target.value))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="wmAllCheck"
                  checked={wmTargetAll}
                  onChange={(e) => setWmTargetAll(e.target.checked)}
                />
                <label htmlFor="wmAllCheck" style={{ fontSize: '0.82rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                  Apply to all {pdfData?.totalPages} pages (unchecked = Page {currentPage} only)
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowWatermarkModal(false)}>Cancel</button>
                <button className="btn" onClick={handleExecuteWatermark} disabled={!wmText.trim()}>
                  <Check size={14} /> Apply Watermark
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Numbers Modal */}
        {showPageNumberModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPageNumberModal(false); }}>
            <div className="modal" style={{ width: 400 }}>
              <h2 className="modal-title">Number All Pages</h2>
              <div className="form-group">
                <label>Position:</label>
                <select
                  value={pnPosition}
                  onChange={(e) => setPnPosition(e.target.value as any)}
                >
                  <option value="bottom-center">Bottom Center (Page 1 of N)</option>
                  <option value="bottom-right">Bottom Right (Page 1 of N)</option>
                  <option value="top-right">Top Right (Page 1 of N)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Prefix:</label>
                <input
                  type="text"
                  placeholder="e.g. Page "
                  value={pnPrefix}
                  onChange={(e) => setPnPrefix(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowPageNumberModal(false)}>Cancel</button>
                <button className="btn" onClick={handleExecutePageNumbers}>
                  <Check size={14} /> Number Pages
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Signature Modal */}
        <SignatureModal
          isOpen={showSignatureModal}
          onClose={() => setShowSignatureModal(false)}
          onSave={handleApplySignature}
        />

        {/* Settings Modal */}
        {showSettings && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
            <div className="modal">
              <h2 className="modal-title">Settings</h2>

              <div style={{ marginBottom: '1.2rem', padding: '10px 12px', background: 'var(--bg-color)', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Smartphone size={15} color="var(--primary)" /> Install Web App (PWA)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Install FatPDF on your device for fullscreen & offline use
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleInstallApp}
                    style={{ padding: '5px 12px', fontSize: '0.76rem', whiteSpace: 'nowrap' }}
                  >
                    Install
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                  UI Theme Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  <button
                    type="button"
                    className={`btn btn-secondary ${theme === 'adaptive' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('adaptive')}
                    style={{ fontSize: '0.78rem', padding: '6px 8px', justifyContent: 'flex-start' }}
                  >
                    <Monitor size={14} /> Adaptive (OS)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                    style={{ fontSize: '0.78rem', padding: '6px 8px', justifyContent: 'flex-start' }}
                  >
                    <Sun size={14} /> Light Mode
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                    style={{ fontSize: '0.78rem', padding: '6px 8px', justifyContent: 'flex-start' }}
                  >
                    <Moon size={14} /> Dark Mode
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${theme === 'pearl' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('pearl')}
                    style={{ fontSize: '0.78rem', padding: '6px 8px', justifyContent: 'flex-start' }}
                  >
                    <Eye size={14} /> Pearl Mode (Eye Care)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>AI Provider</label>
                <div className="provider-toggle">
                  <button className={provider === 'gemini' ? 'active' : ''} onClick={() => { setProvider('gemini'); localStorage.setItem('ai_pdf_provider', 'gemini'); }}>
                    ✨ Gemini Flash
                  </button>
                  <button className={provider === 'groq' ? 'active' : ''} onClick={() => { setProvider('groq'); localStorage.setItem('ai_pdf_provider', 'groq'); }}>
                    ⚡ Groq (Free)
                  </button>
                </div>
              </div>

              {provider === 'gemini' ? (
                <>
                  <div className="form-group">
                    <label>Google Gemini API Key</label>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      value={geminiKey}
                      onChange={(e) => { setGeminiKey(e.target.value); localStorage.setItem('ai_pdf_gemini_key', e.target.value); }}
                    />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                      Free key from{' '}
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                        Google AI Studio
                      </a>
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Gemini Model</label>
                    <select
                      value={activeModelName}
                      onChange={(e) => {
                        setActiveModelName(e.target.value);
                        localStorage.setItem('ai_pdf_gemini_model', e.target.value);
                      }}
                    >
                      <option value="gemini-3.6-flash">Gemini 3.6 Flash (Primary, Recommended)</option>
                      <option value="gemini-3.6-flash-lite">Gemini 3.6 Flash-Lite (Fast)</option>
                      <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest Preview)</option>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Groq API Key</label>
                    <input
                      type="password"
                      placeholder="gsk_..."
                      value={groqKey}
                      onChange={(e) => { setGroqKey(e.target.value); localStorage.setItem('ai_pdf_groq_key', e.target.value); }}
                    />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                      Free key from{' '}
                      <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                        Groq Console
                      </a>
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Groq Model</label>
                    <select
                      value={groqModel}
                      onChange={(e) => { setGroqModel(e.target.value); localStorage.setItem('ai_pdf_groq_model', e.target.value); }}
                    >
                      <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Best, Free)</option>
                      <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (Fastest, Free)</option>
                      <option value="gemma2-9b-it">Gemma 2 9B (Free)</option>
                      <option value="mixtral-8x7b-32768">Mixtral 8x7B (Free)</option>
                    </select>
                  </div>
                </>
              )}

              <button className="btn" onClick={() => setShowSettings(false)} style={{ width: '100%', marginTop: '0.5rem' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
