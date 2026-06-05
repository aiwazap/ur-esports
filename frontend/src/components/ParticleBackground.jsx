import { useEffect, useRef } from 'react';

export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let points = [];
    let raf;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = Array.from(
        { length: Math.min(86, Math.floor(width / 18)) },
        (_, index) => ({
          x: Math.random() * width,
          y: Math.random() * height,
          speed: 0.18 + Math.random() * 0.48,
          phase: Math.random() * Math.PI * 2,
          size: index % 9 === 0 ? 1.8 : 1,
        })
      );
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      const t = time * 0.001;
      for (const point of points) {
        point.x += point.speed;
        point.y += Math.sin(t + point.phase) * 0.16;
        if (point.x > width + 40) {
          point.x = -40;
          point.y = Math.random() * height;
        }
        const tail = 104 + Math.sin(t + point.phase) * 38;
        const gradient = ctx.createLinearGradient(
          point.x - tail,
          point.y,
          point.x,
          point.y
        );
        gradient.addColorStop(0, 'rgba(104, 232, 255, 0)');
        gradient.addColorStop(1, 'rgba(104, 232, 255, 0.28)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = point.size;
        ctx.beginPath();
        ctx.moveTo(point.x - tail, point.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    if (!reduceMotion) {
      raf = requestAnimationFrame(draw);
    } else {
      draw(0);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.86,
      }}
    />
  );
}
