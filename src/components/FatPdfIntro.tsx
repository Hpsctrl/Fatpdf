import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface FatPdfIntroProps {
  onFinish: () => void;
}

export const FatPdfIntro: React.FC<FatPdfIntroProps> = ({ onFinish }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const edgeGlowRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const logo = logoRef.current;
    const halo = haloRef.current;
    const edgeGlow = edgeGlowRef.current;
    const text = textRef.current;

    if (!container || !logo || !halo || !edgeGlow) return;

    // Initial setup
    gsap.set(container, { opacity: 1 });
    gsap.set(edgeGlow, { opacity: 0 });
    gsap.set(logo, { scale: 0.7, opacity: 0 });
    gsap.set(halo, { scale: 0.5, opacity: 0, rotation: 0 });
    if (text) gsap.set(text, { opacity: 0, y: 12 });

    // Exactly 2-second total intro timeline
    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // 0.0s - 0.4s: Edge Glow illuminates screen perimeter & AI Halo bursts
    tl.to(edgeGlow, {
      opacity: 1,
      duration: 0.35,
      ease: 'power2.out',
    })
      .to(
        halo,
        {
          opacity: 1,
          scale: 1,
          rotation: 180,
          duration: 0.6,
          ease: 'back.out(1.6)',
        },
        0.05
      )
      // 0.15s - 0.6s: PDF Logo pops into center of AI Halo
      .to(
        logo,
        {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(1.8)',
        },
        0.15
      );

    if (text) {
      tl.to(
        text,
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          ease: 'power2.out',
        },
        0.35
      );
    }

    // Continuous rotation of AI Halo throughout the 2s
    gsap.to(halo, {
      rotation: 360,
      duration: 2.0,
      ease: 'none',
    });

    // 1.7s - 2.0s: Smooth dissolve into the app (exact 2s mark)
    tl.to(
      container,
      {
        opacity: 0,
        scale: 1.03,
        duration: 0.3,
        ease: 'power2.inOut',
      },
      1.7
    );

    return () => {
      tl.kill();
    };
  }, [onFinish]);

  return (
    <div
      ref={containerRef}
      className="edge-glow-intro-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Tap to skip"
    >
      {/* 1. Full Screen Siri / Gemini Edge Glow (react-native-edge-glow style) */}
      <div ref={edgeGlowRef} className="screen-edge-glow-wrapper">
        <svg
          className="screen-edge-glow-svg"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Animated Siri / Gemini Spectrum Gradient */}
            <linearGradient id="edgeSpectrumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="25%" stopColor="#818cf8" />
              <stop offset="50%" stopColor="#d946ef" />
              <stop offset="75%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            <filter id="edgeDeepBloom" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="32" result="blur" />
            </filter>
            <filter id="edgeMidBloom" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="14" result="blur" />
            </filter>
          </defs>

          {/* Deep Inward Feathering Glow Ring */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="36"
            fill="none"
            stroke="url(#edgeSpectrumGrad)"
            strokeWidth="48"
            opacity="0.45"
            filter="url(#edgeDeepBloom)"
          />

          {/* Mid-range Radiant Bloom Ring */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="36"
            fill="none"
            stroke="url(#edgeSpectrumGrad)"
            strokeWidth="22"
            opacity="0.75"
            filter="url(#edgeMidBloom)"
          />

          {/* Crisp Perimeter Light Line */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="36"
            fill="none"
            stroke="url(#edgeSpectrumGrad)"
            strokeWidth="5"
            opacity="0.95"
          />
        </svg>

        {/* Ambient Corner Flare Highlights */}
        <div className="corner-flare flare-top-left" />
        <div className="corner-flare flare-top-right" />
        <div className="corner-flare flare-bottom-left" />
        <div className="corner-flare flare-bottom-right" />
      </div>

      {/* 2. Center Stage: PDF Logo with AI Halo Lottie-style Animation */}
      <div className="intro-center-stage">
        {/* Lottie-style Multi-Layered AI Halo Orb */}
        <div ref={haloRef} className="ai-halo-orb-container">
          <div className="ai-halo-swirl swirl-1" />
          <div className="ai-halo-swirl swirl-2" />
          <div className="ai-halo-swirl swirl-3" />
          <div className="ai-halo-glow-core" />
          <div className="ai-halo-spinning-ring" />
          <div className="ai-halo-particles" />
        </div>

        {/* Center PDF Logo */}
        <div ref={logoRef} className="intro-logo-container">
          <img
            src="/logo.png"
            alt="FatPDF"
            className="intro-pdf-logo-img"
          />
        </div>

        {/* Brand Text */}
        <div ref={textRef} className="intro-brand-badge">
          <span className="intro-brand-name">FatPDF</span>
        </div>
      </div>
    </div>
  );
};

export default FatPdfIntro;
