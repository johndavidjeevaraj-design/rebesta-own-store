"use client";

import { useEffect, useState } from "react";
import { api, Settings } from "@/lib/store";

/* FSSAI license line — fills from /api/settings, hides if absent. */
export function FssaiLine() {
  const [fssai, setFssai] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    api("/api/settings")
      .then((d: Settings) => {
        if (live) setFssai(d?.business?.fssai || null);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (ready && !fssai) return null;
  return (
    <p className="fssai-line">
      FSSAI license number: <strong>{fssai || "—"}</strong>
    </p>
  );
}
