"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { ArrowUpRight, MessageCircle, Send, X } from "lucide-react";
import rubiAvatar from "./rubi-avatar.webp";
import { api } from "@/lib/store";

/* Rubi — Rebesta Fresh’s quiet, native-feeling support chat for the storefront.
   Answers come from /api/support/chat; WhatsApp remains one tap away. */

type Msg = { role: "user" | "assistant"; content: string };
const CHAT_KEY = "rebesta_chat_history";
const WELCOME_KEY = "rebesta_rubi_welcome_seen";
const GREETING: Msg = {
  role: "assistant",
  content: "Hi! I’m Rubi, your Rebesta assistant. Ask about an order, delivery or refunds — or tap WhatsApp anytime to reach the shop.",
};
const QUICK = [
  "Where is my order?",
  "Delivery charges?",
  "Do you deliver to my area?",
  "Cancellation & refunds",
];

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.03a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.07.81.82-3-.2-.31a8.07 8.07 0 0 1-1.24-4.31c0-4.47 3.64-8.11 8.12-8.11a8.1 8.1 0 0 1 8.11 8.11c0 4.48-3.64 8.12-8.11 8.12zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.5.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.47-.4-.41-.55-.41h-.47c-.16 0-.42.06-.63.3-.22.24-.83.81-.83 1.97s.85 2.29.97 2.45c.12.16 1.67 2.65 4.05 3.62.57.24 1.01.39 1.35.5.57.18 1.09.15 1.5.09.45-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.46-.28z" />
    </svg>
  );
}

function RubiAvatar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#eef6ff] ring-1 ring-[#2f80ed]/15 ${className}`}
      aria-hidden="true"
    >
      <Image src={rubiAvatar} alt="" width={512} height={512} unoptimized className="h-full w-full object-cover" />
    </span>
  );
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index} className="rounded bg-black/[0.05] px-1 py-0.5 font-mono text-[0.92em]">{part.slice(1, -1)}</code>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function ChatWidget({ avoidCheckoutBar = false }: { avoidCheckoutBar?: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const panelDock = avoidCheckoutBar
    ? "bottom-[calc(152px+env(safe-area-inset-bottom))] md:bottom-24"
    : "bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-6";
  const launcherDock = avoidCheckoutBar
    ? "bottom-[calc(164px+env(safe-area-inset-bottom))] md:bottom-24"
    : "bottom-24 md:bottom-6";
  const welcomeDock = avoidCheckoutBar
    ? "bottom-[calc(236px+env(safe-area-inset-bottom))] md:bottom-[164px]"
    : "bottom-[calc(168px+env(safe-area-inset-bottom))] md:bottom-24";
  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [wa, setWa] = useState("918438765119");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const typingRef = useRef(false);

  /* Restore this visit's conversation and the shop's WhatsApp number. */
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) setMessages(saved.slice(-20));
    } catch {}
    api("/api/settings")
      .then((d: any) => {
        const digits = String(d?.business?.whatsapp || "").replace(/\D/g, "");
        if (digits) setWa(digits);
      })
      .catch(() => {});
  }, []);

  /* One gentle welcome per browser tab/session; keep it off mobile checkout. */
  useEffect(() => {
    if (open) return;
    try {
      if (sessionStorage.getItem(WELCOME_KEY)) return;
    } catch {}
    if (avoidCheckoutBar && window.matchMedia("(max-width: 767px)").matches) return;
    const timer = window.setTimeout(() => {
      try { sessionStorage.setItem(WELCOME_KEY, "1"); } catch {}
      setWelcomeOpen(true);
    }, 1250);
    return () => window.clearTimeout(timer);
  }, [avoidCheckoutBar, open]);

  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-20))); } catch {}
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
    }
  }, [messages, typing, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    /* Focus the composer on desktop, but don't summon a phone keyboard on open. */
    const focusTimer = window.setTimeout(() => {
      if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus({ preventScroll: true });
      else closeRef.current?.focus({ preventScroll: true });
    }, 180);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const send = async (text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean || typingRef.current) return;
    typingRef.current = true;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setTyping(true);
    try {
      const d = await api("/api/support/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next.slice(-10) }),
      });
      setMessages([...next, { role: "assistant", content: String(d?.reply || "Please WhatsApp us — we reply fast!") }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn’t reach the shop just now. Please tap WhatsApp and the team will help you." }]);
    } finally {
      typingRef.current = false;
      setTyping(false);
    }
  };

  const rememberWelcome = () => {
    try { sessionStorage.setItem(WELCOME_KEY, "1"); } catch {}
  };

  const openChat = () => {
    rememberWelcome();
    setWelcomeOpen(false);
    setOpen(true);
  };

  const dismissWelcome = () => {
    rememberWelcome();
    setWelcomeOpen(false);
  };

  const close = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const waHref = () => {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content || "Hi Rebesta! I have a question about my order.";
    return `https://wa.me/${wa}?text=${encodeURIComponent(`Hi Rebesta! ${last.slice(0, 180)}`)}`;
  };

  const escalate = () => {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    try {
      fetch("/api/support/escalated", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: last.slice(0, 500) }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {welcomeOpen && !open && (
          <motion.div
            key="rubi-welcome"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={prefersReducedMotion ? { duration: 0.16 } : { type: "spring", stiffness: 360, damping: 28 }}
            className={`fixed ${welcomeDock} right-3 z-[59] w-[calc(100vw-24px)] max-w-[330px] ${avoidCheckoutBar ? "hidden md:block" : ""}`}
            role="status"
            aria-live="polite"
          >
            <div className="rounded-[22px] border border-[#dcecff] bg-white/95 p-3.5 shadow-[0_18px_52px_rgba(33,108,221,0.18)] ring-1 ring-white/80 backdrop-blur-xl">
              <div className="flex items-start gap-3">
                <motion.div
                  aria-hidden="true"
                  className="mt-0.5"
                  animate={prefersReducedMotion ? undefined : { y: [0, -3, 0], rotate: [0, -2, 2, 0] }}
                  transition={prefersReducedMotion ? undefined : { duration: 2.8, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                >
                  <RubiAvatar className="h-12 w-12 border-2 border-white shadow-[0_3px_10px_rgba(0,0,0,0.12)]" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#1d1d1f]">Hi! I’m Rubi <span aria-hidden="true">🐰</span></p>
                      <p className="mt-0.5 text-[11px] leading-[1.4] text-[#6e6e73]">Need help with an order, delivery or refund?</p>
                    </div>
                    <button
                      type="button"
                      onClick={dismissWelcome}
                      aria-label="Close Rubi welcome"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f3f7fc] text-[#667085] transition hover:bg-[#eaf2fc] hover:text-[#1d1d1f]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={openChat}
                    aria-label="Chat with Rubi"
                    className="carrot-grad mt-2.5 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(232,71,12,0.3)] transition hover:brightness-105 active:scale-[0.98]"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    Chat with Rubi
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="rebesta-chat-panel"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={`fixed ${panelDock} right-3 z-[60] flex h-[min(62vh,540px)] max-h-[calc(100dvh-100px)] w-[calc(100vw-24px)] max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-black/[0.07] bg-white/95 shadow-[0_28px_80px_rgba(0,0,0,0.20)] ring-1 ring-white/80 backdrop-blur-2xl md:right-6 md:h-[min(72vh,620px)] md:w-[400px]`}
            role="dialog"
            aria-label="Rubi support chat"
          >
            {/* Apple-like, calm title bar; green stays as a restrained brand accent. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/85 px-4 py-3 backdrop-blur-xl">
              <RubiAvatar className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">Rubi</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[#6e6e73]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" /> Rebesta Fresh · online now
                </p>
              </div>
              <a
                href={waHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={escalate}
                aria-label="Continue with a person on WhatsApp"
                title="Continue with a person on WhatsApp"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f2f2f7] text-[#25a85a] transition hover:bg-[#e9e9ee] active:scale-[0.97]"
              >
                <WhatsAppIcon size={17} />
              </a>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close chat"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f2f2f7] text-[#6e6e73] transition hover:bg-[#e9e9ee] hover:text-[#1d1d1f] active:scale-[0.96]"
              >
                <X size={17} strokeWidth={2.2} />
              </button>
            </div>

            {/* Conversation */}
            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f5f5f7] px-4 py-4"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Conversation"
            >
              <div className="space-y-3.5">
                {[GREETING, ...messages].map((m, i) => (
                  <div key={`${m.role}-${i}`} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <RubiAvatar className="mb-0.5 h-7 w-7" />
                    )}
                    <div
                      className={`max-w-[84%] whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-3 text-[13px] font-normal leading-[1.48] tracking-[-0.005em] ${
                        m.role === "user"
                          ? "rounded-br-[7px] bg-[#2f80ed] text-white shadow-[0_2px_8px_rgba(47,128,237,0.20)]"
                          : "rounded-bl-[7px] border border-black/[0.045] bg-white text-[#1d1d1f] shadow-[0_2px_8px_rgba(0,0,0,0.045)]"
                      }`}
                    >
                      <MessageText text={m.content} />
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="flex items-end gap-2" role="status" aria-label="Rubi is typing">
                    <RubiAvatar className="mb-0.5 h-7 w-7" />
                    <div className="flex h-10 items-center gap-1 rounded-[20px] rounded-bl-[7px] border border-black/[0.045] bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,0.045)]">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8e8e93] [animation-delay:-0.24s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8e8e93] [animation-delay:-0.12s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8e8e93]" />
                    </div>
                  </div>
                )}

                {messages.length === 0 && !typing && (
                  <div className="pl-9 pt-1">
                    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8e8e93]">Common questions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => send(q)}
                          className="group flex min-h-[42px] items-center justify-between gap-1.5 rounded-[14px] border border-black/[0.07] bg-white px-3 py-2 text-left text-[11px] font-semibold leading-[1.3] text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.035)] transition hover:border-[#2f80ed]/25 hover:bg-white active:scale-[0.98]"
                        >
                          <span>{q}</span>
                          <ArrowUpRight size={13} className="shrink-0 text-[#8e8e93] transition group-hover:text-[#2f80ed]" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <form
              onSubmit={(event) => { event.preventDefault(); send(input); }}
              className="shrink-0 border-t border-black/[0.06] bg-white/95 px-3.5 pb-3 pt-3 backdrop-blur-xl"
            >
              <div className="flex items-end gap-2 rounded-[23px] border border-black/[0.08] bg-[#f5f5f7] p-1.5 transition focus-within:border-[#2f80ed]/35 focus-within:ring-4 focus-within:ring-[#2f80ed]/[0.10]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value.slice(0, 500));
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 96)}px`;
                  }}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Message Rubi…"
                  maxLength={500}
                  rows={1}
                  aria-label="Your message"
                  className="max-h-24 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-[14px] font-normal leading-5 text-[#1d1d1f] outline-none placeholder:text-[#8e8e93]"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || typing}
                  aria-label="Send message"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5ca9ff] to-[#216cdd] text-white shadow-[0_3px_10px_rgba(47,128,237,0.28)] transition enabled:hover:brightness-105 enabled:active:scale-[0.94] disabled:opacity-40"
                >
                  <Send size={16} strokeWidth={2.3} />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating launch button — fades away while the panel is open, leaving one clear close control. */}
      <motion.button
        ref={triggerRef}
        type="button"
        onClick={openChat}
        aria-label="Chat with Rubi"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: open ? 0.88 : 1, opacity: open ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 24, delay: open ? 0 : 0.35 }}
        whileHover={open ? undefined : { scale: 1.04 }}
        whileTap={open ? undefined : { scale: 0.92 }}
        className={`fixed ${launcherDock} right-4 z-[60] grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#5ca9ff] to-[#216cdd] text-white shadow-[0_10px_28px_rgba(47,128,237,0.38)] md:right-6 ${open ? "pointer-events-none" : "cursor-pointer"}`}
      >
        <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#34c759]" aria-hidden="true" />
        <RubiAvatar className="h-12 w-12 border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.16)]" />
      </motion.button>
    </>
  );
}
