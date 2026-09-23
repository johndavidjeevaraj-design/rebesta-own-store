# 🚂 Rebesta Fresh — Hostinger Launch Guide

**Goal:** rebestafresh.in live with 🔒 SSL, taking orders. **Time: ~30 minutes.**
**You need:** UPI payment 💳 · your `rebestafresh.in` domain login · this guide.

---

## STEP 1 — Buy the VPS (5 min)

1. Go to **hostinger.in** → menu → **VPS Hosting**
2. Pick **KVM 1** (the smallest — 1 CPU + 4 GB RAM is 10× more than our store needs)
3. Choose **billing**: monthly (~₹549) or longer term (cheaper per month — 1 year is usually ~₹350/mo). Your choice, both fine.
4. Pay with **UPI** ✅

> 💡 If you see a promo/coupon on their page, use it.

## STEP 2 — Setup the server (3 min)

After payment, hPanel opens a **setup wizard**:

| Question | Your answer |
|---|---|
| Server location | **India (Mumbai)** if shown — else nearest Asia |
| Operating system | **Ubuntu 24.04** (clean/plain OS — *not* a "template" with panel) |
| Root password | Make a strong one → **SAVE IT in your phone notes** 🔑 |

Click create → wait 2–5 min while it builds.

## STEP 3 — Copy the server IP (1 min)

1. hPanel → **VPS** → click your server
2. On the Overview page find **IP address** (looks like `123.45.67.89`)
3. **Copy it** — you'll paste it twice in the next step

## STEP 4 — Point your domain (5 min)

**If your domain is AT Hostinger:** hPanel → **Domains** → `rebestafresh.in` → **DNS / Nameservers** → **Manage DNS** → add/edit these records:

**If your domain is elsewhere** (GoDaddy, BigRock, Namecheap…): open their DNS manager and add the same records:

| Type | Name | Value | TTL |
|---|---|---|---|
| **A** | `@` | your server IP | default |
| **A** | `www` | your server IP | default |

> ⚠️ If there are already A records pointing somewhere else, **edit them** — don't add duplicates.
> Not sure where your domain's DNS is? WhatsApp me the company you bought it from — I'll give exact clicks.

## STEP 5 — The ONE paste 🪄 (8 min)

1. In hPanel VPS page, click **Browser terminal** (opens a black terminal inside your browser — no app needed!)
2. Login: user `root` + the password you saved
3. **Copy this entire line**, paste into the terminal (right-click → paste), press **Enter**:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/johndavidjeevaraj-design/rebesta-own-store/main/deploy/setup-rebesta.sh) rebestafresh.in
```

4. Watch it work — you'll see 9 steps with ✅ marks. Takes 5–8 minutes. ☕
5. At the end it prints a box with:

```
🎉 REBESTA FRESH IS LIVE ON THIS SERVER!
📌 NEXT STEP — point your domain to this IP: ...
🔑 YOUR ADMIN KEY: ┌──────────────────────────┐
                   │  xxxx-xxxx-xxxx...       │
```

6. **COPY THE ADMIN KEY NOW** — paste it in your phone notes. It's your shop's master password. 🔐

## STEP 6 — Open your store 🎉 (10–30 min wait)

DNS takes time to spread around the internet (usually 10–30 min, sometimes 1 hour).

- Check **https://rebestafresh.in** — your store, with the 🔒 padlock, on your own domain!
- The 🔒 appears automatically (Caddy fetches the SSL certificate once DNS is ready)
- Admin: **https://rebestafresh.in/admin** → login with your ADMIN KEY

**First test (do this!):** place one COD order yourself → watch it appear in admin → cancel it from the Track page. If that works, your whole machine works end-to-end. ✅

---

## 🔧 Troubleshooting

| Problem | Fix (paste in browser terminal) |
|---|---|
| Site not loading after 1 hour | Check DNS records match the IP from setup. Then wait — or check [whatsmydns.net](https://whatsmydns.net) for `rebestafresh.in` |
| No 🔒 padlock | Wait 10 min (SSL retries automatically), then: `systemctl reload caddy` |
| Store shows error page | `pm2 status` — if "stopped": `pm2 restart rebesta-store` |
| Want to see errors | `pm2 logs --lines 50` |
| Lost admin key | `cat /var/rebesta-data/ADMIN-KEY.txt` |
| Everything broken | hPanel → VPS → Actions → **Restart**. Still bad? Send me a screenshot of `pm2 logs` |

Re-running the setup command is **safe** — it repairs without losing orders or your admin key.

## 🔄 How updates work from now on (my favourite part)

```
I build + test → I push to GitHub → your VPS pulls it within 5 minutes → LIVE
```

Your orders, products, coupons and settings live in a **separate data folder** — code updates can never touch them. Plus the server auto-backs up everything daily (keeps 14 days).

**One habit for you:** every week, open Admin → **💾 Download backup** and keep the file. Two copies of everything = zero anxiety. 😌

## 📋 Still to do after launch (whenever ready — just ask me)

1. **Order alert emails** — 10-min Gmail App Password setup (fills `SMTP_*` in the server's .env)
2. **PayU online payments** — needs your PayU merchant keys
3. **Google Analytics** — paste your `G-` ID in admin settings

---

*Built with 🥬 in Hosur. Go sell some vegetables!*
