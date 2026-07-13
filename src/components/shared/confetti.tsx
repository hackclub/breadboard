"use client";

import { useEffect, useRef } from "react";

// Breadboard palette: red accent, ink, paper, plus a couple of warm sparks.
const COLORS = ["#BD0F32", "#191a23", "#fefffe", "#E24B4A", "#f4f4f4"];

export function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      w: number;
      h: number;
      rotation: number;
      rotationSpeed: number;
    };

    const w = canvas.width;
    const h = canvas.height;

    const particles: Particle[] = Array.from({ length: 160 }, (_, i) => {
      const fromLeft = i < 80;
      const spread = (Math.random() - 0.5) * 2;
      const speed = Math.random() * 6 + 6;
      return {
        x: fromLeft ? Math.random() * 60 : w - Math.random() * 60,
        y: h + Math.random() * 20,
        vx: fromLeft
          ? Math.random() * 6 + 2 + spread
          : -(Math.random() * 6 + 2) + spread,
        vy: -speed,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: Math.random() * 12 + 6,
        h: Math.random() * 6 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.12,
      };
    });

    let frame: number;

    function draw() {
      const c = canvas!;
      const x = ctx!;
      x.clearRect(0, 0, c.width, c.height);
      let alive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;

        if (p.y < c.height + 60) alive = true;

        x.save();
        x.translate(p.x, p.y);
        x.rotate(p.rotation);
        x.fillStyle = p.color;
        x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        x.restore();
      }

      if (alive) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
