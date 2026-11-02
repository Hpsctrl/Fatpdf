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
  const edgeBloomRef = useRef<SVGRectElement>(null);
  const edgeLeadRef = useRef<SVGRectElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Initialize exact Lottie Halo Animation
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
    const edgeBloom = edgeBloomRef.current;
    const edgeLead = edgeLeadRef.current;
    const text = textRef.current;

    if (!container || !logo || !lottieEl || !edgeBloom || !edgeLead) return;

    // Calculate screen perimeter
    const w = window.innerWidth;
    const h = window.innerHeight;
    const perimeter = Math.max(2 * (w + h), 2500);

    // Initial state setup
    gsap.set([edgeBloom, edgeLead], {
      strokeDasharray: perimeter,
      strokeDashoffset: perimeter,
      opacity: 1,
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
        y: 8,
      });
    }

    // 2.0s total intro timeline
    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // Step 1: Edge glow starts from one point and races around the whole screen perimeter
    tl.to([edgeBloom, edgeLead], {
      strokeDashoffset: 0,
      duration: 0.75,
      ease: 'power2.inOut',
    })
      // Step 2: Lottie Halo blooms in the center
      .to(
        lottieEl,
        {
          opacity: 1,
          scale: 1,
          duration: 0.55,
          ease: 'back.out(1.5)',
        },
        0.35
      )
      // Step 3: PDF Logo appears inside the Lottie Halo
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

    // Step 4: At 1.75s, smoothly dissolve into the app to complete exactly at 2.0s
    tl.to(
      container,
      {
        opacity: 0,
        scale: 1.04,
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
      className="edge-trace-intro-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Tap to skip"
    >
      {/* 1. Full Screen Perimeter Edge Trace (glow starts from one point and edges around whole screen) */}
      <div className="screen-edge-trace-container">
        <svg
          className="screen-edge-trace-svg"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="edgeTraceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="35%" stopColor="#60a5fa" />
              <stop offset="70%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>

            <filter id="edgeTraceBloomFilter" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="24" result="blurDeep" />
              <feGaussianBlur stdDeviation="10" result="blurMid" />
              <feMerge>
                <feMergeNode in="blurDeep" />
                <feMergeNode in="blurMid" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Deep luminous bloom edge trace */}
          <rect
            ref={edgeBloomRef}
            x="4"
            y="4"
            width="calc(100% - 8px)"
            height="calc(100% - 8px)"
            rx="32"
            fill="none"
            stroke="url(#edgeTraceGradient)"
            strokeWidth="32"
            opacity="0.65"
            filter="url(#edgeTraceBloomFilter)"
          />

          {/* Crisp leading edge line */}
          <rect
            ref={edgeLeadRef}
            x="4"
            y="4"
            width="calc(100% - 8px)"
            height="calc(100% - 8px)"
            rx="32"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            opacity="0.95"
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
