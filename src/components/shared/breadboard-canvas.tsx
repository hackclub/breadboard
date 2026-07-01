"use client";

import { useEffect, useRef, useState } from "react";

const colors = ["#BD0F32", "#4477dd", "#44aa66", "#999", "#e0aa22"];
const THEMES = {
  light: {
    board: "#f4f1e8",
    boardStroke: "#dedad0",
    railBg: "#eaf0f8",
    midGap: "#e8e4d8",
    holeRing: "#ccc8bc",
    holeRingRail: "#b8cce0",
    holeDark: "#1e1c18",
    colLabel: "#aaa",
    colLabelMod: "#888",
    railRed: "#cc3333",
    railBlue: "#3355cc",
    btnBorder: "#bbb",
    btnText: "#555",
    hint: "#999",
    activeBorder: "#222",
  },
};

type Wire = { x1: number; y1: number; x2: number; y2: number; color?: string };
type Hole = {
  id: string;
  cx: number;
  cy: number;
  sec: string;
  col: number;
  row: number;
  rail: boolean;
};

export function BreadboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    activeColor: colors[0],
    clear: () => {},
    redraw: () => {},
  });
  const [activeColor, setActiveColor] = useState(colors[0]);

  useEffect(() => {
    stateRef.current.activeColor = activeColor;
    stateRef.current.redraw();
  }, [activeColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const T = THEMES.light;
    const P = 24,
      HR = 4.5,
      RING = 3,
      WW = 10,
      LWW = 10,
      LC = "#BD0F32",
      COLS = 42,
      ROWS = 5,
      MX = 20,
      MY = 16;
    const TOP_RAIL_Y = MY,
      TOP_RAILM_Y = MY + P,
      MAIN_Y = MY + 3 * P,
      BOT_RAIL_Y = MAIN_Y + ROWS * P + P,
      BOT_RAILM_Y = BOT_RAIL_Y + P;
    const BW = MX * 2 + (COLS - 1) * P,
      BH = BOT_RAILM_Y + MY;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BW * dpr;
    canvas.height = BH * dpr;
    canvas.style.width = "100%";
    canvas.style.aspectRatio = `${BW} / ${BH}`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const hx = (c: number) => MX + c * P;
    const holes: Hole[] = [];
    for (let c = 0; c < COLS; c++) {
      holes.push(
        {
          id: `tr+${c}`,
          cx: hx(c),
          cy: TOP_RAIL_Y,
          sec: "tr+",
          col: c,
          row: 0,
          rail: true,
        },
        {
          id: `tr-${c}`,
          cx: hx(c),
          cy: TOP_RAILM_Y,
          sec: "tr-",
          col: c,
          row: 1,
          rail: true,
        },
      );
      for (let r = 0; r < ROWS; r++)
        holes.push({
          id: `m${c}_${r}`,
          cx: hx(c),
          cy: MAIN_Y + r * P,
          sec: "m",
          col: c,
          row: r,
          rail: false,
        });
      holes.push(
        {
          id: `br+${c}`,
          cx: hx(c),
          cy: BOT_RAIL_Y,
          sec: "br+",
          col: c,
          row: 0,
          rail: true,
        },
        {
          id: `br-${c}`,
          cx: hx(c),
          cy: BOT_RAILM_Y,
          sec: "br-",
          col: c,
          row: 1,
          rail: true,
        },
      );
    }
    const gh = (sec: string, col: number, row: number) =>
      holes.find((h) => h.sec === sec && h.col === col && h.row === row) ||
      null;
    const nearest = (px: number, py: number) =>
      holes.reduce<Hole | null>(
        (best, h) =>
          Math.hypot(h.cx - px, h.cy - py) <
          (best ? Math.hypot(best.cx - px, best.cy - py) : 14)
            ? h
            : best,
        null,
      );
    const segs = [
      [
        [0, 0, 0, 4],
        [0, 4, 3, 4],
        [3, 4, 3, 2],
        [3, 2, 0, 2],
        [2, 2, 2, 0],
        [2, 0, 0, 0],
      ],
      [
        [0, 2, 0, 4],
        [0, 2, 2, 2],
      ],
      [
        [2, 4, 0, 4],
        [0, 4, 0, 2],
        [0, 2, 2, 2],
        [2, 2, 2, 3],
        [2, 3, 0, 3],
      ],
      [
        [0, 4, 0, 2],
        [0, 2, 2, 2],
        [2, 2, 2, 4],
        [0, 3, 2, 3],
      ],
      [
        [0, 2, 0, 4],
        [0, 4, 2, 4],
        [2, 4, 2, 0],
        [2, 2, 0, 2],
      ],
      [
        [0, 0, 0, 4],
        [0, 4, 2, 4],
        [2, 4, 2, 2],
        [2, 2, 0, 2],
      ],
      [
        [2, 2, 0, 2],
        [0, 2, 0, 4],
        [0, 4, 2, 4],
        [2, 4, 2, 2],
      ],
    ];
    const word = [
      segs[0],
      segs[1],
      segs[2],
      segs[3],
      segs[4],
      segs[5],
      segs[6],
      segs[3],
      segs[1],
      segs[4],
    ];
    const maxCol = (s: number[][]) =>
      Math.max(...s.flatMap(([c1, , c2]) => [c1, c2]));
    let col = 0;
    const offsets = word.map((s) => {
      const o = col;
      col += maxCol(s) + 2;
      return o;
    });
    const letterStart = Math.floor((COLS - (col - 1)) / 2);
    const letterWires: Wire[] = [];
    word.forEach((s, i) => {
      s.forEach(([c1, r1, c2, r2]) => {
        const h1 = gh("m", letterStart + offsets[i] + c1, r1);
        const h2 = gh("m", letterStart + offsets[i] + c2, r2);
        if (h1 && h2)
          letterWires.push({ x1: h1.cx, y1: h1.cy, x2: h2.cx, y2: h2.cy });
      });
    });
    let fromHole: Hole | null = null;
    let userWires: (Wire & { color: string })[] = [];
    let mouse: { x: number; y: number } | null = null;
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };
    const drawWire = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      col: string,
      alpha: number,
      width: number,
      dashed = false,
    ) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(dashed ? [7, 5] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      [
        [x1, y1],
        [x2, y2],
        ...(Math.abs(x1 - x2) > 2 && Math.abs(y1 - y2) > 2 ? [[x2, y1]] : []),
      ].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, width / 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const drawHole = (h: Hole, highlight: boolean) => {
      const ring = highlight
        ? stateRef.current.activeColor
        : h.sec.endsWith("+")
          ? T.railRed
          : h.sec.endsWith("-")
            ? T.railBlue
            : T.holeRing;
      ctx.fillStyle = ring;
      ctx.globalAlpha = highlight ? 1 : h.rail ? 0.5 : 1;
      ctx.beginPath();
      ctx.arc(h.cx, h.cy, HR + RING, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = highlight ? stateRef.current.activeColor : T.holeDark;
      ctx.beginPath();
      ctx.arc(h.cx, h.cy, HR, 0, Math.PI * 2);
      ctx.fill();
    };
    const draw = () => {
      ctx.clearRect(0, 0, BW, BH);
      ctx.fillStyle = T.board;
      rr(0, 0, BW, BH, 8);
      ctx.fill();
      ctx.strokeStyle = T.boardStroke;
      ctx.lineWidth = 1;
      rr(0, 0, BW, BH, 8);
      ctx.stroke();
      ctx.fillStyle = T.railBg;
      rr(2, TOP_RAIL_Y - P / 2 + 2, BW - 4, P * 2 - 4, 5);
      ctx.fill();
      rr(2, BOT_RAIL_Y - P / 2 + 2, BW - 4, P * 2 - 4, 5);
      ctx.fill();
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = T.railRed;
      ctx.fillText("+", 4, TOP_RAIL_Y + 4);
      ctx.fillText("+", 4, BOT_RAIL_Y + 4);
      ctx.fillStyle = T.railBlue;
      ctx.fillText("−", 4, TOP_RAILM_Y + 4);
      ctx.fillText("−", 4, BOT_RAILM_Y + 4);
      ctx.fillStyle = T.midGap;
      ctx.fillRect(4, MAIN_Y + ROWS * P + 2, BW - 8, P - 4);
      ctx.font = "7px monospace";
      ctx.textAlign = "center";
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (c + 1) % 5 === 0 ? T.colLabelMod : T.colLabel;
        ctx.fillText(String(c + 1), hx(c), MAIN_Y + ROWS * P + P / 2 + 2);
      }
      holes.forEach((h) => {
        drawHole(h, fromHole?.id === h.id);
      });
      userWires.forEach((w) => {
        drawWire(w.x1, w.y1, w.x2, w.y2, w.color, 1, WW);
      });
      if (fromHole && mouse)
        drawWire(
          fromHole.cx,
          fromHole.cy,
          mouse.x,
          mouse.y,
          stateRef.current.activeColor,
          0.4,
          WW,
          true,
        );
      letterWires.forEach((w) => {
        drawWire(w.x1, w.y1, w.x2, w.y2, LC, 0.95, LWW);
      });
    };
    const gp = (e: MouseEvent | Touch) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (BW / r.width),
        y: (e.clientY - r.top) * (BH / r.height),
      };
    };
    const click = (e: MouseEvent) => {
      const h = nearest(gp(e).x, gp(e).y);
      if (!h) return;
      if (!fromHole) fromHole = h;
      else {
        if (fromHole.id !== h.id)
          userWires.push({
            x1: fromHole.cx,
            y1: fromHole.cy,
            x2: h.cx,
            y2: h.cy,
            color: stateRef.current.activeColor,
          });
        fromHole = null;
      }
      draw();
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouse = gp(e);
      if (fromHole) draw();
    };
    const handleMouseLeave = () => {
      mouse = null;
      if (fromHole) draw();
    };
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      const x = (t.clientX - r.left) * (BW / r.width);
      const y = (t.clientY - r.top) * (BH / r.height);
      const h = nearest(x, y);
      if (!h) return;
      if (!fromHole) fromHole = h;
      else {
        if (fromHole.id !== h.id) {
          userWires.push({
            x1: fromHole.cx,
            y1: fromHole.cy,
            x2: h.cx,
            y2: h.cy,
            color: stateRef.current.activeColor,
          });
        }
        fromHole = null;
      }
      draw();
    };
    canvas.addEventListener("click", click);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    stateRef.current.clear = () => {
      userWires = [];
      fromHole = null;
      draw();
    };
    stateRef.current.redraw = draw;
    draw();
    return () => {
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const theme = THEMES.light;

  return (
    <div className="font-mono">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="text-xs" style={{ color: theme.hint }}>
          color
        </span>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Select ${c}`}
            className="h-[22px] w-[22px] rounded-full border-[2.5px] transition-transform hover:scale-110"
            style={{
              background: c,
              borderColor:
                activeColor === c ? theme.activeBorder : "transparent",
            }}
            onClick={() => setActiveColor(c)}
          />
        ))}
        <span className="text-xs" style={{ color: theme.hint }}>
          click hole → click hole
        </span>
        <button
          type="button"
          className="rounded-[20px] border px-3.5 py-1 text-xs"
          style={{ borderColor: theme.btnBorder, color: theme.btnText }}
          onClick={() => stateRef.current.clear()}
        >
          clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{
          display: "block",
          cursor: "crosshair",
          borderRadius: 8,
          border: "2px solid #000",
          aspectRatio: "1024 / 272",
        }}
      />
    </div>
  );
}
