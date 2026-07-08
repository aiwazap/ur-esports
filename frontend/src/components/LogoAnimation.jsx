import { useEffect, useRef, useState } from 'react';

export default function LogoAnimation({ onComplete }) {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('particles'); // particles → reveal → breathe → fadeout
  const imgRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    // Preload logo image
    const img = new Image();
    img.src = '/logo-ur.png';
    img.onload = () => {
      imgRef.current = img;
      startAnimation();
    };
    img.onerror = () => {
      // Fallback: skip to reveal with text only
      imgRef.current = null;
      startAnimation();
    };

    let animId;
    let particles = [];

    function startAnimation() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let w = canvas.width = window.innerWidth;
      let h = canvas.height = window.innerHeight;

      const resize = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
      };
      window.addEventListener('resize', resize);

      const cx = w / 2, cy = h / 2;
      const imgW = Math.min(w * 0.5, 350);
      const imgH = imgRef.current ? (imgW / imgRef.current.width) * imgRef.current.height : imgW * 0.6;
      const particleCount = 500;

      // Initialize random particles across screen
      particles = Array.from({ length: particleCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        tx: cx + (Math.random() - 0.5) * imgW * 1.2,
        ty: cy + (Math.random() - 0.5) * imgH * 1.2,
        size: 1 + Math.random() * 3,
        color: Math.random() < 0.2 ? '#f59e0b' : Math.random() < 0.3 ? '#ea580c' : '#fbbf24',
        delay: Math.random() * 0.6,
        settled: false,
      }));

      let localPhase = 'particles';
      let phaseStart = 0;

      const animate = () => {
        ctx.clearRect(0, 0, w, h);
        const frame = frameRef.current++;

        // Update phase
        if (localPhase === 'particles' && frame > 180) {
          localPhase = 'reveal';
          phaseStart = frame;
          setPhase('reveal');
        }
        if (localPhase === 'reveal' && frame - phaseStart > 120) {
          localPhase = 'breathe';
          phaseStart = frame;
          setPhase('breathe');
        }
        if (localPhase === 'breathe' && frame - phaseStart > 200) {
          localPhase = 'fadeout';
          phaseStart = frame;
          setPhase('fadeout');
        }

        // Draw particles
        particles.forEach(p => {
          if (frame < p.delay * 60) return;

          // Move toward target
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (!p.settled && dist > 2) {
            p.x += dx * 0.04;
            p.y += dy * 0.04;
          } else {
            p.settled = true;
          }

          // Wobble when settled
          if (p.settled) {
            p.x += (Math.random() - 0.5) * 0.5;
            p.y += (Math.random() - 0.5) * 0.5;
          }

          // Breathing effect in breathe phase
          let size = p.size;
          if (localPhase === 'breathe') {
            size *= 1 + Math.sin(frame * 0.04 + p.x * 0.01) * 0.4;
          }

          const alpha = localPhase === 'fadeout'
            ? Math.max(0, 1 - (frame - phaseStart) / 80)
            : p.settled ? (0.5 + Math.random() * 0.3) : 0.7;

          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = alpha;
          ctx.fill();

          // Glow for gold particles
          if (p.color === '#f59e0b' && p.size > 2) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha * 0.12;
            ctx.fill();
          }
        });

        ctx.globalAlpha = 1;

        // Draw logo in reveal/breathe/fadeout phases
        if (localPhase !== 'particles' && imgRef.current) {
          const revealProgress = localPhase === 'reveal'
            ? Math.min(1, (frame - phaseStart) / 60)
            : 1;

          const logoAlpha = localPhase === 'fadeout'
            ? Math.max(0, 1 - (frame - phaseStart) / 80)
            : revealProgress;

          if (logoAlpha > 0) {
            const scale = localPhase === 'breathe'
              ? 1 + Math.sin(frame * 0.03) * 0.03
              : 1;

            ctx.globalAlpha = logoAlpha;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.drawImage(imgRef.current, -imgW / 2, -imgH / 2, imgW, imgH);
            ctx.restore();
            ctx.globalAlpha = 1;
          }
        }

        // Flame wisps during breathe
        if (localPhase === 'breathe') {
          for (let f = 0; f < 6; f++) {
            const fx = cx + (Math.random() - 0.5) * imgW * 1.1;
            const fy = cy + imgH * 0.5 + Math.random() * 20;
            const grd = ctx.createRadialGradient(fx, fy, 0, fx, fy, 25 + Math.random() * 25);
            grd.addColorStop(0, 'rgba(251, 146, 60, 0.25)');
            grd.addColorStop(0.5, 'rgba(234, 88, 12, 0.1)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(fx, fy, 25 + Math.random() * 25, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
          }
        }

        // End condition
        if (localPhase === 'fadeout' && frame - phaseStart > 80) {
          cancelAnimationFrame(animId);
          onComplete?.();
          return;
        }

        animId = requestAnimationFrame(animate);
      };

      animId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-[#05080f] transition-opacity duration-800 ${phase === 'fadeout' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Text overlay during breathe phase */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-700 ${phase === 'breathe' || phase === 'fadeout' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="mt-64 text-center">
          <p className="text-amber-400/80 font-display text-lg tracking-[0.3em]"
            style={{ textShadow: '0 0 20px rgba(245,158,11,0.35)' }}>
            未平息的怨恨
          </p>
          <p className="text-gray-600 text-xs tracking-[0.4em] mt-1.5">
            UNSETTLED RESENTMENT
          </p>
        </div>
      </div>
    </div>
  );
}
