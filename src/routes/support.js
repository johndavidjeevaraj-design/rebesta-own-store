import { Router } from 'express';
import { supportReply, logSupportQuery, normalizePhoneSupport } from '../lib/support.js';

/* ============ 💬 Support chat (storefront widget) ============ */

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const history = raw
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.trim().slice(0, 800) }));
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    if (!lastUser) return res.status(400).json({ ok: false, error: 'Type a message first' });
    const out = await supportReply(history);
    res.json({ ok: true, reply: out.reply, mode: out.mode });
  } catch (error) {
    console.error(JSON.stringify({ event: 'support.chat.error', error: String(error?.message || error).slice(0, 200) }));
    res.status(500).json({ ok: false, error: 'The assistant is resting — please WhatsApp us, we reply fast!' });
  }
});

/* customer tapped "talk to human" — this is the ticket */
router.post('/escalated', (req, res) => {
  const message = String(req.body?.message || '').slice(0, 500);
  logSupportQuery({ message, phone: normalizePhoneSupport(message), source: 'chat' });
  res.json({ ok: true });
});

export default router;
