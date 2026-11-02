import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface AppleHelloIntroProps {
  onFinish: () => void;
  langInfo?: { word: string; lang: string; sub: string };
}

export const AppleHelloIntro: React.FC<AppleHelloIntroProps> = ({ onFinish, langInfo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const pathGlowRef = useRef<SVGPathElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const pathGlow = pathGlowRef.current;
    const svg = svgRef.current;
    const container = containerRef.current;
    const badge = badgeRef.current;

    if (!path || !svg || !container) return;

    // Robust calculation of SVG cursive path length with fallback
    let totalLength = 5600;
    try {
      if (path.getTotalLength) {
        const measured = path.getTotalLength();
        if (measured > 500) totalLength = measured;
      }
    } catch {
      totalLength = 5600;
    }

    // Set initial stroke-dash offset for cursive handwriting line animation
    gsap.set([path, pathGlow], {
      strokeDasharray: totalLength + 20,
      strokeDashoffset: totalLength + 20,
      visibility: 'visible',
    });

    gsap.set(svg, {
      scale: 0.78,
      transformOrigin: '50% 50%',
      opacity: 0,
    });

    if (badge) {
      gsap.set(badge, {
        opacity: 0,
        y: 18,
      });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        onFinish();
      },
    });

    // 1. Reveal SVG container and start line handwriting stroke
    tl.to(svg, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out',
    })
      // 2. Continuous 3D cursive line animation (GreenSock drawing)
      .to(
        [path, pathGlow],
        {
          strokeDashoffset: 0,
          duration: 2.3,
          ease: 'power1.inOut',
        },
        0.1
      )
      // 3. Perspective scale towards viewer as it writes
      .to(
        svg,
        {
          scale: 1,
          duration: 2.3,
          ease: 'power2.out',
        },
        0.1
      );

    // 4. Reveal badge & Continue button
    if (badge) {
      tl.to(
        badge,
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'back.out(1.5)',
        },
        '-=0.4'
      );
    }

    // 5. Elegant hold so the user can enjoy the completed line drawing, then smooth dissolve
    tl.to(
      container,
      {
        opacity: 0,
        scale: 1.04,
        duration: 0.5,
        ease: 'power2.inOut',
        delay: 1.0,
      }
    );

    return () => {
      tl.kill();
    };
  }, [onFinish]);

  return (
    <div
      ref={containerRef}
      className="apple-hello-overlay"
      onClick={onFinish}
      role="button"
      tabIndex={0}
      title="Click anywhere to continue"
    >
      <div className="apple-hello-stage">
        {/* Apple Atmospheric Backdrop Aura Glow */}
        <div className="apple-ambient-glow" />

        {/* Apple 3D Hello Vector Graphic */}
        <div id="hello-text" className="apple-hello-svg-wrap">
          <svg
            ref={svgRef}
            className="apple-hello-svg"
            viewBox="0 0 1230.94 414.57"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Vibrant Apple macOS Screensaver Gradient */}
              <linearGradient id="appleHelloGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="25%" stopColor="#8b5cf6" />
                <stop offset="50%" stopColor="#d946ef" />
                <stop offset="75%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>

              {/* Ambient Glow Gradient */}
              <linearGradient id="appleGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="50%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>

              <filter id="appleNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="18" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Depth / Glow Back-layer Path */}
            <path
              ref={pathGlowRef}
              d="M-293.58-104.62S-103.61-205.49-60-366.25c9.13-32.45,9-58.31,0-74-10.72-18.82-49.69-33.21-75.55,31.94-27.82,70.11-52.22,377.24-44.11,322.48s34-176.24,99.89-183.19c37.66-4,49.55,23.58,52.83,47.92a117.06,117.06,0,0,1-3,45.32c-7.17,27.28-20.47,97.67,33.51,96.86,66.93-1,131.91-53.89,159.55-84.49,31.1-36.17,31.1-70.64,19.27-90.25-16.74-29.92-69.47-33-92.79,16.73C62.78-179.86,98.7-93.8,159-81.63S302.7-99.55,393.3-269.92c29.86-58.16,52.85-114.71,46.14-150.08-7.44-39.21-59.74-54.5-92.87-8.7-47,65-61.78,266.62-34.74,308.53S416.62-58,481.52-130.31s133.2-188.56,146.54-256.23c14-71.15-56.94-94.64-88.4-47.32C500.53-375,467.58-229.49,503.3-127a73.73,73.73,0,0,0,23.43,33.67c25.49,20.23,55.1,16,77.46,6.32a111.25,111.25,0,0,0,30.44-19.87c37.73-34.23,29-36.71,64.58-127.53C724-284.3,785-298.63,821-259.13a71,71,0,0,1,13.69,22.56c17.68,46,6.81,80-6.81,107.89-12,24.62-34.56,42.72-61.45,47.91-23.06,4.45-48.37-.35-66.48-24.27a78.88,78.88,0,0,1-12.66-25.8c-14.75-51,4.14-88.76,11-101.41,6.18-11.39,37.26-69.61,103.42-42.24,55.71,23.05,100.66-23.31,100.66-23.31"
              transform="translate(311.08 476.02)"
              fill="none"
              stroke="url(#appleGlowGrad)"
              strokeWidth="44"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.45"
              filter="url(#appleNeonGlow)"
            />

            {/* Foreground Sharp 3D Path */}
            <path
              ref={pathRef}
              d="M-293.58-104.62S-103.61-205.49-60-366.25c9.13-32.45,9-58.31,0-74-10.72-18.82-49.69-33.21-75.55,31.94-27.82,70.11-52.22,377.24-44.11,322.48s34-176.24,99.89-183.19c37.66-4,49.55,23.58,52.83,47.92a117.06,117.06,0,0,1-3,45.32c-7.17,27.28-20.47,97.67,33.51,96.86,66.93-1,131.91-53.89,159.55-84.49,31.1-36.17,31.1-70.64,19.27-90.25-16.74-29.92-69.47-33-92.79,16.73C62.78-179.86,98.7-93.8,159-81.63S302.7-99.55,393.3-269.92c29.86-58.16,52.85-114.71,46.14-150.08-7.44-39.21-59.74-54.5-92.87-8.7-47,65-61.78,266.62-34.74,308.53S416.62-58,481.52-130.31s133.2-188.56,146.54-256.23c14-71.15-56.94-94.64-88.4-47.32C500.53-375,467.58-229.49,503.3-127a73.73,73.73,0,0,0,23.43,33.67c25.49,20.23,55.1,16,77.46,6.32a111.25,111.25,0,0,0,30.44-19.87c37.73-34.23,29-36.71,64.58-127.53C724-284.3,785-298.63,821-259.13a71,71,0,0,1,13.69,22.56c17.68,46,6.81,80-6.81,107.89-12,24.62-34.56,42.72-61.45,47.91-23.06,4.45-48.37-.35-66.48-24.27a78.88,78.88,0,0,1-12.66-25.8c-14.75-51,4.14-88.76,11-101.41,6.18-11.39,37.26-69.61,103.42-42.24,55.71,23.05,100.66-23.31,100.66-23.31"
              transform="translate(311.08 476.02)"
              fill="none"
              stroke="url(#appleHelloGradient)"
              strokeWidth="32"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Elegant Branding & Continue Action */}
        <div ref={badgeRef} className="apple-lang-badge">
          <img
            src="/logo.png"
            alt="FatPDF"
            className="apple-intro-logo"
            style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover' }}
          />
          <span style={{ fontWeight: 700, color: '#ffffff' }}>FatPDF</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span style={{ color: '#cbd5e1' }}>
            {langInfo ? `${langInfo.lang} (${langInfo.sub})` : 'AI Document Studio'}
          </span>
          <button
            type="button"
            className="apple-continue-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFinish();
            }}
          >
            Continue &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppleHelloIntro;
