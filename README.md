# FatPDF - AI PDF Editor & Document Studio

FatPDF is a high-performance, client-side web application and PWA for editing, manipulating, and transforming PDF documents using AI assistance and interactive studio tools.

All document processing runs directly in the browser using `pdf-lib` and `pdfjs-dist`, ensuring speed and privacy.

---

## Features

### 🤖 AI Document Assistant
- **Zero-Latency Intent Engine**: Instant local execution for common commands (search & replace, watermark, reorder, rotate, theme switches) without API calls.
- **Online OCR**: Vision-powered text extraction from scanned documents and images using Google Gemini Vision and Groq.
- **Natural Language PDF Manipulation**: Ask in plain English to replace text, summarize sections, adjust formatting, or reorder pages.

### ✏️ Interactive PDF Studio
- **Search & Replace**: Whiteout and replace text seamlessly across single pages or entire documents with matched fonts.
- **Text Insertion & Typography**: Add custom text overlays with font family options (Helvetica, Times Roman, Courier), font sizing, bold/italic styles, and color selection.
- **Handwritten Signatures**: Draw official signatures or initials with touch/mouse canvas and stamp them directly onto any page.
- **Redaction & Privacy Whiteout**: Mask sensitive information with rectangular redaction blocks.
- **Watermarking**: Stamp custom watermarks across all pages or selected pages with configurable opacity and rotation angle.
- **Bates & Page Numbering**: Add customized numbering at bottom-center, bottom-right, or top-right.

### 📑 Document Organization
- **Page Operations**: Duplicate, remove, rotate (90° increments), and reorder pages visually.
- **Blank Page Injection**: Add blank pages wherever required.
- **PDF Merge**: Combine multiple PDF files into a single unified document.
- **Page Extraction**: Extract selected pages as a standalone document.

### 🎨 Themes & PWA
- **Theme Modes**: Modern Light, Midnight Dark, and Pearl (warm eye-care sepia paper).
- **Progressive Web App**: Offline-ready with Service Worker caching and home screen install support.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Hpsctrl/Fatpdf.git
cd Fatpdf

# Install dependencies
npm install
```

### Configuration (Optional)
To enable Online OCR and cloud-backed AI intelligence, you can supply your API keys:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your Gemini or Groq API key:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_GROQ_API_KEY=your_groq_api_key_here
   ```
*(You can also configure or update API keys at runtime via the in-app Settings modal; keys are saved securely to your browser's local storage).*

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

The output will be generated inside the `dist/` directory, ready to deploy to GitHub Pages, Cloudflare Pages, Vercel, or any static hosting service.

---

## Tech Stack

- **Framework**: React 19, TypeScript, Vite
- **PDF Engines**: `pdf-lib`, `pdfjs-dist`
- **AI / OCR**: `@google/genai`, `groq-sdk`
- **Animations & UI**: GSAP, Lottie Web, Canvas Confetti, Lucide React

---

## License

MIT License. Free for personal and commercial use.
