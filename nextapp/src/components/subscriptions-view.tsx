"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, CheckCircle2, MapPin, Pause, Play, ShoppingBasket, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { api } from "@/lib/store";

interface Sub {
  id: string; status: string; weekday?: number; weekdayLabel?: string; nextRunOn?: string;
  itemCount?: number; slotId?: string; address?: { line1?: string; area?: string; city?: string };
  pauseReason?: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SubscriptionsView() {
  const [phone, setPhone] = useState("");
  const [statePhone, setStatePhone] = useState("");
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [toast, setToast] = useState<{ kind: string; text: string } | null>(null);
  const [empty, setEmpty] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootRef = useRef(false);

  const say = (text: string, kind = "info") => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  async function load(ph: string) {
    setSubs(null);
    setEmpty(false);
    setMsg({ kind: "info", text: "Loading…" });
    try {
      const data: any = await api(`/api/subscriptions?phone=${encodeURIComponent(ph)}`);
      if (!data.subscriptions?.length) {
        setEmpty(true);
        setMsg(null);
        return;
      }
      setSubs(data.subscriptions);
      setMsg(null);
    } catch (error: any) {
      setMsg({ kind: "error", text: error?.message || "Could not load subscriptions" });
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const ph = phone.replace(/\D/g, "").slice(-10);
    if (ph.length !== 10) { say("Enter a valid 10-digit mobile number", "error"); return; }
    setStatePhone(ph);
    load(ph);
  }

  /* ?phone= prefill auto-submits */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const prefill = new URLSearchParams(location.search).get("phone");
    if (prefill) {
      const ph = prefill.replace(/\D/g, "").slice(-10);
      setPhone(ph);
      setStatePhone(ph);
      load(ph);
    }
  }, []);

  async function act(action: string, id: string) {
    try {
      await api(`/api/subscriptions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ phone: statePhone, action }) });
      say(action === "cancel" ? "Subscription cancelled" : action === "pause" ? "Subscription paused — no order next week" : "Subscription resumed", "success");
      await load(statePhone);
    } catch (error: any) {
      say(error?.message || "Could not update", "error");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="pb-20">
        <section className="mx-auto max-w-xl px-4 pt-14 sm:pt-16">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Set &amp; forget</p>
          <h1 className="mt-3 font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[3rem]">Your weekly veg basket.</h1>
          <p className="mt-3 text-[1rem] font-medium leading-relaxed text-muted-foreground">
            Same fresh vegetables, same morning slot, every week. Pay on delivery each time. Pause, resume or cancel anytime — no charges, no calls.
          </p>

          <form data-sub-lookup onSubmit={submit} className="mt-8 flex gap-3">
            <Input
              id="subPhone" inputMode="numeric" maxLength={10} autoComplete="tel" required
              placeholder="10-digit number used on your orders" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 flex-1 rounded-xl border-line-2 bg-white text-[0.95rem] font-medium placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ink/20"
            />
            <Button type="submit" data-sub-find className="h-12 rounded-xl bg-ink px-6 text-[0.9rem] font-bold text-white hover:bg-ink/90">
              Show
            </Button>
          </form>

          <div data-sub-list className="mt-6">
            {msg && (
              <div className={`rounded-2xl px-5 py-4 text-[0.9rem] font-semibold ${msg.kind === "error" ? "bg-carrot/10 text-[#c8400f]" : "bg-[#f5f5f7] text-muted-foreground"}`}>
                {msg.text}
              </div>
            )}

            {empty && (
              <Card className="gap-0 rounded-2xl border-line bg-[#f5f5f7] p-8 text-center shadow-none">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
                  <ShoppingBasket size={24} strokeWidth={1.8} />
                </span>
                <h3 className="mt-4 text-[1.1rem] font-bold text-ink">No subscriptions on this number</h3>
                <p className="mx-auto mt-2 max-w-xs text-[0.88rem] font-medium leading-relaxed text-muted-foreground">
                  Tick <strong className="text-ink">“Make it a weekly order”</strong> at checkout next time and your basket repeats automatically every week.
                </p>
              </Card>
            )}

            {subs?.map((sub, i) => (
              <motion.div key={sub.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`mb-3 ${sub.status === "ACTIVE" ? "" : "opacity-75"}`}>
                <Card className="gap-0 rounded-2xl border-line p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-[1.05rem] font-extrabold tracking-tight text-ink">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-mint text-leaf"><ShoppingBasket size={15} /></span>
                      Weekly basket
                    </p>
                    {sub.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[0.68rem] font-bold text-leaf"><CheckCircle2 size={12} /> Active</span>
                    ) : sub.status === "PAUSED" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-carrot/10 px-2.5 py-1 text-[0.68rem] font-bold text-[#d84a15]"><Pause size={12} /> Paused</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.06] px-2.5 py-1 text-[0.68rem] font-bold text-muted-foreground">Cancelled</span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2.5 text-[0.9rem] font-medium text-ink">
                    <p className="flex items-center gap-2.5">
                      <CalendarDays size={15} className="shrink-0 text-muted-foreground" />
                      Every <strong>{sub.weekdayLabel || WEEKDAYS[sub.weekday || 0]}</strong>
                      {sub.status === "ACTIVE" && sub.nextRunOn ? <> · next delivery <strong>{sub.nextRunOn}</strong></> : null}
                    </p>
                    <p className="flex items-center gap-2.5">
                      <ShoppingBasket size={15} className="shrink-0 text-muted-foreground" />
                      {sub.itemCount} items · morning slot {sub.slotId === "am1" ? "7–9 AM" : sub.slotId === "am2" ? "9–11 AM" : sub.slotId || ""}
                    </p>
                    <p className="flex items-start gap-2.5">
                      <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{[sub.address?.line1, sub.address?.area, sub.address?.city].filter(Boolean).join(", ") || "Saved address"}</span>
                    </p>
                  </div>

                  {sub.pauseReason && sub.status === "PAUSED" && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-carrot/10 px-3.5 py-2.5 text-[0.8rem] font-semibold text-[#c8400f]">
                      <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {sub.pauseReason}
                    </p>
                  )}
                  {sub.status === "ACTIVE" && (
                    <p className="mt-3 rounded-xl bg-[#f5f5f7] px-3.5 py-2.5 text-[0.78rem] font-medium leading-relaxed text-muted-foreground">
                      An order is created automatically the day before each delivery — you pay on delivery as usual.
                    </p>
                  )}

                  <div className="sub-card-actions mt-5 flex gap-2.5">
                    {sub.status === "ACTIVE" ? (
                      <>
                        <Button variant="ghost" onClick={() => act("pause", sub.id)} className="h-10 rounded-full border border-line-2 bg-white px-5 text-[0.85rem] font-bold text-ink hover:bg-[#f5f5f7]">
                          <Pause size={14} /> Pause
                        </Button>
                        <Button variant="ghost" onClick={() => act("cancel", sub.id)} className="h-10 rounded-full px-5 text-[0.85rem] font-bold text-[#c8400f] hover:bg-carrot/10">
                          <X size={14} /> Cancel
                        </Button>
                      </>
                    ) : sub.status === "PAUSED" ? (
                      <>
                        <Button onClick={() => act("resume", sub.id)} className="h-10 rounded-full bg-leaf px-5 text-[0.85rem] font-bold text-white hover:brightness-110">
                          <Play size={14} /> Resume
                        </Button>
                        <Button variant="ghost" onClick={() => act("cancel", sub.id)} className="h-10 rounded-full px-5 text-[0.85rem] font-bold text-[#c8400f] hover:bg-carrot/10">
                          <X size={14} /> Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="mt-10 text-center text-[0.8rem] font-medium text-muted-foreground">
            Questions about a subscription? WhatsApp us — we reply in minutes.
          </p>
        </section>
      </main>

      <div className={`toast-note fixed inset-x-4 top-20 z-[90] mx-auto max-w-sm transition-all ${toast ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"}`} id="toast">
        {toast && (
          <div className={`rounded-2xl px-5 py-3.5 text-[0.9rem] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.15)] ${toast.kind === "error" ? "bg-carrot text-white" : "bg-ink text-white"}`}>
            {toast.text}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
