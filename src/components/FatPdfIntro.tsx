import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import lottie from 'lottie-web';

interface FatPdfIntroProps {
  onFinish: () => void;
}

export const FatPdfIntro: React.FC<FatPdfIntroProps> = ({ onFinish }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lottieRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const auroraCloudRef = useRef<SVGRectElement>(null);
  const auroraCloudRef2 = useRef<SVGRectElement>(null);
  const edgeBleedRef = useRef<HTMLDivElement>(null);
  const cloudsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Initialize exact Lottie Halo Animation (blue2-pvT5LopBd6)
    let lottieAnim: any = null;
    if (lottieRef.current) {
      lottieAnim = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/halo.json',
      });
    }

    const container = containerRef.current;
    const logo = logoRef.current;
    const lottieEl = lottieRef.current;
    const text = textRef.current;
    const aurora1 = auroraCloudRef.current;
    const aurora2 = auroraCloudRef2.current;
    const edgeBleed = edgeBleedRef.current;
    const cloudsContainer = cloudsContainerRef.current;

    if (!container || !logo || !lottieEl || !aurora1 || !aurora2 || !edgeBleed || !cloudsContainer) return;

    // Calculate screen perimeter for sweeping aurora cloud wave
    const w = window.innerWidth;
    const h = window.innerHeight;
    const perimeter = Math.max(2 * (w + h), 2500);

    // Initial setup: diffuse aurora waves start from one point (perimeter offset)
    gsap.set([aurora1, aurora2], {
      strokeDasharray: perimeter,
      strokeDashoffset: perimeter,
      opacity: 0,
    });

    gsap.set(edgeBleed, {
      opacity: 0,
      scale: 0.96,
    });

    gsap.set(cloudsContainer, {
      opacity: 0,
      scale: 0.94,
    });

    gsap.set(lottieEl, {
      scale: 0.5,
      opacity: 0,
    });

    gsap.set(logo, {
      scale: 0.4,
      opacity: 0,
      y: 12,
    });

    if (text) {
      gsap.set(text, {
        opacity: 0,
        y: 8,
      });
    }

    // 2.0s total intro timeline
    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // Step 1 (0.0s): Gemini launch aurora starts from one point and edges around the whole screen
    // Diffuse aurora cloud wave races along the screen perimeter with zero hard boundaries
    tl.to(
      [aurora1, aurora2],
      {
        strokeDashoffset: 0,
        opacity: 0.95,
        duration: 0.85,
        ease: 'power2.out',
      },
      0
    )
      // Edge light bleed & organic cloud nebulae expand inward from screen edges
      .to(
        edgeBleed,
        {
          opacity: 1,
          scale: 1,
          duration: 0.75,
          ease: 'power2.out',
        },
        0.05
      )
      .to(
        cloudsContainer,
        {
          opacity: 1,
          scale: 1,
          duration: 0.85,
          ease: 'power2.out',
        },
        0.1
      )
      // Step 2 (0.35s): Blue Lottie Halo blooms in the center
      .to(
        lottieEl,
        {
          opacity: 1,
          scale: 1,
          duration: 0.55,
          ease: 'back.out(1.4)',
        },
        0.35
      )
      // Step 3 (0.50s): PDF Logo emerges right inside the center of the Lottie Halo
      .to(
        logo,
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.5,
          ease: 'back.out(1.8)',
        },
        0.5
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
        0.7
      );
    }

    // Step 4 (1.75s): Smoothly dissolve into the main workspace to hit exactly 2.0s
    tl.to(
      container,
      {
        opacity: 0,
        scale: 1.03,
        duration: 0.25,
        ease: 'power2.inOut',
      },
      1.75
    );

    return () => {
      tl.kill();
      if (lottieAnim) lottieAnim.destroy();
    };
  }, [onFinish]);

  return (
    <div
      ref={containerRef}
      className="gemini-aurora-intro-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Tap to skip"
    >
      {/* 1. Gemini Launch Aurora Edge Cloud System (No direct boundaries, starts from screen edges) */}
      <div className="gemini-aurora-system">
        {/* Deep perimeter edge light bleed */}
        <div ref={edgeBleedRef} className="gemini-edge-bleed" />

        {/* Diffuse sweeping aurora cloud wave that edges around the whole screen */}
        <svg
          className="gemini-aurora-svg"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Ultra-soft celestial gaussian blur - removes all geometric edges/lines */}
            <filter id="geminiCloudBlur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="55" result="blurWide" />
              <feGaussianBlur stdDeviation="90" result="blurDeep" />
              <feMerge>
                <feMergeNode in="blurDeep" />
                <feMergeNode in="blurWide" />
              </feMerge>
            </filter>

            {/* Gemini Iconic Cosmic Gradients */}
            <linearGradient id="geminiAuroraGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.95" />
              <stop offset="25%" stopColor="#3b82f6" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.85" />
              <stop offset="75%" stopColor="#ec4899" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.95" />
            </linearGradient>

            <linearGradient id="geminiAuroraGrad2" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.85" />
              <stop offset="30%" stopColor="#38bdf8" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* Primary sweeping aurora cloud (thick 140px stroke with heavy 90px blur) */}
          <rect
            ref={auroraCloudRef}
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="60"
            fill="none"
            stroke="url(#geminiAuroraGrad1)"
            strokeWidth="140"
            filter="url(#geminiCloudBlur)"
          />

          {/* Counter-flow atmospheric glow ribbon */}
          <rect
            ref={auroraCloudRef2}
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="60"
            fill="none"
            stroke="url(#geminiAuroraGrad2)"
            strokeWidth="100"
            filter="url(#geminiCloudBlur)"
            opacity="0.8"
          />
        </svg>

        {/* Organic edge-anchored nebula clouds billowing inward like Gemini assistant */}
        <div ref={cloudsContainerRef} className="gemini-clouds-container">
          <div className="gemini-aurora-cloud cloud-bottom" />
          <div className="gemini-aurora-cloud cloud-bottom-glow" />
          <div className="gemini-aurora-cloud cloud-top" />
          <div className="gemini-aurora-cloud cloud-left" />
          <div className="gemini-aurora-cloud cloud-right" />
        </div>
      </div>

      {/* 2. Central Stage: Lottie Halo in the background + PDF Logo appearing inside it */}
      <div className="halo-logo-stage">
        {/* Lottie Animation: blue2-pvT5LopBd6 */}
        <div ref={lottieRef} className="lottie-halo-wrapper" />

        {/* PDF Logo centered inside the Halo */}
        <div ref={logoRef} className="pdf-logo-center-wrapper">
          <img
            src="/logo.png"
            alt="FatPDF"
            className="pdf-logo-inside-halo"
          />
        </div>

        {/* Brand Label */}
        <div ref={textRef} className="intro-title-wrapper">
          <span className="intro-title-text">FatPDF</span>
        </div>
      </div>
    </div>
  );
};

export default FatPdfIntro;
