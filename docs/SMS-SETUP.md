# Turning on OTP sign-in (real SMS)

OTP login is **built and deployed, but hidden** until an SMS gateway is
configured. Customers currently see the normal password sign-in only.
The moment `data/sms-config.json` exists on the server with valid
credentials, the "Mobile OTP" tab appears on the sign-in page —
**no restart, no redeploy needed** (the config is read fresh on every request).

## Option 1 — Message Central VerifyNow (recommended: NO DLT, live in ~15 min)

No ₹6k DLT registration, no sender ID paperwork. They send OTPs over their own
pre-registered templates (SMS arrives from a generic sender, not "REBEST").
~₹0.10–0.25 per OTP, small wallet top-up.

1. Sign up at https://www.messagecentral.com (free) and verify the account.
2. Top up the wallet with a small amount (~₹200–500) if no trial credits.
3. From the dashboard grab your **Customer ID** (profile page).
4. Create the file `<app>/data/sms-config.json` (next to `customers.json`):

```json
{
  "provider": "messagecentral",
  "customerId": "C-XXXXXXXX",
  "email": "the email you signed up with",
  "password": "your account password"
}
```

The email + password are only used server-side to generate Message Central's
API token — the file is gitignored and never sent to browsers.

5. Open /login → "Mobile OTP" tab → send a code to your own phone to test.

## Option 2 — MSG91 (branded sender "REBEST", needs DLT, ~₹5,900, weeks)

Only worth it later, if you want the SMS to come from your own sender ID.
Signup → DLT entity + header + OTP template registration → then:

```json
{
  "provider": "msg91",
  "authKey": "YOUR_MSG91_AUTH_KEY",
  "sender": "REBEST",
  "route": "dlt_transactional",
  "templateId": "YOUR_MSG91_TEMPLATE_ID",
  "otpVariable": "OTP"
}
```

## Notes (both options)

- Unknown numbers are refused **before** an SMS is spent (probing numbers
  costs money). They're redirected to sign up instead.
- Codes: 6 digits, valid 10 minutes, max 5 wrong tries, 60 s between sends,
  max 10 sends per 15 min per IP.
- If sending fails, check `pm2 logs` for `otp.sendFailed` — it prints the
  gateway's exact error (bad credentials, low balance, etc.).
- Local development: `{ "provider": "dev" }` generates + logs the code on the
  server instead of sending an SMS (never use this in production).
- Switching providers = editing this one file. Nothing else changes.
