"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Farm-to-door — Apple-grade scrollytelling, exploded-view edition.
   Architecture:
   • outer 500vh scroll track (100vh per stage), inner sticky 100svh stage
   • ALL motion is driven by ONE value: useSpring(scrollYProgress,
     { stiffness: 140, damping: 26, mass: 0.18, restDelta: 0.0001 })
   • the produce is CUT OUT (transparent WebP) and rendered to a single
     <canvas> — drawImage every rAF tick, zero DOM layout, compositor-only;
     text steps, hotspots and telemetry stay DOM (accessible + tappable)
   • no card box: produce floats in the void over an emerald radial
     spotlight; an elliptical ground shadow expands/contracts as it floats
   • per-stage choreography: 01 macro zoom · 02 hydro-wash scanline +
     micro-bubbles · 03 crate docking (components dock like hardware) ·
     04 cold-lock mist + IoT telemetry · 05 perspective pull-back
   • text steps are DISCRETE (AnimatePresence mode="wait") with Apple-lyrics
     word-by-word scrubbed lighting; mono micro-data tags above headlines
   • haptic digital-crown ticks, 5-segment scrubber, settle system */

type Hotspot = { x: number; y: number; label: string; spec: string };
type DockPart = { cut: string; iw: number; ih: number; from: [number, number, number]; to: [number, number] };

type Phase = {
  image: string; // reduced-motion fallback (jpg card)
  video?: string; // future dawn-footage: drawn to the same canvas
  cut: string; // transparent WebP cutout
  iw: number;
  ih: number;
  step: string;
  tag: string; // mono micro-data tag above the headline
  title: string;
  text: string;
  mode: "macro" | "wash" | "dock" | "cold" | "unbox";
  scale: [number, number];
  hotspots?: Hotspot[];
  parts?: DockPart[];
  chip?: string; // mono telemetry chip over the visual
  chipAt?: number; // window fraction when the chip appears
};

const PHASES: Phase[] = [
  {
    image: "/assets/products/baby-spinach-palak.jpg",
    cut: "/assets/story/cut-baby-spinach-palak.webp",
    iw: 709, ih: 727,
    step: "01",
    tag: "BATCH #04 · 5:00 AM HARVEST",
    title: "Picked at first light",
    text: "Harvested from Hosur's farms before the sun is up — leaves still cool, still carrying the morning dew.",
    mode: "macro",
    scale: [1.45, 1.08],
    chip: "DAWN DEW · 4:1 MACRO",
    chipAt: 0.34,
    hotspots: [{ x: 0.499, y: 0.398, label: "Heirloom seed", spec: "Zero chemical pesticide detected" }],
  },
  {
    image: "/assets/products/heirloom-tomatoes.jpg",
    cut: "/assets/story/cut-heirloom-tomatoes.webp",
    iw: 888, ih: 366,
    step: "02",
    tag: "HYDRO-WASH · BATCH #04",
    title: "Washed, sorted, weighed",
    text: "Every crate is checked and packed the same morning. Nothing sits around, nothing waits for tomorrow.",
    mode: "wash",
    scale: [1.14, 1],
    chip: "99.98% PURITY CHECKED",
    chipAt: 0.42,
    hotspots: [{ x: 0.534, y: 0.536, label: "8.9° Brix sugar index", spec: "Sniped at vine-ripeness" }],
  },
  {
    image: "/assets/products/weekly-family-combo.jpg",
    cut: "/assets/story/cut-weekly-family-combo.webp",
    iw: 859, ih: 421,
    step: "03",
    tag: "PACK LINE · CRATE #RB-04",
    title: "Packed in your crate",
    text: "Your basket is assembled to order — the exact vegetables you picked, never pre-bagged, never mixed up.",
    mode: "dock",
    scale: [1.16, 1],
    parts: [
      { cut: "/assets/story/cut-heirloom-tomatoes.webp", iw: 888, ih: 366, from: [-0.55, -0.95, -22], to: [-0.21, -0.4] },
      { cut: "/assets/story/cut-capsicum-red.webp", iw: 721, ih: 377, from: [0.46, -1.08, 18], to: [0.01, -0.48] },
      { cut: "/assets/story/cut-broccoli.webp", iw: 900, ih: 777, from: [0.6, -0.9, 26], to: [0.23, -0.36] },
    ],
    hotspots: [{ x: 0.389, y: 0.67, label: "Pine slat construction", spec: "0.00g single-use plastic" }],
  },
  {
    image: "/assets/products/carrot-ooty.jpg",
    cut: "/assets/story/cut-carrot-ooty.webp",
    iw: 900, ih: 314,
    step: "04",
    tag: "COLD-LOCK · 3.8°C",
    title: "Riding out at sunrise",
    text: "Our riders leave at dawn while the city is still asleep, so freshness doesn't spend its day in traffic.",
    mode: "cold",
    scale: [1.14, 1],
    chip: "3.8°C LOCKED · EV POD #04",
    chipAt: 0.3,
  },
  {
    image: "/assets/products/mixed-greens-box.jpg",
    cut: "/assets/story/cut-mixed-greens-box.webp",
    iw: 814, ih: 400,
    step: "05",
    tag: "LAST MILE · EV POD #04",
    title: "At your door by morning",
    text: "From farm to doorstep in hours, inside your two-hour slot. That's the whole story.",
    mode: "unbox",
    scale: [1.18, 0.86],
  },
];

const SPRING = { stiffness: 140, damping: 26, mass: 0.18, restDelta: 0.0001 };
const SF_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* ── shared stage math — canvas and DOM layers read the SAME numbers so
   hotspots track the produce perfectly ── */
const lerp = (x0: number, x1: number, t: number) => x0 + (x1 - x0) * t;
const easeOut3 = (x: number) => 1 - Math.pow(1 - x, 3);
const floatAt = (t: number) => Math.sin(Math.PI * Math.min(1, t * 1.15)); // 0→1→0 rise & land

function windowRamp(i: number, n: number): { xs: number[]; ys: number[] } {
  const a = i / n, b = (i + 1) / n;
  if (i === 0) return { xs: [-1, 0, b - 0.02, b + 0.08], ys: [1, 1, 1, 0] };
  if (i === n - 1) return { xs: [a - 0.08, a + 0.02, 2, 3], ys: [0, 1, 1, 1] };
  return { xs: [a - 0.08, a + 0.02, b - 0.02, b + 0.08], ys: [0, 1, 1, 0] };
}
const ramp = (v: number, xs: number[], ys: number[]) => {
  if (v <= xs[0]) return ys[0];
  if (v >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let k = 0; k < xs.length - 1; k++) {
    if (v <= xs[k + 1]) return lerp(ys[k], ys[k + 1], (v - xs[k]) / (xs[k + 1] - xs[k]));
  }
  return ys[ys.length - 1];
};

type ImgSrc = HTMLImageElement | HTMLVideoElement;
const isReady = (el: ImgSrc | undefined): el is ImgSrc =>
  !!el && (el instanceof HTMLVideoElement ? el.readyState >= 2 : (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);

/* the canvas engine — one draw loop for every stage. drawImage only:
   no DOM layout, no style recalc, 120Hz-capable. */
function StageCanvas({ progress, phases }: { progress: MotionValue<number>; phases: Phase[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, cvs = cvsRef.current;
    if (!wrap || !cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    /* preload every cutout (and future video) once */
    const srcs = new Map<string, ImgSrc>();
    for (const p of phases) {
      if (!srcs.has(p.cut)) {
        const img = new Image();
        img.src = p.cut;
        img.decoding = "async";
        srcs.set(p.cut, img);
      }
      if (p.video && !srcs.has(p.video)) {
        const vid = document.createElement("video");
        vid.src = p.video; vid.muted = true; vid.loop = true; vid.playsInline = true;
        vid.play().catch(() => {});
        srcs.set(p.video, vid);
      }
      p.parts?.forEach((d) => {
        if (!srcs.has(d.cut)) { const img = new Image(); img.src = d.cut; img.decoding = "async"; srcs.set(d.cut, img); }
      });
    }

    let W = 0, H = 0, visible = true, raf = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const d = Math.min(2, window.devicePixelRatio || 1);
      let cw = Math.round(r.width * d), ch = Math.round(r.height * d);
      const cap = 1_600_000; // MP budget — lessons from the scrub engine
      if (cw * ch > cap) { const k = Math.sqrt(cap / (cw * ch)); cw = Math.round(cw * k); ch = Math.round(ch * k); }
      cvs.width = cw; cvs.height = ch;
      W = r.width; H = r.height;
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: "12%" });
    io.observe(wrap);

    const n = phases.length;
    const drawStage = (s: Phase, t: number, alpha: number, time: number) => {
      const el = srcs.get(s.video ?? s.cut);
      if (!isReady(el)) return;
      const cx = W / 2, cy = H / 2;
      const r = Math.min(W / s.iw, H / s.ih);
      const rw = s.iw * r, rh = s.ih * r;
      const fl = floatAt(t);
      const fy = -12 * fl;
      const sc = lerp(s.scale[0], s.scale[1], t);
      const PW = rw * sc, PH = rh * sc;

      /* elliptical ground shadow — expands as the produce lands, contracts
         as it floats. Radial gradient = pre-blurred, blur-2xl soft. */
      const gy = cy + PH / 2 + 12;
      const srx = PW * 0.36 * (1 - 0.16 * fl);
      const sry = srx * 0.17;
      ctx.save();
      ctx.globalAlpha = alpha * (0.62 - 0.2 * fl);
      ctx.translate(cx, gy);
      ctx.scale(1, sry / srx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, srx);
      g.addColorStop(0, "rgba(0,0,0,0.9)");
      g.addColorStop(0.65, "rgba(0,0,0,0.38)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, srx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* the produce itself — centered, floating */
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy + fy);
      ctx.scale(sc, sc);
      if (s.mode === "unbox") ctx.rotate(lerp(0.035, 0, t)); // settles level as the camera pulls back
      ctx.drawImage(el, -rw / 2, -rh / 2, rw, rh);
      ctx.restore();

      /* stage 03 — components dock into the crate like precision hardware */
      if (s.parts) {
        for (const part of s.parts) {
          const pel = srcs.get(part.cut);
          if (!isReady(pel)) continue;
          const k = easeOut3(Math.max(0, Math.min(1, (t - 0.05) / 0.72)));
          const pa = Math.max(0, Math.min(1, t / 0.16));
          const pw = W * 0.235, ph = pw * (part.ih / part.iw);
          const px = lerp(part.from[0], part.to[0], k) * W;
          const py = lerp(part.from[1], part.to[1], k) * H;
          const rot = lerp((part.from[2] * Math.PI) / 180, 0, k);
          ctx.save();
          ctx.globalAlpha = alpha * pa;
          ctx.translate(cx + px * sc, cy + fy + py * sc);
          ctx.rotate(rot);
          /* each part carries its own little ground shadow */
          ctx.save();
          ctx.globalAlpha *= 0.4;
          ctx.translate(0, ph / 2 + 8); ctx.scale(1, 0.18);
          const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pw * 0.42);
          pg.addColorStop(0, "rgba(0,0,0,0.8)"); pg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, pw * 0.42, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.drawImage(pel, -pw / 2, -ph / 2, pw, ph);
          ctx.restore();
        }
      }

      const rx = cx - PW / 2, ry = cy + fy - PH / 2;

      /* stage 02 — hydro-wash: purity scanline sweeps the produce */
      if (s.mode === "wash") {
        const sk = (t - 0.12) / 0.73;
        if (sk > 0 && sk < 1) {
          const ly = ry + PH * sk;
          ctx.save();
          ctx.globalAlpha = alpha;
          const grd = ctx.createLinearGradient(0, ly - 26, 0, ly + 26);
          grd.addColorStop(0, "rgba(52,211,153,0)");
          grd.addColorStop(0.5, "rgba(52,211,153,0.2)");
          grd.addColorStop(1, "rgba(52,211,153,0)");
          ctx.fillStyle = grd;
          ctx.fillRect(rx - 10, ly - 26, PW + 20, 52);
          ctx.fillStyle = "rgba(167,243,208,0.85)";
          ctx.fillRect(rx - 10, ly - 1, PW + 20, 2);
          ctx.restore();
        }
        /* micro-bubbles rising through the wash */
        ctx.save();
        ctx.lineWidth = 1;
        for (let i = 0; i < 22; i++) {
          const speed = 30 * (0.55 + (i % 5) / 5);
          const phase = (time * speed + i * 53) % (PH * 1.25);
          const bx = rx + (((i * 97) % 100) / 100) * PW + Math.sin(time * 0.9 + i) * 5;
          const by = ry + PH - phase;
          if (by < ry - 6 || by > ry + PH) continue;
          const br = 1.4 + (i % 4) * 0.7;
          const fade = Math.max(0, Math.min(1, (by - ry) / 26));
          ctx.globalAlpha = alpha * 0.32 * fade;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(209,250,229,0.95)"; ctx.stroke();
          ctx.globalAlpha = alpha * 0.14 * fade;
          ctx.fillStyle = "rgba(209,250,229,1)"; ctx.fill();
        }
        ctx.restore();
      }

      /* stage 04 — cold-lock: cool tint + dry-ice mist drifting off the slats */
      if (s.mode === "cold") {
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = alpha * 0.06;
        ctx.fillStyle = "#7dd3fc";
        ctx.fillRect(rx, ry, PW, PH);
        ctx.restore();
        for (let i = 0; i < 3; i++) {
          const mx = (((time * 0.022 + i / 3) % 1) * 0.9 + 0.05) * W;
          const my = H * (0.6 + i * 0.08) + Math.sin(time * 0.35 + i * 2) * 7;
          const mr = W * 0.3;
          const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
          mg.addColorStop(0, `rgba(186,230,253,${(0.09 * alpha).toFixed(3)})`);
          mg.addColorStop(1, "rgba(186,230,253,0)");
          ctx.save();
          ctx.fillStyle = mg;
          ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || W < 2) return;
      const p = Math.max(0, Math.min(1, progress.get()));
      const time = performance.now() / 1000;
      ctx.setTransform(cvs.width / W, 0, 0, cvs.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        if (p < a - 0.08 || p > b + 0.08) continue;
        const { xs, ys } = windowRamp(i, n);
        const t = Math.max(0, Math.min(1, (p - a) / (b - a)));
        drawStage(phases[i], t, ramp(p, xs, ys), time);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [progress, phases]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={cvsRef} data-stage-canvas aria-hidden className="h-full w-full" />
    </div>
  );
}

/* pulsing X-ray hotspot — rides the SAME transform as the canvas produce.
   pointer-events only while its stage is active (an opacity-0 layer must
   never eat taps aimed at the stage below it) */
function Hotspot({ h, open, active, onToggle }: { h: Hotspot; open: boolean; active: boolean; onToggle: () => void }) {
  return (
    <div className="absolute" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, pointerEvents: active ? "auto" : "none" }}>
      <button
        type="button"
        data-hotspot
        aria-expanded={open}
        aria-hidden={!active}
        tabIndex={active ? 0 : -1}
        aria-label={`${h.label} — ${h.spec}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="relative grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center"
      >
        <span className={`absolute h-9 w-9 rounded-full bg-emerald-400/25 ${open ? "" : "rfs-ping"}`} />
        <span className="absolute h-3.5 w-3.5 rounded-full border border-white/70 bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.95)]" />
      </button>
      {open && active && (
        <div
          data-hotspot-tip
          className="absolute bottom-full left-1/2 mb-2 w-max max-w-[230px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#101311]/95 px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          <p className="text-[12px] font-semibold text-white">{h.label}</p>
          <p className="mt-0.5 font-mono text-[10px] tracking-wider text-emerald-300/90">{h.spec}</p>
        </div>
      )}
    </div>
  );
}

/* hotspot layer for one stage — mirrors the canvas produce transform
   (scale + float) so the dots sit ON the produce at all times */
function HotspotLayer({ i, n, phase, progress, step, openIdx, onToggle }: {
  i: number; n: number; phase: Phase; progress: MotionValue<number>; step: number; openIdx: number; onToggle: (k: number) => void;
}) {
  const { xs, ys } = windowRamp(i, n);
  const a = i / n, b = (i + 1) / n;
  const opacity = useTransform(progress, xs, ys);
  const scale = useTransform(progress, [a, b], [phase.scale[0], phase.scale[1]]);
  const y = useTransform(progress, (v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return -12 * floatAt(t);
  });
  /* globally-unique open code: layer × 100 + hotspot — one tooltip on the
     entire section, never the same k across different stages' layers */
  const code = (k: number) => i * 100 + k;
  return (
    <motion.div className="pointer-events-none absolute inset-0" style={{ opacity, scale, y }}>
      <div className="absolute inset-0 m-auto" style={{ aspectRatio: `${phase.iw} / ${phase.ih}`, maxWidth: "100%", maxHeight: "100%" }}>
        {phase.hotspots?.map((h, k) => (
          <Hotspot
            key={k}
            h={h}
            active={step === i}
            open={openIdx === code(k)}
            onToggle={() => onToggle(openIdx === code(k) ? -1 : code(k))}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* mono telemetry chip over the visual — appears mid-window */
function StageChip({ i, n, phase, progress }: { i: number; n: number; phase: Phase; progress: MotionValue<number> }) {
  const a = i / n, b = (i + 1) / n;
  const at = phase.chipAt ?? 0.35;
  const opacity = useTransform(progress, [a + (b - a) * at, a + (b - a) * (at + 0.1), b - 0.05, b + 0.03], [0, 1, 1, 0]);
  const cold = phase.mode === "cold";
  return (
    <motion.div
      data-stage-chip
      style={{ opacity }}
      className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2"
    >
      <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur ${cold ? "border-sky-300/25 bg-black/50" : "border-emerald-400/25 bg-black/50"}`}>
        {cold && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]" />}
        <span className={`font-mono text-[10px] tracking-[0.18em] ${cold ? "text-sky-200/90" : "text-emerald-300/90"}`}>{phase.chip}</span>
      </div>
    </motion.div>
  );
}

/* one scrubber segment — fills exactly across its step's scroll range */
function Segment({ i, n, progress, label, onClick }: { i: number; n: number; progress: MotionValue<number>; label: string; onClick: () => void }) {
  const fill = useTransform(progress, [i / n, (i + 1) / n], [0, 1]);
  return (
    <button type="button" onClick={onClick} aria-label={label} className="group relative h-[4px] flex-1 cursor-pointer overflow-hidden rounded-full bg-white/15">
      <motion.span data-fs-fill className="absolute inset-0 origin-left bg-leaf-2 transition-colors group-hover:bg-leaf" style={{ scaleX: fill }} />
    </button>
  );
}

/* Apple-lyrics word — scrubbed from Apple-grey #86868b to radiant white */
function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  const color = useTransform(progress, range, ["#86868b", "#ffffff"]);
  return <motion.span style={{ color }}>{children} </motion.span>;
}

export default function FarmStory() {
  const root = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(false);
  const [openHot, setOpenHot] = useState(-1);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const n = PHASES.length;
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, SPRING);

  /* strict step quantization — the only thing allowed to change React state.
     Clamped on BOTH sides: progress can jitter a hair negative at the exact
     section boundary, and floor(-0.0001 * 5) = -1 would kill the page. */
  const [step, setStep] = useState(0);
  useMotionValueEvent(smooth, "change", (v) => {
    setStep((prev) => {
      const s = Math.max(0, Math.min(n - 1, Math.floor(v * n)));
      return s === prev ? prev : s;
    });
  });
  useEffect(() => { setOpenHot(-1); }, [step]);

  /* haptic step ticks — an ultra-subtle digital-crown blip on every phase
     change. Off by default; the toggle click doubles as the user gesture
     browsers require before audio may play. */
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const lastStepRef = useRef(0);
  useEffect(() => {
    try { setSound(localStorage.getItem("rfs-story-sound") === "1"); } catch { /* private mode */ }
  }, []);
  const tick = () => {
    const ctx = audioRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(2350, t);
    osc.frequency.exponentialRampToValueAtTime(1750, t + 0.03);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  };
  useEffect(() => {
    if (step !== lastStepRef.current) {
      lastStepRef.current = step;
      if (sound) tick();
    }
  }, [step, sound]);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem("rfs-story-sound", next ? "1" : "0"); } catch { /* private mode */ }
    if (next) {
      audioRef.current = audioRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current.resume?.();
      tick();
    }
  };

  const goToPhase = (i: number) => {
    const el = root.current;
    const lenis = (window as any).__lenis;
    if (!el || !lenis) return;
    const per = (el.offsetHeight - window.innerHeight) / n;
    lenis.scrollTo(el.offsetTop + per * (i + 0.5), { duration: 1, easing: (x: number) => 1 - Math.pow(1 - x, 3) });
  };

  /* ── smooth settle ── after scrolling comes to rest the story glides to a
     COMPLETE phase. Clean bands rest untouched; blend zones complete in the
     scroll direction; user input instantly takes over. */
  useEffect(() => {
    if (reduced || !root.current) return;
    type LenisLike = {
      scroll: number;
      animatedScroll: number;
      on: (e: string, cb: (p: { direction: number }) => void) => void;
      off?: (e: string, cb: (p: { direction: number }) => void) => void;
      scrollTo: (t: number, o?: Record<string, unknown>) => void;
    };
    const attachSettle = (lenis: LenisLike) => {
      const el = root.current!;
      const startY = () => el.offsetTop;
      const endY = () => Math.max(1, el.offsetTop + el.offsetHeight - window.innerHeight);
      const spanY = () => endY() - startY();
      const unitAt = (y: number) => ((y - startY()) / spanY()) * n;
      const yAt = (u: number) => startY() + (spanY() * u) / n;
      const centers = PHASES.map((_, i) => i + 0.5);

      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      let gestureU = -1;
      let lastDir = 1;
      let gliding = false;
      let glideTarget = -1;

      const glide = (target: number, fromU: number) => {
        gliding = true;
        glideTarget = target;
        lenis.scrollTo(yAt(target), {
          duration: Math.min(1.5, 0.5 + Math.abs(target - fromU) * 0.6),
          easing: (x: number) => 1 - Math.pow(1 - x, 3),
          onComplete: () => {
            gliding = false;
            glideTarget = -1;
            gestureU = target;
          },
        });
      };

      const settle = () => {
        if (el.offsetHeight <= window.innerHeight) return;
        const y = lenis.scroll ?? window.scrollY;
        const u = unitAt(y);
        if (u <= 0.35 || u >= n - 0.4) { gestureU = -1; return; } // entering/leaving — free
        const nearest = centers.reduce((a, b) => (Math.abs(b - u) < Math.abs(a - u) ? b : a));
        if (Math.abs(nearest - u) <= 0.2) { gestureU = nearest; return; } // clean rest — hands off
        const dir = gestureU >= 0 && u !== gestureU ? Math.sign(u - gestureU) : lastDir;
        const target =
          dir >= 0
            ? centers.find((c) => c > u) ?? centers[n - 1]
            : [...centers].reverse().find((c) => c < u) ?? centers[0];
        if (Math.abs(yAt(target) - y) < 4) { gestureU = target; return; }
        glide(target, u);
      };

      const onLenisScroll = ({ direction }: { direction: number }) => {
        if (!gliding && direction) lastDir = direction;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 170);
      };
      lenis.on("scroll", onLenisScroll);

      let prevWheelT = 0, lastWheelT = 0;
      const onUser = (e: Event) => {
        clearTimeout(settleTimer);
        const t = performance.now();
        if (e.type === "wheel") { prevWheelT = lastWheelT; lastWheelT = t; }
        if (gliding && glideTarget >= 0) {
          let deliberate = e.type !== "wheel" || t - prevWheelT < 220;
          if (!deliberate && e.type === "wheel") {
            const we = e as WheelEvent;
            const glideDown = yAt(glideTarget) > (lenis.scroll ?? window.scrollY);
            const opposes = we.deltaY > 0 !== glideDown;
            deliberate = opposes && Math.abs(we.deltaY) >= 15;
          }
          if (deliberate) {
            lenis.scrollTo(lenis.animatedScroll, { immediate: true, force: true });
            gliding = false;
            glideTarget = -1;
          } else {
            glide(glideTarget, unitAt(lenis.scroll ?? window.scrollY));
            return;
          }
        }
        const u = unitAt(lenis.scroll ?? window.scrollY);
        gestureU = u >= 0 && u <= n ? u : -1;
        settleTimer = setTimeout(settle, 170);
      };
      window.addEventListener("wheel", onUser, { passive: true });
      window.addEventListener("touchstart", onUser, { passive: true });
      window.addEventListener("keydown", onUser);

      const onVisible = () => {
        if (document.visibilityState === "visible") {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(settle, 300);
        }
      };
      document.addEventListener("visibilitychange", onVisible);

      return () => {
        lenis.off?.("scroll", onLenisScroll);
        window.removeEventListener("wheel", onUser);
        window.removeEventListener("touchstart", onUser);
        window.removeEventListener("keydown", onUser);
        document.removeEventListener("visibilitychange", onVisible);
        clearTimeout(settleTimer);
      };
    };

    let storyCleanup: (() => void) | undefined;
    const lenisNow = (window as any).__lenis as LenisLike | undefined;
    if (lenisNow) {
      storyCleanup = attachSettle(lenisNow);
    } else {
      let tries = 0;
      const poll = setInterval(() => {
        const l = (window as any).__lenis as LenisLike | undefined;
        if (l) { clearInterval(poll); storyCleanup = attachSettle(l); }
        else if (++tries > 50) clearInterval(poll);
      }, 100);
      storyCleanup = () => clearInterval(poll);
    }

    /* content above this section shifts layout after mount — keep other
       ScrollTriggers on the page honest */
    gsap.registerPlugin(ScrollTrigger);
    let raf = 0;
    const debounced = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => ScrollTrigger.refresh()); };
    window.addEventListener("load", debounced);
    document.addEventListener("load", debounced, true);
    const ro = new ResizeObserver(debounced);
    ro.observe(document.body);
    const t1 = setTimeout(debounced, 350);
    const t2 = setTimeout(debounced, 1200);

    return () => {
      storyCleanup?.();
      window.removeEventListener("load", debounced);
      document.removeEventListener("load", debounced, true);
      ro.disconnect();
      clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* reduced motion: same story, told as a calm stacked column */
  if (reduced) {
    return (
      <section id="how" aria-label="How it works" className="bg-[#0b0d0c] py-20 text-white">
        <div className="mx-auto max-w-6xl space-y-16 px-4">
          <p className="font-mono text-[11px] tracking-widest text-emerald-400">FARM TO DOOR / BATCH #04 / 5:00 AM HARVEST</p>
          {PHASES.map((p) => (
            <div key={p.step} className="grid items-center gap-6 md:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.title} loading="lazy" className="aspect-[4/3] w-full rounded-[24px] object-cover" />
              <div>
                <p className="font-mono text-[11px] tracking-[0.18em] text-emerald-400/80">{p.tag}</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-tight sm:text-[28px]">{p.title}</h2>
                <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-white/70">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="how"
      ref={root}
      aria-label="How it works — farm to door story"
      className="relative h-[500vh] bg-[#0b0d0c]"
      style={{ fontFamily: SF_STACK }}
      /* outer scroll track: 500vh = ~100vh per stage for the 5-step sequence */
    >
      <style>{`@keyframes rfsPing { 0% { transform: scale(0.6); opacity: 0.9 } 80%, 100% { transform: scale(1.9); opacity: 0 } } .rfs-ping { animation: rfsPing 2.2s cubic-bezier(0,0,0.2,1) infinite }`}</style>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden [transform:translateZ(0)] [backface-visibility:hidden] [perspective:1000px] will-change-transform">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.12fr_1fr] md:gap-14">
          {/* visual — cut produce floating in the void. NO card box: no
              background, no rounding, no clipping. Spotlight + canvas. */}
          <div className="relative aspect-[4/3] w-full sm:aspect-[16/11]" onClick={() => setOpenHot(-1)}>
            {/* the emerald studio spotlight behind the produce */}
            <div
              className="pointer-events-none absolute inset-[-14%]"
              style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)" }}
            />
            <StageCanvas progress={smooth} phases={PHASES} />
            {PHASES.map((p, i) =>
              p.hotspots?.length ? (
                <HotspotLayer key={p.step} i={i} n={n} phase={p} progress={smooth} step={step} openIdx={openHot} onToggle={setOpenHot} />
              ) : null
            )}
            {PHASES.map((p, i) => (p.chip ? <StageChip key={p.step} i={i} n={n} phase={p} progress={smooth} /> : null))}
          </div>

          {/* copy — ONE step at a time. AnimatePresence mode="wait": the
              outgoing step exits fully before the incoming mounts */}
          <div className="relative min-h-[240px] md:min-h-[260px]">
            <p className="font-mono text-[11px] tracking-widest text-emerald-400">FARM TO DOOR / BATCH #04 / 5:00 AM HARVEST</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                data-fs-step={step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-x-0 top-8"
              >
                <p className="font-mono text-[11px] tracking-[0.18em] text-emerald-400/80">{PHASES[step].tag}</p>
                <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[32px]">
                  {PHASES[step].title}
                </h2>
                {/* word-by-word scrubbed lighting — Apple lyrics style */}
                <p className="mt-4 max-w-md text-[15px] font-medium leading-relaxed">
                  {(() => {
                    const a = step / n;
                    const b = (step + 1) / n;
                    const words = PHASES[step].text.split(" ");
                    const litFrom = a + (b - a) * 0.18;
                    const litTo = a + (b - a) * 0.9;
                    const per = (litTo - litFrom) / words.length;
                    return words.map((w, k) => (
                      <Word key={k} progress={smooth} range={[litFrom + k * per, litFrom + k * per + per * 2.4]}>
                        {w}
                      </Word>
                    ));
                  })()}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* 5-segment scrubber — bar N fills across step N's range; tap to go */}
            <div className="absolute inset-x-0 bottom-0">
              <div className="flex items-center gap-2">
                {PHASES.map((p, i) => (
                  <Segment key={p.step} i={i} n={n} progress={smooth} label={`Go to step ${p.step}: ${p.title}`} onClick={() => goToPhase(i)} />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-bold tabular-nums text-white/40">
                <span>01</span>
                <span>02</span>
                <span>03</span>
                <span>04</span>
                <span>05</span>
                <button
                  type="button"
                  onClick={toggleSound}
                  aria-label={sound ? "Mute step sounds" : "Play step sounds"}
                  aria-pressed={sound}
                  className="-mr-1 ml-3 shrink-0 text-white/40 transition hover:text-white/85"
                >
                  {sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
