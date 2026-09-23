# MAXX Digital Markets

Professional crypto marketplace application with server-side account creation, login sessions, market quotes, persistent order records, provider execution adapter and webhook endpoint.

## Start locally

```bash
npm install
npm start
```
Open http://localhost:3010

## Live transactions

The app intentionally ships with `LIVE_TRADING_ENABLED=false`. This prevents the website from falsely representing simulated money movement as a completed financial transaction.

To execute real buy/sell orders, connect an approved crypto/payment provider through the adapter expected by `POST /api/orders`, configure KYC/AML and jurisdiction controls, add provider webhook signature verification, use a production database, enable HTTPS, rate limiting, email verification, 2FA, monitoring and secrets management, then set `LIVE_TRADING_ENABLED=true`.

See `.env.example` for the required provider variables.


## 2026-09-22 dashboard upgrade
- Added clearly labelled demo/paper portfolio balances. Admins can add/subtract demo balances with an audit trail.
- Added registered-user review submission and admin moderation. No fabricated testimonials are preloaded.
- Set a strong `ADMIN_KEY` environment variable before using `admin.html`.
- Demo balances are not withdrawable funds. Real-money custody/trading requires appropriate regulated providers, KYC/AML, payments, security and reconciliation.
