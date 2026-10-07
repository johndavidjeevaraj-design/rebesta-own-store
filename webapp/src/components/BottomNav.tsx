import { Home, Activity, MessageCircle } from 'lucide-react';

export default function BottomNav() {
  const item = 'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-white/70 hover:text-white transition';
  return (
    <nav aria-label="Quick navigation" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-forest/97 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch max-w-md mx-auto">
        <a href="/" className={item}><Home size={21} /><span className="text-[0.58rem] font-extrabold uppercase tracking-wide">Home</span></a>
        <a href="/track" className={item}><Activity size={21} /><span className="text-[0.58rem] font-extrabold uppercase tracking-wide">Track</span></a>
        <a href="https://wa.me/918438765119" target="_blank" rel="noopener" className={item}><MessageCircle size={21} /><span className="text-[0.58rem] font-extrabold uppercase tracking-wide">WhatsApp</span></a>
      </div>
    </nav>
  );
}
