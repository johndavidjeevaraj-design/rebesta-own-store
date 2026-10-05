# Turning on OTP sign-in (real SMS via MSG91)

OTP login is **built and deployed, but hidden** until an SMS gateway is
configured. Customers currently see the normal password sign-in only.
The moment credentials are set (admin API or `data/sms-config.json`),
the "Mobile OTP" tab appears on the sign-in page — **no restart, no
redeploy needed** (config is read fresh on every request).

## Go-live steps (MSG91 — chosen 2026-10-05)

1. **Sign up** at https://msg91.com/signup (free) and verify the account.
2. Dashboard → **Settings → API** → copy your **Auth Key**.
3. *(Optional)* If you create a custom OTP template in the dashboard's OTP
   section, copy its template id — otherwise MSG91's default template is used.
4. Give the Auth Key to the store admin, who saves it with one call:

```bash
curl -X POST https://rebestafresh.in/api/admin/sms \
  -H 'x-admin-key: <admin key>' -H 'Content-Type: application/json' \
  -d '{"provider":"msg91","authKey":"YOUR_AUTHKEY","templateId":"optional"}'
```

   (Or create `<app>/data/sms-config.json` on the server directly.)
5. Test from your own phone first:

```bash
curl -X POST https://rebestafresh.in/api/admin/sms/test \
  -H 'x-admin-key: <admin key>' -H 'Content-Type: application/json' \
  -d '{"phone":"YOUR_10_DIGIT_NUMBER"}'
```

## Cost & DLT reality

- **Default setup (what we use): MSG91's own OTP template + sender — no DLT
  registration needed.** SMS arrives from a generic MSG91 sender.
- Branded "REBEST" sender = your own DLT registration (~₹5,900, weeks).
  Not worth it now; can be added later by updating this config only.
- Pricing: OTP packs start at 5,000 OTPs for ₹1,250 + 18% GST (₹0.25/OTP).
  At ~10–30 logins/month that pack lasts years. Wallet top-ups possible too.

## Config reference (`data/sms-config.json`, gitignored)

```json
{ "provider": "msg91", "authKey": "…", "templateId": "optional" }
```

Other providers kept in the code: `messagecentral` (managed OTP; abandoned
2026-10-05 — enterprise USD pricing, ₹31-lakh-class plans), `dev` (logs the
code to the server console; local testing only). Disable with
`{"provider":"none"}` via the admin API.

## Security notes

- Unknown numbers are refused **before** an SMS is spent (probing numbers
  costs money). They're redirected to sign up instead.
- Codes: 6 digits, generated + verified on our server, valid 10 minutes,
  max 5 wrong tries, 60 s between sends, max 10 sends per 15 min per IP.
- If sending fails, `pm2 logs` shows `otp.sendFailed` with MSG91's exact
  error (invalid key, zero balance, template issue…).
