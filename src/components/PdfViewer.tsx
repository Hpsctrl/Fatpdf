import React, { useEffect, useRef, useState } from 'react';
import { renderPageToCanvas } from '../utils/pdf';

interface PdfViewerProps {
  pdfBytes: Uint8Array;
  currentPage: number;
  zoom: number;
  activeTool: 'select' | 'text' | 'redact';
  onCanvasClick?: (coords: { x: number; y: number; pageNum: number }) => void;
  onBoxSelected?: (box: { x: number; y: number; width: number; height: number; pageNum: number }) => void;
  onCancelTool?: () => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfBytes,
  currentPage,
  zoom,
  activeTool,
  onCanvasClick,
  onBoxSelected,
  onCancelTool,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Keyboard shortcut: Escape cancels active tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTool !== 'select') {
        setIsSelecting(false);
        setCurrentBox(null);
        setStartPos(null);
        onCancelTool?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, onCancelTool]);

  useEffect(() => {
    if (!canvasRef.current || !pdfBytes || pdfBytes.length === 0) return;

    let cancelled = false;

    const render = async () => {
      try {
        if (!cancelled && canvasRef.current) {
          await renderPageToCanvas(pdfBytes, currentPage, canvasRef.current, zoom);
        }
      } catch (err) {
        console.error('Failed to render page:', err);
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, currentPage, zoom]);

  const getPdfCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scale = zoom;
    const pdfX = clickX / scale;
    const pdfTotalH = rect.height / scale;
    const pdfY = pdfTotalH - (clickY / scale);

    return { x: pdfX, y: pdfY, clientX: clickX, clientY: clickY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'select') return;

    const coords = getPdfCoordinates(e);
    if (!coords) return;

    if (activeTool === 'text') {
      onCanvasClick?.({ x: Math.round(coords.x), y: Math.round(coords.y), pageNum: currentPage });
      return;
    }

    if (activeTool === 'redact') {
      setIsSelecting(true);
      setStartPos({ x: coords.x, y: coords.y, clientX: coords.clientX, clientY: coords.clientY });
      setCurrentBox({ x: coords.clientX, y: coords.clientY, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !startPos || activeTool !== 'redact') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const currClientX = e.clientX - rect.left;
    const currClientY = e.clientY - rect.top;

    const x = Math.min(startPos.clientX, currClientX);
    const y = Math.min(startPos.clientY, currClientY);
    const w = Math.abs(currClientX - startPos.clientX);
    const h = Math.abs(currClientY - startPos.clientY);

    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !startPos || activeTool !== 'redact') return;
    setIsSelecting(false);

    const coords = getPdfCoordinates(e);
    if (!coords) return;

    const x = Math.min(startPos.x, coords.x);
    const y = Math.min(startPos.y, coords.y);
    const width = Math.abs(coords.x - startPos.x);
    const height = Math.abs(coords.y - startPos.y);

    setCurrentBox(null);
    setStartPos(null);

    if (width > 5 && height > 5) {
      onBoxSelected?.({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        pageNum: currentPage,
      });
    }
  };

  return (
    <div className="pdf-canvas-wrapper" ref={wrapperRef}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          style={{
            cursor: activeTool === 'text' ? 'crosshair' : activeTool === 'redact' ? 'crosshair' : 'default',
            display: 'block',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
        {currentBox && (
          <div
            style={{
              position: 'absolute',
              left: `${currentBox.x}px`,
              top: `${currentBox.y}px`,
              width: `${currentBox.w}px`,
              height: `${currentBox.h}px`,
              border: '2px dashed #4f46e5',
              backgroundColor: 'rgba(79, 70, 229, 0.18)',
              pointerEvents: 'none',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
            }}
          >
            <span
              style={{
                fontSize: '10px',
                background: '#4f46e5',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(currentBox.w)} × {Math.round(currentBox.h)} px
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
