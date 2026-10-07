import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MapPin, Mic, Search, ShoppingCart, User, ChevronDown, X } from 'lucide-react';
import { CART_EVENT, cartCount, getSavedLocation, LOCATION_EVENT, SavedLocation } from '../shared/store';
import LocationSheet from './LocationSheet';

const hasSpeech = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export default function Header({ search = '', onSearch }: { search?: string; onSearch?: (q: string) => void; onVoiceAlts?: (alts: string[]) => void }) {
  const loc = useSyncExternalStore(
    cb => { window.addEventListener(LOCATION_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(LOCATION_EVENT, cb); window.removeEventListener('storage', cb); }; },
    getSavedLocation
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const count = useSyncExternalStore(
    cb => { window.addEventListener(CART_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(CART_EVENT, cb); window.removeEventListener('storage', cb); }; },
    () => cartCount()
  );

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !onSearch) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (ev: any) => {
      const alts = Array.from(ev.results[0]).map((r: any) => r.transcript.trim()).filter(Boolean);
      if (!alts.length) return;
      onSearch(alts[0]);
      /* first transcript finds nothing? quietly try the other interpretations */
      if (alts.length > 1) {
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('header input[type="search"]');
          if (el && el.value === alts[0]) return; // parent handled / results shown — nothing to do
        }, 0);
        (rec as any)._alts = alts;
      }
    };
    rec.start();
  }

  return (
    <header className="sticky top-0 z-50 bg-forest/95 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-2.5 grid grid-cols-[1fr_auto] md:grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2.5">
        <button type="button" onClick={() => setSheetOpen(true)} className="flex items-center gap-2 rounded-2xl px-3 py-1.5 -ml-3 text-left hover:bg-white/5 transition">
          <MapPin size={17} className="text-leaf-2 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[0.55rem] font-extrabold uppercase tracking-[0.14em] text-leaf-2/80">Deliver to</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-white/95 max-w-[180px] truncate">
              {loc?.label || 'Set location'} <ChevronDown size={13} className="opacity-70 shrink-0" />
            </span>
          </span>
        </button>

        {onSearch && (
          <div className="order-3 md:order-none col-span-2 md:col-span-1 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="search" value={search} onChange={e => onSearch(e.target.value)}
              placeholder="Search fresh vegetables… (Tamil works too)"
              className="w-full rounded-xl bg-white/10 border border-white/15 py-2.5 pl-10 pr-10 md:pr-9 text-sm text-white placeholder:text-white/45 outline-none focus:bg-white/15 focus:border-leaf-2/60 transition"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search ? (
                <button type="button" onClick={() => onSearch('')} aria-label="Clear search" className="text-white/60 hover:text-white">
                  <X size={15} />
                </button>
              ) : hasSpeech && (
                <button type="button" onClick={startVoice} aria-label="Search by voice" title="Speak to search — Tamil or English"
                  className={`grid place-items-center w-7 h-7 rounded-lg transition ${listening ? 'bg-carrot text-white animate-pulse' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                  <Mic size={15} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <a href="/account" aria-label="Your account" className="grid place-items-center w-11 h-11 rounded-2xl bg-white/10 border border-white/15 hover:bg-white/20 transition">
            <User size={18} className="text-white" />
          </a>
          <a href="/cart" aria-label="Your basket" className="relative grid place-items-center w-11 h-11 rounded-2xl bg-white/10 border border-white/15 hover:bg-white/20 transition">
            <ShoppingCart size={19} className="text-white" />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 grid place-items-center rounded-full bg-carrot text-white text-[0.62rem] font-extrabold border-2 border-forest">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </a>
        </div>
      </div>
      {sheetOpen && <LocationSheet onClose={() => setSheetOpen(false)} onPicked={() => setSheetOpen(false)} />}
    </header>
  );
}
