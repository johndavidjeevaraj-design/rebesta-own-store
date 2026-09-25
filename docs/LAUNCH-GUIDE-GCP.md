# 🟢 Rebesta Fresh — Google Cloud Launch Guide

**Goal:** rebestafresh.in live with 🔒 SSL, at **₹0/month**, on Google's Mumbai server.
**Time: ~45 minutes.** You need: your Google account (Gmail) · UPI app · GoDaddy domain login.

> **The plan in one picture:**
> - Google gives new accounts **₹25,000 ($300) free credit** valid 90 days
> - The server burns ~₹1,000–1,400/month → **the credit pays ALL of it → ₹0 from your pocket**
> - **Day 80: we migrate to Hostinger (₹707/mo) for India speed forever** — playbook already written, I handle it with you. Zero downtime, every order kept.
> - One-time **₹1,000 prepay** activates your account (refundable when you close it at migration)

---

## STEP 1 — Create your Google Cloud account (10 min)

1. Go to **cloud.google.com** → click **Get started for free** (or "Try free")
2. Sign in with your **Gmail account** (make a fresh one for the shop if you prefer — e.g. rebestafresh@gmail.com — it becomes the owner login forever)
3. Fill in: Country **India** → your name, business details as asked
4. **Payment setup — UPI works here:**
   - When asked for a payment method, choose **Pay with UPI**
   - Scan the QR with GPay/PhonePe/Paytm and approve the mandate
   - You may be asked for a **₹1,000 prepayment** — this activates your account, gets credited back for usage, and is **refundable** if you ever close the account. Some accounts instead verify with a ₹2 charge — both are normal.
5. Done — you'll see **₹25,000 in credits** on the dashboard. 💰

> ⚠️ If UPI option doesn't appear for you, STOP and screenshot the payment screen for me — do NOT enter card details.

## STEP 2 — Create your server (VM) (10 min)

1. Go to **console.cloud.google.com** (bookmark this — it's your control room)
2. Accept the terms; if asked to pick a project, keep the default one
3. In the top search bar type **Compute Engine** → open it → click **Create instance** (first load takes ~1 min)
4. Fill it in EXACTLY like this:

| Setting | What to choose |
|---|---|
| Name | `rebesta-store` |
| Region | **Mumbai (asia-south1)** — any zone (a/b/c) |
| Machine type | **E2** → **e2-micro** (2 shared vCPU, 1 GB — enough for our store) |
| Boot disk → Change | **Ubuntu 24.04 LTS** · type **Balanced persistent disk** · size **30 GB** |
| Firewall (bottom) | ☑ **Allow HTTP traffic** ☑ **Allow HTTPS traffic** — BOTH checked! |

5. **Before clicking Create** — lock your permanent IP address:
   - Click **Advanced options** (or "Networking" tab) → **Networking** → click the **default** network interface
   - Find **External IP** → change from "Ephemeral" to **Create IP address** → name it `rebesta-ip` → **Reserve** → Done
6. Click **Create** → your server boots in ~30 seconds 🚀
7. On the VM instances page, find the **External IP** (like `34.93.x.x`) → **copy it**

## STEP 3 — The ONE paste 🪄 (10 min)

1. On your VM's row, click **SSH** → a black terminal opens in your browser (first time ~30 sec)
2. Type this first and press Enter (makes you root):

```
sudo -i
```

3. Now **copy this entire line**, paste in the terminal (Ctrl+Shift+V or right-click), press Enter:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/johndavidjeevaraj-design/rebesta-own-store/main/deploy/setup-rebesta.sh) rebestafresh.in
```

4. Watch 9 steps of ✅ (~5–8 minutes)
5. At the end: **copy the ADMIN KEY** from the box it prints — save it in your phone 🔐

## STEP 4 — Point your domain (GoDaddy, 5 min)

1. **godaddy.com** → sign in → your name → **My Products**
2. `rebestafresh.in` → click **DNS**
3. ✏️ Edit the **A** record named `@` → **Points to** = your VM's External IP → **Save**
4. Check the `www` row: **CNAME → @** = leave as-is ✅ (if it's an A record, set it to the same IP)
5. Don't touch MX/TXT/email records

*(Full GoDaddy details with gotchas are in the main LAUNCH-GUIDE.md — same steps.)*

## STEP 5 — Open your store 🎉 (10–30 min DNS spread)

- **https://rebestafresh.in** — live, with 🔒 padlock (Caddy fetches SSL automatically once DNS lands)
- Admin: **https://rebestafresh.in/admin** → login with your ADMIN KEY
- **First test:** place one COD order yourself → see it in admin → cancel it from Track page ✅

## STEP 6 — Safety net: budget alert (3 min, do not skip)

So you NEVER get a surprise bill:

1. Console → ☰ menu → **Billing** → your billing account
2. **Budgets & alerts** → **Create budget**
3. Set budget amount: **₹2,500** → alerts at 50%, 90%, 100% → Finish

Expected usage: **₹1,000–1,400/month** in Mumbai (VM + disk + traffic + GST) — all paid from your ₹25,000 credit, ₹0 from your pocket. The budget alert only fires if something goes genuinely wrong (e.g. a runaway service) — which is exactly when you want an email. 📧

## STEP 7 — THE PLAN: switch to Hostinger at Day 80 📅

**Decision locked:** 3 months free on Google Cloud → then migrate to Hostinger for ₹707/mo India speed forever.

Add a calendar reminder now for **Day 80**:

> "Migrate Rebesta to Hostinger — open docs/MIGRATION-GCP-TO-HOSTINGER.md and ping Arena"

The migration playbook is already written and waiting in your repo: **15 minutes, zero downtime, every order kept**. I'll walk you through it when the reminder fires.

---

## 🔧 Troubleshooting (paste in the browser SSH terminal)

| Problem | Fix |
|---|---|
| Site not loading after 1 hr | Check DNS matches your External IP on [whatsmydns.net](https://whatsmydns.net) |
| No 🔒 padlock | `systemctl reload caddy` |
| Store shows error | `pm2 status` then `pm2 restart rebesta-store` |
| See errors | `pm2 logs --lines 50` |
| Lost admin key | `cat /var/rebesta-data/ADMIN-KEY.txt` |
| SSH terminal closed | Just click **SSH** again on the VM row — it reconnects |

**How updates work:** I push code to GitHub → your server auto-updates within 5 minutes. Forever. Your data (orders/products/coupons) lives in a separate folder + daily auto-backups — updates can never touch it.

**Weekly habit:** Admin → 💾 Download backup → keep the file. Two copies of everything = zero anxiety. 😌

---

*Built with 🥬 in Hosur. Running on the same servers as Google Search. Go sell vegetables!*
