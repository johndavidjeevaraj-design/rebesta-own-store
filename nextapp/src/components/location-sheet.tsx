"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Crosshair, MapPin, ChevronRight } from "lucide-react";
import { api, LOC_AREAS, saveLocation } from "@/lib/store";
import { useToast } from "./toaster";

export function LocationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const choose = (lat: number, lng: number, label: string, source: string) => {
    saveLocation({ lat, lng, label, source, savedAt: new Date().toISOString() } as any);
    toast(`Delivering to ${label}`);
    onOpenChange(false);
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      setStatus({ text: "This browser does not support GPS — pick your area below instead.", error: true });
      return;
    }
    setStatus({ text: "Finding your location…" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        let label = "Your location";
        try {
          const data: any = await api(
            `/api/location/reverse?lat=${encodeURIComponent(position.coords.latitude)}&lng=${encodeURIComponent(position.coords.longitude)}`
          );
          label = data.location?.label || label;
        } catch {}
        choose(position.coords.latitude, position.coords.longitude, label, "gps");
      },
      () => setStatus({ text: "Could not get GPS — pick your area below instead.", error: true }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-lg rounded-t-[1.75rem] border-border bg-white p-0 pb-6"
        data-lenis-prevent
      >
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="font-display text-xl font-extrabold text-forest">What&rsquo;s your location?</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Morning delivery across Hosur — we price by real road distance.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-6">
          <button
            type="button"
            onClick={useGps}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-cream p-4 text-left transition hover:border-leaf/60 hover:shadow-md"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-forest text-white">
              <Crosshair size={19} />
            </span>
            <span>
              <span className="block text-[0.95rem] font-extrabold text-forest">Use my current location</span>
              <span className="block text-[0.78rem] text-muted-foreground">GPS pin — most accurate</span>
            </span>
            <ChevronRight size={16} className="ml-auto text-muted-foreground" />
          </button>

          {status && (
            <p role="status" className={`rounded-xl px-3 py-2 text-[0.8rem] font-semibold ${status.error ? "bg-destructive/10 text-destructive" : "bg-mint text-forest"}`}>
              {status.text}
            </p>
          )}

          <div className="pt-1">
            <p className="mb-2.5 flex items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or pick your area <span className="h-px flex-1 bg-border" />
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LOC_AREAS.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => choose(a.lat, a.lng, a.name, "area")}
                  className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-[0.82rem] font-bold text-ink transition hover:border-leaf/60 hover:bg-mint"
                >
                  <MapPin size={13} className="shrink-0 text-leaf" />
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full pt-1 text-center text-[0.78rem] font-bold text-muted-foreground underline-offset-2 hover:text-forest hover:underline"
          >
            Just browsing — I&rsquo;ll set it later
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
