# 🔄 Migration Playbook — Google Cloud → Hostinger (Day 80)

**The plan:** 3 months of free Google Cloud (₹25,000 credit) are ending → move to Hostinger for permanent India-speed hosting at ~₹707/mo.

**Total time: ~45 minutes · Downtime: ~zero · Every order, coupon and product survives.**

> Ping Arena when you start this — I'm on standby to help with every step.

---

## STEP 1 — Buy the Hostinger server (10 min)

1. **hostinger.in** → VPS Hosting → **KVM 1**
2. Billing: your choice (24-month ≈ ₹707/mo effective — the long-term home now)
3. Setup wizard: location **India** if shown · OS **Ubuntu 24.04** · set a root password and **SAVE IT** 🔑
4. Wait for provisioning → open VPS Overview → **copy the new server IP**

## STEP 2 — Install the store on Hostinger (10 min)

1. hPanel → your VPS → **Browser terminal** → login `root` + password
2. Paste the same ONE command as before:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/johndavidjeevaraj-design/rebesta-own-store/main/deploy/setup-rebesta.sh) rebestafresh.in
```

3. Wait for the ✅s — **save the NEW admin key** it prints (the shop's new password)
4. The store is now running on BOTH servers — old (Google) + new (Hostinger)

## STEP 3 — Move your data across (5 min)

In the **Google Cloud** browser SSH terminal (the OLD server), paste — replacing `NEW_IP` with the Hostinger IP:

```bash
scp /var/rebesta-data/*.json root@NEW_IP:/var/rebesta-data/
```

It asks for the **Hostinger root password** — type it (screen won't show it — normal), Enter.

Then in the **Hostinger** terminal, restart the store so it picks up the real data:

```bash
pm2 restart rebesta-store
```

✅ All orders, products, coupons, reviews and settings are now on the new server.

## STEP 4 — Flip the domain (5 min)

**GoDaddy** → My Products → `rebestafresh.in` → DNS:

- ✏️ Edit the **A** record `@` → **Points to** = the **Hostinger IP** → Save
- `www` (CNAME → @) stays as-is

## STEP 5 — Verify, then retire Google (10 min)

1. Wait 10–30 min → open **https://rebestafresh.in** — should show your real products and (in admin) all orders
2. Quick checks: place a test order · admin loads · packing list shows past orders
3. **Shut down Google billing:**
   - console.cloud.google.com → **Compute Engine** → VM instances → `rebesta-store` → **Delete** (check "delete boot disk" too)
   - **VPC network** → IP addresses → release `rebesta-ip`
   - With VM + IP deleted, Google charges **₹0/month**
   - Optional: Billing account → close it → your **₹1,000 prepay gets refunded** 🎉

## Troubleshooting

| Problem | Fix |
|---|---|
| scp asks "authenticity" yes/no | Type `yes` + Enter |
| New site shows demo data instead of real orders | Step 3's scp failed — check the Hostinger IP and password, retry |
| Old site still loads after 1 hr | DNS propagation — check whatsmydns.net; Caddy on new server: `systemctl reload caddy` |
| Anything scary | Screenshot it → send to Arena 😄 |

---

*Your data is triple-protected during this: old server + new server + the backup file you download from admin every week (right? 😅)*
