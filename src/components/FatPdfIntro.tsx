import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Sparkles, FileText, Scan, ArrowRight } from 'lucide-react';

interface FatPdfIntroProps {
  onFinish: () => void;
}

export const FatPdfIntro: React.FC<FatPdfIntroProps> = ({ onFinish }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const card = cardRef.current;
    const logo = logoRef.current;
    const scanLine = scanLineRef.current;
    const title = titleRef.current;
    const subtitle = subtitleRef.current;
    const pills = pillsRef.current;
    const action = actionRef.current;

    if (!container || !card || !logo) return;

    // Initial setup with GSAP
    gsap.set(card, {
      opacity: 0,
      scale: 0.85,
      y: 20,
      rotationX: 12,
      transformPerspective: 1000,
    });

    gsap.set(logo, {
      scale: 0.8,
      opacity: 0,
    });

    if (scanLine) {
      gsap.set(scanLine, {
        top: '0%',
        opacity: 0,
      });
    }

    if (title) gsap.set(title, { opacity: 0, y: 15 });
    if (subtitle) gsap.set(subtitle, { opacity: 0, y: 10 });
    if (pills) gsap.set(pills, { opacity: 0, y: 10 });
    if (action) gsap.set(action, { opacity: 0, scale: 0.9 });

    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // 1. Smooth 3D entrance of Document Studio Card
    tl.to(card, {
      opacity: 1,
      scale: 1,
      y: 0,
      rotationX: 0,
      duration: 0.65,
      ease: 'power3.out',
    })
      // 2. 3D Logo pop & subtle float
      .to(
        logo,
        {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(1.7)',
        },
        '-=0.3'
      )
      // 3. Holographic AI Laser Scan sweep down the card
      .to(
        scanLine,
        {
          opacity: 1,
          duration: 0.15,
        },
        '-=0.2'
      )
      .to(
        scanLine,
        {
          top: '100%',
          duration: 0.9,
          ease: 'power1.inOut',
        },
        '-=0.1'
      )
      .to(
        scanLine,
        {
          opacity: 0,
          duration: 0.2,
        },
        '-=0.1'
      )
      // 4. Kinetic typography reveal
      .to(
        title,
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
        },
        '-=0.6'
      )
      .to(
        subtitle,
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          ease: 'power2.out',
        },
        '-=0.3'
      )
      .to(
        pills,
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
        },
        '-=0.2'
      )
      .to(
        action,
        {
          opacity: 1,
          scale: 1,
          duration: 0.35,
          ease: 'back.out(1.5)',
        },
        '-=0.2'
      );

    // 5. Cinematic dissolve into the workspace
    tl.to(
      container,
      {
        opacity: 0,
        scale: 1.04,
        filter: 'blur(10px)',
        duration: 0.45,
        ease: 'power2.inOut',
        delay: 0.7,
      }
    );

    return () => {
      tl.kill();
    };
  }, [onFinish]);

  return (
    <div
      ref={containerRef}
      className="fatpdf-intro-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Tap anywhere to enter"
    >
      {/* Dynamic Background Mesh Aura */}
      <div className="fatpdf-intro-aura fatpdf-aura-primary" />
      <div className="fatpdf-intro-aura fatpdf-aura-secondary" />

      {/* Floating Holographic Document Card */}
      <div ref={cardRef} className="fatpdf-intro-card">
        {/* Holographic AI Scanline */}
        <div ref={scanLineRef} className="fatpdf-scan-laser">
          <div className="fatpdf-scan-glow" />
        </div>

        {/* 3D App Logo with Radiant Frame */}
        <div className="fatpdf-logo-stage">
          <div className="fatpdf-logo-ring" />
          <img
            ref={logoRef}
            src="/logo.png"
            alt="FatPDF Logo"
            className="fatpdf-intro-logo-img"
          />
          <div className="fatpdf-ai-sparkle">
            <Sparkles size={16} color="#ffffff" />
          </div>
        </div>

        {/* Brand Title */}
        <h1 ref={titleRef} className="fatpdf-intro-title">
          <span className="title-gradient">FatPDF</span>
        </h1>

        {/* Tagline */}
        <p ref={subtitleRef} className="fatpdf-intro-sub">
          Next-Gen AI Document Studio
        </p>

        {/* Feature Highlights Pills */}
        <div ref={pillsRef} className="fatpdf-feature-pills">
          <span className="feature-pill">
            <Scan size={12} />
            <span>Online OCR</span>
          </span>
          <span className="feature-pill">
            <Sparkles size={12} />
            <span>AI Assistant</span>
          </span>
          <span className="feature-pill">
            <FileText size={12} />
            <span>Smart Editor</span>
          </span>
        </div>

        {/* Action Button */}
        <div ref={actionRef} className="fatpdf-action-row">
          <button
            type="button"
            className="fatpdf-enter-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFinish();
            }}
          >
            <span>Launch Studio</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FatPdfIntro;
