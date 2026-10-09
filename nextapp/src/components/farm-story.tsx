"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Farm-to-door — the card design, Apple-grade motion.
   Architecture:
   • outer 500vh scroll track (100vh per stage), inner sticky 100svh stage
   • ALL motion is driven by ONE value: useSpring(scrollYProgress,
     { stiffness: 140, damping: 26, mass: 0.18, restDelta: 0.0001 }) — raw
     scroll never touches the render tree
   • visuals crossfade inside the card — opacity/scale only, object-cover,
     100% GPU-composited (no layout properties ever animated)
   • text steps are DISCRETE: AnimatePresence mode="wait" — the outgoing
     step fully exits before the incoming mounts; inactive steps unmount
   • word-by-word Apple-lyrics lighting; haptic digital-crown ticks;
     5-segment scrubber (tap to go); the settle system completes swipes
   • owner is supplying stage photography one by one — stage-1 is live */

type Phase = {
  image: string;
  video?: string; // future: "/assets/story/phase-1.mp4" — muted loop w/ poster
  contain?: boolean; // transparent cutouts: show in full on the card (no crop)
  step: string;
  title: string;
  text: string;
};

const PHASES: Phase[] = [
  {
    image: "/assets/story/stage-1.webp", // owner-supplied cutout — more arriving one by one
    contain: true,
    step: "01",
    title: "Picked at first light",
    text: "Harvested from Hosur's farms before the sun is up — leaves still cool, still carrying the morning dew.",
  },
  {
    image: "/assets/products/heirloom-tomatoes.jpg",
    step: "02",
    title: "Washed, sorted, weighed",
    text: "Every crate is checked and packed the same morning. Nothing sits around, nothing waits for tomorrow.",
  },
  {
    image: "/assets/products/weekly-family-combo.jpg",
    step: "03",
    title: "Packed in your crate",
    text: "Your basket is assembled to order — the exact vegetables you picked, never pre-bagged, never mixed up.",
  },
  {
    image: "/assets/products/carrot-ooty.jpg",
    step: "04",
    title: "Riding out at sunrise",
    text: "Our riders leave at dawn while the city is still asleep, so freshness doesn't spend its day in traffic.",
  },
  {
    image: "/assets/products/mixed-greens-box.jpg",
    step: "05",
    title: "At your door by morning",
    text: "From farm to doorstep in hours, inside your two-hour slot. That's the whole story.",
  },
];

const SPRING = { stiffness: 140, damping: 26, mass: 0.18, restDelta: 0.0001 };

/* one crossfading visual — opacity/scale only, driven by the spring */
function PhaseVisual({ i, n, phase, progress }: { i: number; n: number; phase: Phase; progress: MotionValue<number> }) {
  const a = i / n;
  const b = (i + 1) / n;
  const opacity = useTransform(
    progress,
    i === 0 ? [-1, 0, b - 0.02, b + 0.08] : i === n - 1 ? [a - 0.08, a + 0.02, 2, 3] : [a - 0.08, a + 0.02, b - 0.02, b + 0.08],
    i === 0 ? [1, 1, 1, 0] : i === n - 1 ? [0, 1, 1, 1] : [0, 1, 1, 0]
  );
  const scale = useTransform(progress, [a, b], [1.12, 1]);
  return (
    <motion.div className="absolute inset-0" style={{ opacity, scale }}>
      {phase.video ? (
        <video src={phase.video} poster={phase.image} muted loop playsInline preload="none" className="h-full w-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={phase.image}
          alt={phase.title}
          loading="lazy"
          decoding="async"
          className={phase.contain ? "h-full w-full object-contain" : "h-full w-full object-cover"}
        />
      )}
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

/* Apple-lyrics word — scrubbed from dim grey to radiant white as the
   step's scroll window passes, word by word */
function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  const color = useTransform(progress, range, ["rgba(255,255,255,0.32)", "rgba(255,255,255,1)"]);
  return <motion.span style={{ color }}>{children} </motion.span>;
}

export default function FarmStory() {
  const root = useRef<HTMLElement>(null);
  const [reduced, setReduced] = useState(false);

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf-2">Farm to door</p>
          {PHASES.map((p) => (
            <div key={p.step} className="grid items-center gap-6 md:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.title} loading="lazy" className={`aspect-[4/3] w-full rounded-[24px] bg-white object-cover ${p.contain ? "" : ""}`} />
              <div>
                <p className="text-[13px] font-semibold text-white/50">{p.step} / 0{PHASES.length}</p>
                <h2 className="mt-2 font-display text-[24px] font-semibold tracking-tight sm:text-[28px]">{p.title}</h2>
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
      /* outer scroll track: 500vh = ~100vh per stage for the 5-step sequence */
    >
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden [transform:translateZ(0)] [backface-visibility:hidden] [perspective:1000px] will-change-transform">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.12fr_1fr] md:gap-14">
          {/* visual — the card: crossfading phases inside, spring-driven */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:aspect-[16/11]">
            {PHASES.map((p, i) => (
              <PhaseVisual key={p.step} i={i} n={n} phase={p} progress={smooth} />
            ))}
          </div>

          {/* copy — ONE step at a time. AnimatePresence mode="wait": the
              outgoing step exits fully before the incoming mounts */}
          <div className="relative min-h-[240px] md:min-h-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf-2">Farm to door</p>
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
                <p className="font-display text-[72px] font-bold leading-none text-white/[0.07]" aria-hidden>
                  {PHASES[step].step}
                </p>
                <h2 className="-mt-6 font-display text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
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
