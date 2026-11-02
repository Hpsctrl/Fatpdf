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
  const edgeGlowRef = useRef<SVGRectElement>(null);
  const edgeSoftRef = useRef<SVGRectElement>(null);
  const bottomBleedRef = useRef<HTMLDivElement>(null);

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
    const edgeGlow = edgeGlowRef.current;
    const edgeSoft = edgeSoftRef.current;
    const bottomBleed = bottomBleedRef.current;

    if (!container || !logo || !lottieEl || !edgeGlow || !edgeSoft || !bottomBleed) return;

    // Calculate perimeter for smooth edge tracing
    const w = window.innerWidth;
    const h = window.innerHeight;
    const perimeter = Math.max(2 * (w + h), 2000);

    // Initial setup: hardware-accelerated initial states
    gsap.set([edgeGlow, edgeSoft], {
      strokeDasharray: perimeter,
      strokeDashoffset: perimeter,
      opacity: 0,
    });

    gsap.set(bottomBleed, {
      opacity: 0,
      scale: 0.9,
    });

    gsap.set(lottieEl, {
      scale: 0.6,
      opacity: 0,
    });

    gsap.set(logo, {
      scale: 0.5,
      opacity: 0,
      y: 10,
    });

    if (text) {
      gsap.set(text, {
        opacity: 0,
        y: 6,
      });
    }

    // 2.0s total intro timeline
    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // Step 1: Subtle, optimized Gemini edge glow traces around screen perimeter
    tl.to(
      [edgeGlow, edgeSoft],
      {
        strokeDashoffset: 0,
        opacity: 0.7,
        duration: 0.75,
        ease: 'power2.out',
      },
      0
    )
      // Soft bottom ambient glow blooms gently (Gemini launch signature)
      .to(
        bottomBleed,
        {
          opacity: 0.5,
          scale: 1,
          duration: 0.6,
          ease: 'power2.out',
        },
        0.05
      )
      // Step 2: Lottie Halo blooms in center
      .to(
        lottieEl,
        {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(1.4)',
        },
        0.35
      )
      // Step 3: PDF Logo appears inside Lottie Halo
      .to(
        logo,
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.45,
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
          duration: 0.3,
          ease: 'power2.out',
        },
        0.7
      );
    }

    // Step 4: Smoothly dissolve into app at 1.75s to complete precisely at 2.0s
    tl.to(
      container,
      {
        opacity: 0,
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
      className="gemini-optimized-intro-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Tap to skip"
    >
      {/* 1. Subtle, Optimized Gemini Edge Glow System */}
      <div className="gemini-optimized-frame">
        {/* Soft bottom ambient glow */}
        <div ref={bottomBleedRef} className="gemini-bottom-ambient" />

        {/* Lightweight SVG edge trace with subtle glow (GPU friendly) */}
        <svg
          className="gemini-optimized-svg"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Lightweight soft blur (small stdDeviation = fast shader) */}
            <filter id="geminiFastGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" />
            </filter>

            <linearGradient id="geminiSoftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="35%" stopColor="#818cf8" />
              <stop offset="70%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>

          {/* Soft outer aura (12px stroke with 8px blur) */}
          <rect
            ref={edgeSoftRef}
            x="3"
            y="3"
            width="calc(100% - 6px)"
            height="calc(100% - 6px)"
            rx="24"
            fill="none"
            stroke="url(#geminiSoftGrad)"
            strokeWidth="12"
            filter="url(#geminiFastGlow)"
            opacity="0.45"
          />

          {/* Clean luminous core ribbon (3px stroke) */}
          <rect
            ref={edgeGlowRef}
            x="3"
            y="3"
            width="calc(100% - 6px)"
            height="calc(100% - 6px)"
            rx="24"
            fill="none"
            stroke="url(#geminiSoftGrad)"
            strokeWidth="3"
            opacity="0.75"
          />
        </svg>
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
