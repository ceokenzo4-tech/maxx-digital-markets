#!/bin/bash
cd "$(dirname "$0")" || exit 1

mkdir -p data/proofs
[ -f data/db.json ] || printf '{"users":[],"sessions":[],"orders":[]}\n' > data/db.json

# Preserve existing test account/orders when available.
CURRENT_USERS=$(node -e "try{const d=require('./data/db.json');console.log((d.users||[]).length)}catch(e){console.log(0)}" 2>/dev/null || echo 0)
if [ "$CURRENT_USERS" = "0" ]; then
  for OLD in \
    "$HOME/Downloads/MAXX-FINAL/MAXX-FINAL-ONE-COPY" \
    "$HOME/Downloads/MAXX-RUNTHROUGH/MAXX-FULL-UPDATE" \
    "$HOME/Downloads/MAXX-PRO-LIVE" \
    "$HOME/Downloads/MAXX-FIXED/MAXX-LIVE-MANUAL" \
    "$HOME/Downloads/MAXX-MANUAL/MAXX-LIVE-MANUAL"
  do
    if [ -f "$OLD/data/db.json" ]; then
      OLD_USERS=$(node -e "try{const d=require(process.argv[1]);console.log((d.users||[]).length)}catch(e){console.log(0)}" "$OLD/data/db.json" 2>/dev/null || echo 0)
      if [ "$OLD_USERS" != "0" ]; then
        cp "$OLD/data/db.json" data/db.json
        [ -d "$OLD/data/proofs" ] && cp -R "$OLD/data/proofs/." data/proofs/ 2>/dev/null || true
        break
      fi
    fi
  done
fi

echo "Installing/checking MAXX dependencies..."
npm install || exit 1

[ -f data/admin-key.txt ] || (openssl rand -hex 24 2>/dev/null || node -e "console.log(require('crypto').randomBytes(24).toString('hex'))") > data/admin-key.txt
ADMIN_KEY=$(cat data/admin-key.txt)

# Stop only an older MAXX process started by this package.
if [ -f data/maxx.pid ]; then
  OLD_PID=$(cat data/maxx.pid 2>/dev/null)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then kill "$OLD_PID" 2>/dev/null; sleep 1; fi
fi

# Start in the background so closing/typing in Terminal does not stop MAXX.
nohup env \
  PORT=3010 \
  FEE_RATE=0.001 \
  MANUAL_SETTLEMENT_ENABLED=true \
  SUPPORT_PHONE='+2349071890800' \
  SUPPORT_WHATSAPP='+2349071890800' \
  SUPPORT_EMAIL='support@maxxdigitalmarkets.com' \
  BANK_NAME='OPay' \
  BANK_ACCOUNT_NAME='OHWOJEHERI SAMSON' \
  BANK_ACCOUNT_NUMBER='9071890800' \
  BTC_RECEIVE_ADDRESS='bc1quue737zzndzc35pasfprvnsplndfjxnvd2xa22' \
  USDT_RECEIVE_ADDRESS='TC3T7hKRiKnvCRpB4fgG7K5RS5LtcroUCy' \
  USDT_NETWORK='TRC20' \
  ETH_RECEIVE_ADDRESS='0xF3A5b33BADdfeC004C94319bC843a85e836465F8' \
  SOL_RECEIVE_ADDRESS='Gz416eVJw3Y3rQUSCmekBxC4qjP9T4SLwua88szA6G3J' \
  TRX_RECEIVE_ADDRESS='TC3T7hKRiKnvCRpB4fgG7K5RS5LtcroUCy' \
  ADMIN_KEY="$ADMIN_KEY" \
  node server.js > data/maxx-server.log 2>&1 &
PID=$!
echo "$PID" > data/maxx.pid

OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3010/api/health >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done

if [ "$OK" = "1" ]; then
  echo ""
  echo "============================================================"
  echo " MAXX IS RUNNING"
  echo " Website: http://127.0.0.1:3010"
  echo " Admin:   http://127.0.0.1:3010/admin.html"
  echo " Fee:     0.1%"
  echo "============================================================"
  open "http://127.0.0.1:3010" >/dev/null 2>&1 || true
else
  echo "MAXX could not start. Last server messages:"
  tail -30 data/maxx-server.log
  exit 1
fi
