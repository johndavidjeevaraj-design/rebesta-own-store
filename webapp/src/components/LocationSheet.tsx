import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, MapPin } from 'lucide-react';
import { LOC_AREAS, saveLocation } from '../shared/store';

export default function LocationSheet({ onClose, onPicked }: { onClose: () => void; onPicked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const pick = (name: string, lat: number, lng: number) => {
    saveLocation({ label: name, lat, lng });
    onPicked(); onClose();
  };

  const useGps = () => {
    if (!navigator.geolocation) return setError('GPS is not available on this device');
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setBusy(false); pick('My current location', pos.coords.latitude, pos.coords.longitude); },
      () => { setBusy(false); setError('Could not read GPS — pick your area from the list below.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <AnimatePresence>
      <motion.div key="back" className="fixed inset-0 z-[80] bg-forest/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div key="sheet" role="dialog" aria-modal="true" aria-label="Choose delivery location"
        className="fixed left-0 right-0 bottom-0 z-[90] mx-auto max-w-[600px] rounded-t-[26px] bg-white px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto"
        initial={{ y: '103%' }} animate={{ y: 0 }} exit={{ y: '103%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
        <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-line" />
        <h3 className="text-lg font-extrabold text-ink">What's your location?</h3>
        <p className="mt-1 text-sm text-muted">We deliver fresh vegetables every morning — exact pin, fair distance fee.</p>
        <button type="button" onClick={useGps} disabled={busy}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-leaf/20 bg-mint px-4 py-3.5 text-left hover:border-leaf/50 transition disabled:opacity-60">
          <Crosshair size={20} className="text-leaf shrink-0" />
          <span><strong className="block text-[0.95rem] text-forest">{busy ? 'Reading your GPS…' : 'Use my current location'}</strong></span>
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <p className="mt-5 mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-muted">Popular areas in Hosur</p>
        <div className="grid gap-2">
          {LOC_AREAS.map(area => (
            <button key={area.name} type="button" onClick={() => pick(area.name, area.lat, area.lng)}
              className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left hover:border-leaf/50 hover:bg-mint/40 transition">
              <MapPin size={16} className="text-leaf shrink-0" />
              <span className="text-[0.92rem] font-semibold text-ink">{area.name}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
