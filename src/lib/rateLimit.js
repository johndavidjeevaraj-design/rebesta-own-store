const buckets = new Map();

// Small in-process limiter for local quick-commerce traffic. When the site grows
// past one node/container, this should move to a central edge/Redis limiter.
export function rateLimit({ windowMs = 60_000, max = 60, message = 'Too many requests. Please wait a moment.' }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let row = buckets.get(key);
    if (!row || row.resetAt <= now) {
      row = { count: 0, resetAt: now + windowMs };
      buckets.set(key, row);
    }
    row.count += 1;
    if (row.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((row.resetAt - now) / 1000))));
      return res.status(429).json({ ok: false, error: message });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, row] of buckets) if (row.resetAt <= now) buckets.delete(key);
}, 60_000).unref();
