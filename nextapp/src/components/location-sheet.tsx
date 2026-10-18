"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Crosshair, MapPin, MapPinned, ChevronRight, X } from "lucide-react";
import { api, LOC_AREAS, saveLocation } from "@/lib/store";
import { useToast } from "./toaster";

/* Leaflet + OpenStreetMap (free, no key) — loaded on demand the first time
   someone opens the map. The map itself stays a premium dark-accent surface. */
function loadLeaflet(): Promise<any> {
  return (window as any).__rebestaLeaflet
    ? Promise.resolve((window as any).__rebestaLeaflet)
    : new Promise((resolve, reject) => {
        if (!document.querySelector("#leaflet-css")) {
          const css = document.createElement("link");
          css.id = "leaflet-css";
          css.rel = "stylesheet";
          css.href = "/assets/vendor/leaflet/leaflet.css"; /* self-hosted: CSP blocks unpkg, map never rendered */
          document.head.appendChild(css);
        }
        const js: any = document.querySelector("#leaflet-js");
        if (js) { js.addEventListener("load", () => { (window as any).__rebestaLeaflet = (window as any).L; resolve((window as any).L); }); js.addEventListener("error", reject); return; }
        const script = document.createElement("script");
        script.id = "leaflet-js";
        script.src = "/assets/vendor/leaflet/leaflet.js";
        script.onload = () => { (window as any).__rebestaLeaflet = (window as any).L; resolve((window as any).L); };
        script.onerror = () => reject(new Error("map failed to load"));
        document.head.appendChild(script);
      });
}

const HOSUR: [number, number] = [12.7409, 77.8253];

export function LocationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [pinLabel, setPinLabel] = useState("");
  const [pinPos, setPinPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const leafMapRef = useRef<any>(null);

  /* start the map when the pin view opens */
  useEffect(() => {
    if (!mapOpen) return;
    let dead = false;
    (async () => {
      try {
        const L = await loadLeaflet();
        if (dead || !mapElRef.current || leafMapRef.current) return;
        const saved = JSON.parse(localStorage.getItem("rebesta_own_location_v1") || "null");
        const start: [number, number] = Number.isFinite(saved?.lat) ? [saved.lat, saved.lng] : HOSUR;
        const map = L.map(mapElRef.current, { zoomControl: false, attributionControl: false });
        map.setView(start, 15);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
        const marker = L.marker(map.getCenter(), { draggable: true, icon: L.divIcon({ className: "", html: `<div style="filter:drop-shadow(0 6px 8px rgba(0,0,0,.25))"><svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M12 21c5-3.6 8-7.7 8-11.6C20 5.9 16.4 3 12 3S4 5.9 4 9.4C4 13.3 7 17.4 12 21Z" fill="#0f9d4e"/><circle cx="12" cy="9.6" r="2.6" fill="#fff"/></svg></div>`, iconSize: [34, 34], iconAnchor: [17, 32] }) }).addTo(map);
        const sync = async () => {
          const c = map.getCenter();
          setPinPos({ lat: c.lat, lng: c.lng });
          marker.setLatLng(c);
          try {
            const data: any = await api(`/api/location/reverse?lat=${encodeURIComponent(c.lat)}&lng=${encodeURIComponent(c.lng)}`);
            setPinLabel(data?.location?.label || "Selected spot");
          } catch { setPinLabel("Selected spot"); }
        };
        map.on("moveend", sync);
        marker.on("dragend", (e: any) => map.panTo(e.target.getLatLng()));
        leafMapRef.current = map;
        setMapReady(true);
        sync();
      } catch {
        if (!dead) setMapFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [mapOpen]);

  /* unmount the leaflet map when the pin view closes */
  useEffect(() => {
    if (mapOpen) return;
    if (leafMapRef.current) { try { leafMapRef.current.remove(); } catch {} leafMapRef.current = null; }
    setMapReady(false);
    setMapFailed(false);
    setPinLabel("");
    setPinPos(null);
  }, [mapOpen]);

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
          <SheetTitle className="font-display text-xl font-bold text-forest">What&rsquo;s your location?</SheetTitle>
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
              <span className="block text-[14px] font-bold text-forest">Use my current location</span>
              <span className="block text-[13px] text-muted-foreground">GPS pin — most accurate</span>
            </span>
            <ChevronRight size={16} className="ml-auto text-muted-foreground" />
          </button>

          {status && (
            <p role="status" className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${status.error ? "bg-destructive/10 text-destructive" : "bg-mint text-forest"}`}>
              {status.text}
            </p>
          )}

          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left transition hover:border-leaf/60 hover:shadow-md"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-leaf text-white">
              <MapPinned size={19} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-forest">Pin on map — other areas</span>
              <span className="block text-[13px] text-muted-foreground">Drag the pin to your exact doorstep</span>
            </span>
            <ChevronRight size={16} className="ml-auto text-muted-foreground" />
          </button>

          <div className="pt-1">
            <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or pick your area <span className="h-px flex-1 bg-border" />
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LOC_AREAS.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => choose(a.lat, a.lng, a.name, "area")}
                  className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-[13px] font-bold text-ink transition hover:border-leaf/60 hover:bg-mint"
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
            className="w-full pt-1 text-center text-[13px] font-bold text-muted-foreground underline-offset-2 hover:text-forest hover:underline"
          >
            Just browsing — I&rsquo;ll set it later
          </button>
        </div>
      </SheetContent>

      {/* premium map pin view — full screen, dark chrome, drag to adjust */}
      {mapOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[95] flex flex-col bg-forest">
          <div className="flex items-center gap-3 bg-forest px-4 py-3.5 text-white">
            <button
              type="button"
              aria-label="Close map"
              onClick={() => setMapOpen(false)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold tracking-tight">Where should we deliver?</p>
              <p className="truncate text-[12px] font-semibold text-white/70">{pinLabel || "Move the map to place your pin"}</p>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-[#0b3d20]">
            <div ref={mapElRef} className="absolute inset-0" style={{ background: "#eef3ee" }} />
            {!mapReady && !mapFailed && (
              <div className="absolute inset-0 grid place-items-center bg-forest/90 text-[13px] font-bold text-white/80">
                Loading map…
              </div>
            )}
            {mapFailed && (
              <div className="absolute inset-0 grid place-items-center bg-forest/95 px-8 text-center">
                <div>
                  <p className="text-[14px] font-bold text-white">Map couldn&rsquo;t load</p>
                  <p className="mt-1 text-[12px] font-semibold text-white/70">Check your internet and try again — or use GPS / pick your area.</p>
                  <button type="button" onClick={() => { setMapFailed(false); setMapOpen(false); }} className="mt-4 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-forest">
                    Back
                  </button>
                </div>
              </div>
            )}
            {mapReady && (
              <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-forest/90 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-lg">
                Drag the map to adjust your delivery pin
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 bg-forest px-4 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-white">
              <MapPin size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-white">{pinLabel || "Selected spot"}</span>
              <span className="block text-[11px] font-semibold text-white/60">{pinPos ? `${pinPos.lat.toFixed(5)}, ${pinPos.lng.toFixed(5)}` : ""}</span>
            </span>
            <button
              type="button"
              disabled={!pinPos}
              onClick={() => {
                if (!pinPos) return;
                choose(pinPos.lat, pinPos.lng, pinLabel || "Map pin", "map-pin");
                setMapOpen(false);
              }}
              className="fresh-grad shrink-0 rounded-full px-6 py-3 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition active:scale-[0.98] disabled:opacity-50"
            >
              Deliver here
            </button>
          </div>
        </div>,
        document.body
      )}
    </Sheet>
  );
}
