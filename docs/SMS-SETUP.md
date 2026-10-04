# Turning on OTP sign-in (real SMS via MSG91)

OTP login is **built and deployed, but hidden** until an SMS gateway is
configured. Customers currently see the normal password sign-in only.
The moment the file below exists on the server, the "Mobile OTP" tab
appears on the sign-in page — **no restart, no redeploy needed**
(the config is read fresh on every request).

## 1. MSG91 account

1. Sign up at https://msg91.com and add wallet balance
   (₹0.15–0.25 per OTP SMS + 18% GST; ₹200–500 lasts a long time).
2. Dashboard → Settings → API → copy your **Auth Key**.

## 2. DLT registration (mandatory in India, ~₹6k total, takes days)

Transaction OTP SMS cannot legally be sent without it. MSG91's dashboard
walks you through it (DLT → Registration):

1. Register as a **Principal Entity** on a DLT portal (Jio / Airtel / Vodafone).
   Needs your business KYC (GST / PAN, address proof).
2. Add **Rebesta Fresh's 6-letter Sender ID** (e.g. `REBEST`) — approve.
3. Create a **Content Template** for the OTP message, e.g.
   `{#var#} is your Rebesta Fresh verification code. Do not share it with anyone.`
   Get it approved.
4. Copy the approved template into the MSG91 dashboard (it links the DLT
   template id and gives you an MSG91 **Template ID**).

## 3. Switch it on

On the server, create the file
`<app>/data/sms-config.json` — i.e. next to `customers.json`:

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

That's it. The "Mobile OTP" tab appears on /login immediately.

## 4. Test it

1. Sign out, open /login, tap "Mobile OTP", enter your own number → Send code.
2. You should receive the SMS in a few seconds; the code logs in.
3. If it fails, check `pm2 logs` for `otp.sendFailed` — it prints MSG91's
   exact error (bad template id, low balance, unapproved sender, etc.).

## Notes

- Unknown numbers are refused **before** an SMS is spent (probing numbers
  costs money). They're redirected to sign up instead.
- Codes: 6 digits, valid 10 minutes, max 5 wrong tries, 60 s between sends,
  max 10 sends per 15 min per IP.
- Local development: `{ "provider": "dev" }` logs the code to the server
  console instead of sending an SMS (never use this in production).
