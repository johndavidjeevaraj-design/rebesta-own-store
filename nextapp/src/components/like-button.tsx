"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Heart } from "lucide-react";

const LIKE_KEY = "rebesta_own_likes_v1";

function readLikes(): Record<string, true> {
  try {
    const v = JSON.parse(localStorage.getItem(LIKE_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/* SpaceUI-style like button (no counter): heart pop + particle burst.
   Each liked product is remembered on the device. */
export function LikeButton({
  handle,
  size = 32,
  className = "right-5 top-5",
}: {
  handle: string;
  size?: number;
  className?: string;
}) {
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    setLiked(Boolean(readLikes()[handle]));
  }, [handle]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    try {
      const all = readLikes();
      if (next) all[handle] = true;
      else delete all[handle];
      localStorage.setItem(LIKE_KEY, JSON.stringify(all));
    } catch {}
    if (next) setBurst((b) => b + 1);
    /* let other views (account favourites list) react instantly */
    try { window.dispatchEvent(new CustomEvent("rebesta:likes-changed")); } catch {}
  };

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={{ scale: 0.82 }}
      aria-pressed={liked}
      aria-label={liked ? "Remove from favourites" : "Add to favourites"}
      title={liked ? "Remove from favourites" : "Add to favourites"}
      className={`absolute ${className} z-20 grid cursor-pointer place-items-center rounded-full border border-white/80 bg-white/90 shadow-[0_3px_10px_rgba(0,0,0,0.12)] backdrop-blur-sm`}
      style={{ width: size, height: size }}
    >
      {/* heart pop — keyed so the spring replays on every toggle */}
      <motion.span
        key={String(liked)}
        initial={false}
        animate={liked ? { scale: [1, 1.55, 0.85, 1] } : { scale: [1, 0.72, 1] }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="grid place-items-center"
      >
        <Heart
          size={Math.round(size * 0.55)}
          strokeWidth={2.5}
          className={liked ? "text-carrot" : "text-ink/55"}
          fill={liked ? "currentColor" : "none"}
        />
      </motion.span>

      {/* particle burst on like */}
      {burst > 0 && liked && (
        <span key={burst} className="pointer-events-none absolute inset-0 grid place-items-center">
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const dist = size * 0.68;
            const dot = i % 3 === 0 ? 5 : 3;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.2 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  width: dot,
                  height: dot,
                  borderRadius: 9999,
                  background: i % 2 ? "#d63e0a" : "#ff8b3d",
                }}
              />
            );
          })}
        </span>
      )}
    </motion.button>
  );
}
