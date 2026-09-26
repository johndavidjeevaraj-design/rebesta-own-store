/* Rebesta Fresh — morning route optimisation 🧭
   Nearest-neighbour + 2-opt over a distance matrix (OSRM road table when
   reachable, air-distance fallback otherwise). For a morning's worth of stops
   (< 25) this is instant and near-optimal. */

const ROAD_FALLBACK = 1.25; // air → road detour factor, matches the ETA formula

export function airKm(a, b) {
  if (!a || !b) return 0;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function osrmTableKm(points) {
  const coords = points.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'RebestaFresh-Independent-Store/1.0' } });
    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.distances)) throw new Error(`OSRM ${data.code}`);
    return data.distances.map(row => row.map(metres => Number(metres) / 1000));
  } finally {
    clearTimeout(timer);
  }
}

export async function routeMatrixKm(points) {
  try {
    const matrix = await osrmTableKm(points);
    // sanity: every value finite and non-negative
    if (matrix.length === points.length && matrix.every(row => row.length === points.length && row.every(v => Number.isFinite(v) && v >= 0))) {
      return { matrix, provider: 'osrm-road' };
    }
    throw new Error('bad matrix');
  } catch {
    const matrix = points.map(a => points.map(b => airKm(a, b) * ROAD_FALLBACK));
    return { matrix, provider: 'air-estimate' };
  }
}

/* Open-path TSP: start at index 0 (hub), visit all, no return leg */
export function optimizeSequence(matrix) {
  const n = matrix.length;
  if (n <= 2) return { seq: n === 2 ? [1] : [], totalKm: n === 2 ? matrix[0][1] : 0 };

  // nearest neighbour seed
  const unvisited = new Set();
  for (let i = 1; i < n; i++) unvisited.add(i);
  const seq = [];
  let current = 0;
  while (unvisited.size) {
    let best = null;
    let bestKm = Infinity;
    for (const i of unvisited) {
      if (matrix[current][i] < bestKm) { bestKm = matrix[current][i]; best = i; }
    }
    seq.push(best);
    unvisited.delete(best);
    current = best;
  }

  const pathKm = s => s.reduce((sum, node, i) => sum + matrix[i === 0 ? 0 : s[i - 1]][node], 0);

  // 2-opt (open path): reverse segments while the total drops
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 0; i < seq.length - 1; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const candidate = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
        if (pathKm(candidate) + 1e-9 < pathKm(seq)) {
          seq.splice(0, seq.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return { seq, totalKm: pathKm(seq) };
}

/* Plan a partner's morning: ordered stops with per-stop ETA + one Google Maps link */
export async function planRoute({ hub, stops, startHour = 7 }) {
  const usable = stops.filter(s => s.location && Number.isFinite(Number(s.location.lat)) && Number.isFinite(Number(s.location.lng)));
  if (!hub || !usable.length) return { ordered: [], totalKm: 0, provider: 'none', mapsUrl: null };
  const points = [hub, ...usable.map(s => s.location)];
  const { matrix, provider } = await routeMatrixKm(points);
  const { seq, totalKm } = optimizeSequence(matrix);

  let cumulativeKm = 0;
  let clockMin = Number(startHour) * 60; // slot start, 24h minutes
  const ordered = seq.map((pointIndex, position) => {
    const from = position === 0 ? 0 : seq[position - 1];
    const legKm = matrix[from][pointIndex];
    cumulativeKm += legKm;
    clockMin += Math.ceil((legKm / 18) * 60) + 4; // 18 km/h average + 4 min handover
    return {
      stop: usable[pointIndex - 1],
      stopNumber: position + 1,
      legKm: Math.round(legKm * 10) / 10,
      cumulativeKm: Math.round(cumulativeKm * 10) / 10,
      etaClock: `${String(Math.floor(clockMin / 60) % 24).padStart(2, '0')}:${String(clockMin % 60).padStart(2, '0')}`
    };
  });

  return { ordered, totalKm: Math.round(totalKm * 10) / 10, provider, mapsUrl: mapsDirectionsLink(hub, ordered) };
}

/* Google Maps multi-stop navigation (9 waypoints + destination is the API cap) */
export function mapsDirectionsLink(hub, ordered) {
  if (!ordered.length) return null;
  const pin = s => `${s.location.lat},${s.location.lng}`;
  const capped = ordered.slice(0, 10);
  const url = new URL('https://www.google.com/maps/dir/?api=1');
  url.searchParams.set('origin', `${hub.lat},${hub.lng}`);
  url.searchParams.set('destination', pin(capped[capped.length - 1].stop));
  if (capped.length > 1) url.searchParams.set('waypoints', capped.slice(0, -1).map(s => pin(s.stop)).join('|'));
  url.searchParams.set('travelmode', 'two_wheeler');
  return url.toString();
}
