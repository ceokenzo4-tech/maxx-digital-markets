MAXX DIGITAL MARKETS - LIVE RATE BUILD

Pricing:
- BTC/ETH/SOL/TRX: live Bybit Spot price in USDT.
- USDT: 1 USDT reference.
- NGN: live Bybit P2P USDT/NGN order-book reference.
- MAXX fee: 0.0.1%.
- NO hard-coded USD/NGN fallback.
- If the Bybit NGN feed is unavailable, NGN quotes stop instead of using a fake/stale fixed rate.

Important:
The keyless Bybit P2P web endpoint is used for local testing. For a production business, migrate to Bybit's documented P2P Open API once your eligible advertiser/business account has API permission. Keep API credentials in environment variables, never in browser JavaScript.

Manual settlement remains enabled. Always verify cleared bank funds or blockchain confirmation yourself before approving an order.
