import { useEffect, useRef, useState } from 'react';
import { VanillaBottomNav, VanillaFooter, VanillaHeader, VanillaMobileCartBar } from '../components/VanillaChrome';
import { api } from '../shared/store';

/* Weekly subscriptions manager — port of /js/subscriptions.js.
   Phone lookup → subscription cards with pause / resume / cancel. */

interface Sub {
  id: string; status: string; weekday?: number; weekdayLabel?: string; nextRunOn?: string;
  itemCount?: number; slotId?: string; address?: { line1?: string; area?: string; city?: string };
  pauseReason?: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Subscriptions() {
  const [phone, setPhone] = useState('');
  const [statePhone, setStatePhone] = useState('');
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [toast, setToast] = useState<{ kind: string; text: string } | null>(null);
  const [empty, setEmpty] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootRef = useRef(false);

  const say = (text: string, kind = 'info') => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  async function load(ph: string) {
    setSubs(null);
    setEmpty(false);
    setMsg({ kind: 'info', text: 'Loading…' });
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
      setMsg({ kind: 'error', text: error?.message || 'Could not load subscriptions' });
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const ph = phone.replace(/\D/g, '');
    if (ph.length !== 10) return say('Enter your 10-digit mobile number', 'error');
    setStatePhone(ph);
    load(ph);
  }

  /* ?phone= prefill auto-submits (vanilla requestSubmit) */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const prefill = new URLSearchParams(location.search).get('phone');
    if (prefill) {
      const ph = prefill.replace(/\D/g, '').slice(-10);
      setPhone(ph);
      setStatePhone(ph);
      load(ph);
    }
  }, []);

  async function act(action: string, id: string) {
    try {
      await api(`/api/subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ phone: statePhone, action }) });
      say(action === 'cancel' ? 'Subscription cancelled' : action === 'pause' ? 'Subscription paused — no order next week' : 'Subscription resumed 🥬', 'success');
      await load(statePhone);
    } catch (error: any) {
      say(error?.message || 'Could not update', 'error');
    }
  }

  return (
    <>
      <VanillaHeader />
      <main>
        <section className="section">
          <div className="container narrow">
            <div className="eyebrow">Set &amp; forget</div>
            <h1 className="section-title">Your weekly veg basket 🔁</h1>
            <p className="section-subtitle">Same fresh vegetables, same morning slot, every week. Pay on delivery each time. Pause, resume or cancel anytime — no charges, no calls.</p>
            <div className="shop-panel" style={{ marginTop: '26px' }}>
              <form data-sub-lookup className="form-grid" onSubmit={submit}>
                <div className="field wide"><label htmlFor="subPhone">Mobile number used on your orders</label><input id="subPhone" name="phone" className="num" inputMode="numeric" maxLength={10} autoComplete="tel" placeholder="10-digit number" required value={phone} onChange={e => setPhone(e.target.value)} /></div>
                <button className="button primary wide" type="submit" data-sub-find>Show my subscriptions</button>
              </form>
              <div data-sub-list style={{ marginTop: '18px' }}>
                {msg && <div className={`alert ${msg.kind}`} style={{ margin: 0 }}>{msg.text}</div>}
                {empty && (
                  <div className="empty-state"><h3>No subscriptions on this number</h3><p>Tick <strong>“🔁 Make it a weekly order”</strong> at checkout next time and your basket repeats automatically every week.</p></div>
                )}
                {subs?.map(sub => (
                  <div className={`sub-card ${sub.status === 'ACTIVE' ? '' : 'inactive'}`} key={sub.id}>
                    <div className="sub-card-top">
                      <strong>🥬 Weekly basket</strong>
                      {sub.status === 'ACTIVE' ? <span className="badge green">active</span> : sub.status === 'PAUSED' ? <span className="badge orange">paused</span> : <span className="badge gray">cancelled</span>}
                    </div>
                    <div className="sub-card-row">📅 Every <strong>{sub.weekdayLabel || WEEKDAYS[sub.weekday || 0]}</strong>{sub.status === 'ACTIVE' && sub.nextRunOn ? <> · next delivery <strong>{sub.nextRunOn}</strong></> : ''}</div>
                    <div className="sub-card-row">🧺 {sub.itemCount} items · morning slot {sub.slotId === 'am1' ? '7–9 AM' : sub.slotId === 'am2' ? '9–11 AM' : sub.slotId || ''}</div>
                    <div className="sub-card-row">📍 {[sub.address?.line1, sub.address?.area, sub.address?.city].filter(Boolean).join(', ') || 'Saved address'}</div>
                    {sub.pauseReason && sub.status === 'PAUSED' && <div className="sub-card-note">⚠️ {sub.pauseReason}</div>}
                    {sub.status === 'ACTIVE' && <div className="sub-card-note">An order is created automatically the day before each delivery — you pay on delivery as usual.</div>}
                    <div className="sub-card-actions">
                      {sub.status === 'ACTIVE' ? (
                        <>
                          <button className="button ghost small" type="button" onClick={() => act('pause', sub.id)}>⏸ Pause</button>
                          <button className="button danger small" type="button" onClick={() => act('cancel', sub.id)}>Cancel</button>
                        </>
                      ) : sub.status === 'PAUSED' ? (
                        <>
                          <button className="button primary small" type="button" onClick={() => act('resume', sub.id)}>▶ Resume</button>
                          <button className="button danger small" type="button" onClick={() => act('cancel', sub.id)}>Cancel</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <div className="toast-note" id="toast" hidden={!toast}>
        {toast && <div className={`alert ${toast.kind}`} style={{ margin: 0 }}>{toast.text}</div>}
      </div>
      <VanillaBottomNav />
      <VanillaFooter minimal />
      <VanillaMobileCartBar />
    </>
  );
}
