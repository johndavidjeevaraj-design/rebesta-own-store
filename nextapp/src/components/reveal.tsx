"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* GSAP ScrollTrigger reveal — fades/slides children in the first time they
   enter the viewport. Wrap any block; pass `stagger` to cascade children. */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 36,
  stagger = 0,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  stagger?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const targets = stagger ? Array.from(el.children) : [el];
      if (!targets.length) return;
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          delay,
          stagger: stagger || 0,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once },
        }
      );
    }, ref);
    return () => ctx.revert();
  }, [delay, y, stagger, once]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
