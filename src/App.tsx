import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, Download, Bot, Settings, Loader2, ChevronDown,
  Sparkles, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  FileText, Trash2, RotateCw, Merge, FilePlus2, Stamp,
  Search, Type, Eraser, PenTool, Hash, Copy, Plus,
  FileCode, FileSpreadsheet, Undo2, Redo2, Check, Scissors
} from 'lucide-react';
import {
  parsePdfFile, removePages, extractPages, reorderPages, rotatePages,
  addWatermark, addHeaderFooter, addPageNumbers, duplicatePage, addBlankPage,
  searchAndReplaceText, overlayTextOnPage, redactAreaOnPage, addSignatureToPage,
  mergePdfs, downloadPdf, exportPdfAsTxt, exportPdfAsWord
} from './utils/pdf';
import type { PdfData } from './utils/pdf';
import { processAIRequest } from './utils/ai';
import type { AiProvider, ChatMessage } from './utils/ai';
import PdfViewer from './components/PdfViewer';
import { SignatureModal } from './components/SignatureModal';

export const APP_VERSION = 'v1.1.0';

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
  const [activeModelName, setActiveModelName] = useState<string>('gemini-3.6-flash');
  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [mergeWaiting, setMergeWaiting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setFadeLoading(true), 400);
    const t2 = setTimeout(() => setIsEntering(false), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
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

  /* ─── File Handling ─── */
  const handleFileUpload = async (file: File) => {
    try {
      setLoading(true);
      const data = await parsePdfFile(file);
      setPdfData(data);
      setCurrentPage(1);
      setZoom(1.2);
      setHistory([]);
      setRedoStack([]);
      setChatHistory([{
        role: 'system',
        text: `Loaded "${data.fileName}" — ${data.totalPages} pages.`
      }]);
    } catch (err) {
      alert('Failed to parse PDF file.');
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
      const newBytes = await searchAndReplaceText(
        pdfData.rawBytes,
        searchFind.trim(),
        searchReplace,
        targetPage
      );
      await updatePdfStateWithHistory(
        newBytes,
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
        13,
        whiteoutBeforeAdd
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
  const applyAction = async (action: string, params: Record<string, any>) => {
    if (!pdfData) return;
    try {
      setLoading(true);
      let newBytes: Uint8Array;

      switch (action) {
        case 'search_replace':
          newBytes = await searchAndReplaceText(
            pdfData.rawBytes,
            params.find || '',
            params.replace || '',
            params.targetPage
          );
          break;
        case 'add_watermark':
          newBytes = await addWatermark(
            pdfData.rawBytes,
            params.text || 'CONFIDENTIAL',
            params.targetPages,
            params.opacity || 0.22,
            params.angle || -45
          );
          break;
        case 'add_header_footer':
          newBytes = await addHeaderFooter(
            pdfData.rawBytes,
            params.text || '',
            params.position || 'header',
            params.fontSize || 10
          );
          break;
        case 'add_page_numbers':
          newBytes = await addPageNumbers(
            pdfData.rawBytes,
            params.position || 'bottom-center',
            params.prefix || 'Page '
          );
          break;
        case 'remove_pages':
          newBytes = await removePages(pdfData.rawBytes, params.pages || [currentPage]);
          break;
        case 'extract_pages':
          newBytes = await extractPages(pdfData.rawBytes, params.pages || [currentPage]);
          break;
        case 'duplicate_page':
          newBytes = await duplicatePage(pdfData.rawBytes, params.page || currentPage);
          break;
        case 'add_blank_page':
          newBytes = await addBlankPage(pdfData.rawBytes, params.atIndex);
          break;
        case 'reorder_pages':
          newBytes = await reorderPages(pdfData.rawBytes, params.order);
          break;
        case 'rotate_pages':
          newBytes = await rotatePages(pdfData.rawBytes, params.pages || [currentPage], params.degrees || 90);
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
      
      const result = await processAIRequest(
        chatHistory, userMsg, pdfData, provider, geminiKey, groqKey, groqModel
      );

      setChatHistory(prev => [...prev, { role: 'ai', text: result.message }]);

      if (result.action && result.action !== 'none') {
        await applyAction(result.action, result.params);
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
    if (file && file.type === 'application/pdf') await handleFileUpload(file);
  };

  return (
    <>
      {isEntering && (
        <div className={`loading-screen ${fadeLoading ? 'fade-out' : ''}`}>
          <div className="h-logo">H</div>
        </div>
      )}
      <div className="app-container">
        <main className="main-content glass-panel">
          <header>
            <div className="logo">
              <FileText size={24} />
              AI PDF Editor
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {pdfData && (
                <>
                  <div className="file-info-badge">
                    <span className="file-name">{pdfData.fileName}</span>
                    <span>{pdfData.totalPages} pg</span>
                  </div>

                  <button
                    className="btn-icon"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="btn-icon"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 size={16} />
                  </button>
                </>
              )}

              <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
                <Settings size={17} />
              </button>

              {pdfData && (
                <>
                  <button className="btn btn-secondary" onClick={() => { setPdfData(null); setChatHistory([]); setCurrentPage(1); }}>
                    <FilePlus2 size={14} /> New
                  </button>
                  <button className="btn" onClick={handleExportPdf}>
                    <Download size={14} /> Export PDF
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
              <UploadCloud size={46} className="upload-icon" />
              <h2 style={{ fontSize: '1.25rem', color: '#1e1b4b' }}>Upload your PDF</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Drag & drop or click to browse a .pdf file
              </p>
              <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="pdf-viewer-container">
              <div className="pdf-toolbar">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  <ChevronLeft size={15} />
                </button>
                <span>Page {currentPage} / {pdfData.totalPages}</span>
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
                <div style={{ width: 1, height: 16, background: 'var(--panel-border)' }} />

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
                  <Eraser size={14} /> Whiteout Box
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
                  <Search size={14} /> Find & Replace
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
                  <div style={{ marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#1e1b4b' }}>
                    <Sparkles size={16} color="var(--primary)" /> How can I help with your PDF?
                  </div>
                  Upload a document, then ask me to summarize it, find answers, replace text, add watermarks, remove pages, or reorder pages.
                  {pdfData && (
                    <div className="quick-suggestions">
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Summarize this document')}>📝 Summarize</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Change name on page 1 to Harendra Pratap Singh')}>✏️ Change Name</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Add watermark Harendra Pratap Singh ERP 252681 on page 1 only')}>💧 Watermark Page 1</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('Add page numbers at bottom')}>🔢 Number Pages</button>
                      <button type="button" className="suggestion-chip" onClick={() => setPrompt('What are the key takeaways from this document?')}>💡 Key Takeaways</button>
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
              <div style={{ padding: '0.75rem 1rem', background: '#eef2ff', borderTop: '1px solid #c7d2fe' }}>
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
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Summarize Page 1')}>📑 Page 1 Info</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Change student name on page 1 to Harendra Pratap Singh')}>✏️ Change Name</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Add watermark HARENDRA PRATAP SINGH 252681 on page 1')}>💧 Watermark Page 1</button>
                <button type="button" className="suggestion-chip" style={{ fontSize: '0.74rem', padding: '3px 8px' }} onClick={() => setPrompt('Number all pages at bottom-center')}>🔢 Page Numbers</button>
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
