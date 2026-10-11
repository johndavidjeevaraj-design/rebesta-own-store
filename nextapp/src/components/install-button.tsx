"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

/* "Install app" pill — appears only when the browser offers a direct
   install (Android/desktop Chrome via beforeinstallprompt). iPhones keep
   using Share → Add to Home Screen, so the button stays hidden there.
   Never shows when the app is already installed. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    /* already running as an installed app — nothing to offer */
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // take over from Chrome's mini-infobar
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const install = async () => {
    const e = deferred;
    setDeferred(null);
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome !== "accepted") setDeferred(e); // dismissed — they can try again
    } catch {
      /* browser withdrew the prompt — next visit it returns */
    }
  };

  return (
    <button
      type="button"
      onClick={install}
      className="fresh-grad mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold text-white shadow-[0_6px_16px_rgba(11,124,49,0.35)] transition hover:brightness-[1.05] active:scale-[0.97]"
    >
      <Download size={13} strokeWidth={2.5} /> Install app
    </button>
  );
}
