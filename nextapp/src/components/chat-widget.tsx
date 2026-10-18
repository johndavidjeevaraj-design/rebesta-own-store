"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/store";

/* 💬 Rebesta Assistant — floating support chat.
   Answers from /api/support/chat (AI when the owner added a Gemini key in
   Admin, helpful canned answers otherwise) and always offers WhatsApp. */

type Msg = { role: "user" | "assistant"; content: string };
const CHAT_KEY = "rebesta_chat_history";
const GREETING: Msg = {
  role: "assistant",
  content: "Hi! 👋 I'm the Rebesta assistant. Ask me about your order, delivery charges, areas we serve, morning slots or refunds — or tap WhatsApp to talk to the shop directly.",
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
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.03a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.07.81.82-3-.2-.31a8.07 8.07 0 0 1-1.24-4.31c0-4.47 3.64-8.11 8.12-8.11a8.1 8.1 0 0 1 8.11 8.11c0 4.48-3.64 8.12-8.11 8.12zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.5.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.47-.4-.41-.55-.41h-.47c-.16 0-.42.06-.63.3-.22.24-.83.81-.83 1.97s.85 2.29 .97 2.45c.12.16 1.67 2.65 4.05 3.62 .57.24 1.01.39 1.35.5 .57.18 1.09.15 1.5.09 .45-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.46-.28z" />
    </svg>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [wa, setWa] = useState("918438765119");
  const listRef = useRef<HTMLDivElement | null>(null);

  /* restore this visit's conversation + the shop's WhatsApp number */
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

  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-20))); } catch {}
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typing, open]);

  const send = async (text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean || typing) return;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setTyping(true);
    try {
      const d = await api("/api/support/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next.slice(-10) }),
      });
      setMessages([...next, { role: "assistant", content: String(d?.reply || "Please WhatsApp us — we reply fast! 💬") }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn't reach the shop brain just now 😅 — please tap the WhatsApp button above, we reply fast!" }]);
    } finally {
      setTyping(false);
    }
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

  return (
    <>
      {/* floating bubble */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with Rebesta"}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22, delay: 0.8 }}
        whileTap={{ scale: 0.9 }}
        className="fresh-grad fixed bottom-24 right-4 z-50 grid h-14 w-14 cursor-pointer place-items-center rounded-full text-white shadow-[0_10px_28px_rgba(11,124,49,0.45)] md:bottom-5"
      >
        <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#34c759]" />
        {open ? <X size={22} strokeWidth={2.4} /> : <MessageCircle size={24} strokeWidth={2.2} />}
      </motion.button>

      {/* chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed bottom-[168px] right-4 z-50 flex h-[min(72vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_24px_60px_rgba(0,0,0,0.22)] md:bottom-[84px]"
            role="dialog"
            aria-label="Rebesta support chat"
          >
            {/* header */}
            <div className="fresh-grad flex items-center gap-3 px-4 py-3.5 text-white">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-[17px]">🥬</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold leading-tight">Rebesta Assistant</p>
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#7dffa4]" /> replies instantly · WhatsApp for a human
                </p>
              </div>
              <a
                href={waHref()}
                target="_blank"
                rel="noopener"
                onClick={escalate}
                aria-label="Chat on WhatsApp"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white transition hover:brightness-110 active:scale-95"
              >
                <WhatsAppIcon size={18} />
              </a>
            </div>

            {/* messages */}
            <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-[#f7f9f4] px-3.5 py-4">
              {(messages.length === 0 ? [GREETING] : messages).map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] font-medium leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-md bg-leaf text-white"
                        : "rounded-bl-md border border-line bg-white text-ink shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                    }`}
                  >
                    {m.content}
                  </p>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <p className="rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-[13px] text-muted-foreground shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce [animation-delay:0ms]">·</span>
                      <span className="animate-bounce [animation-delay:150ms]">·</span>
                      <span className="animate-bounce [animation-delay:300ms]">·</span>
                    </span>
                  </p>
                </div>
              )}

              {/* quick questions */}
              {messages.length <= 1 && !typing && (
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="rounded-full border border-leaf/35 bg-white px-3 py-1.5 text-[12px] font-semibold text-leaf transition hover:bg-leaf hover:text-white active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-center gap-2 border-t border-line bg-white px-3 py-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question…"
                maxLength={500}
                aria-label="Your message"
                className="h-11 flex-1 rounded-full border border-line bg-[#f7f9f4] px-4 text-[13px] font-medium text-ink outline-none transition placeholder:text-muted-foreground focus:border-leaf/50 focus:bg-white"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                aria-label="Send"
                className="fresh-grad grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40"
              >
                <Send size={17} strokeWidth={2.4} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
