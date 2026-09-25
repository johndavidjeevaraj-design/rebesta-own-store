# 🛵 Rebesta Fresh — Delivery Partner App & Live Tracking

**What this gives you:**
- A simple phone app for your delivery partners: **rebestafresh.in/partner**
- Live GPS tracking of every partner on a map in your admin dashboard
- Customers see *"Ramesh is on the way 🛵"* on their Track page in real time

---

## For YOU (the owner) — 5 minute setup

### 1. Add a partner
Admin → **🛵 Delivery partners** panel (below the sales graph) → fill **name + mobile + PIN (4–6 digits)** → **+ Add partner**.

### 2. Give the partner two things (WhatsApp is fine)
- The link: **rebestafresh.in/partner**
- Their mobile number + PIN

### 3. Assign orders each morning
In the **Orders** table, each active order now has a **— assign —** dropdown → pick the partner → done. He instantly sees it on his phone.

### 4. Watch the live map 📡
Admin → **Live delivery tracking** panel. While a partner has tracking ON, his marker moves on the map (refreshes every 10 seconds). Click a marker to see his name and active orders. The 🏪 hub and your 9 km delivery circle are drawn too.

---

## For the PARTNER (their morning)

1. Opens **rebestafresh.in/partner** on their phone (works in any browser — Chrome is fine)
2. Signs in with mobile + PIN
3. Sees today's orders: customer name, address, items, **₹ to collect (COD)**, delivery slot
4. Taps **📍 Navigate** → Google Maps opens with two-wheeler directions to the exact pin
5. Taps **🛵 Start live tracking** → you see him live on the map (uses little battery; he taps again to stop)
6. Per order: **🛒 Collected from shop** → **✅ Delivered** (or **⚠️ Report a problem** — you see the note in the order history)

**Order flow:** assigned → collected (OUT FOR DELIVERY) → delivered. Delivered orders auto-mark cash received and auto-issue loyalty coupons, exactly like the admin dashboard does.

---

## For the CUSTOMER

When their order is on the road, the Track page (rebestafresh.in/track) shows:

> 🛵 **Ramesh is on the way to you!** 1.4 km away · location updated just now

It refreshes automatically every 15 seconds.

---

## Security notes

- Partner PINs are stored hashed — even you can't read them back (you can reset a PIN anytime)
- Partner sessions rotate weekly; a partner only ever sees **their own** assigned orders
- Customer address stays masked on public tracking; partners see full details only for orders assigned to them
- 8 wrong PIN attempts = 15 minute lockout per device

## Troubleshooting

| Problem | Fix |
|---|---|
| Partner not on the map | He must tap "Start live tracking" in his app (it's OFF by default, privacy-first) |
| Marker grey, not moving | Position older than 2 min = his phone lost GPS/screen locked — he taps the app to refresh |
| Partner locked out | Wait 15 min or reset his PIN in admin |
| "No partners yet" in orders table | Add your first partner in the 🛵 panel above the orders table |
