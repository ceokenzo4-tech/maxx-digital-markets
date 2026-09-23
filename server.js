const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3010;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const LIVE_TRADING_ENABLED = String(process.env.LIVE_TRADING_ENABLED || 'false').toLowerCase() === 'true';
const MANUAL_SETTLEMENT_ENABLED = String(process.env.MANUAL_SETTLEMENT_ENABLED || 'true').toLowerCase() === 'true';
const PROVIDER_API_URL = process.env.PROVIDER_API_URL || '';
const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY || '';

const BTC_RECEIVE_ADDRESS = process.env.BTC_RECEIVE_ADDRESS || 'bc1quue737zzndzc35pasfprvnsplndfjxnvd2xa22';
const USDT_RECEIVE_ADDRESS = process.env.USDT_RECEIVE_ADDRESS || 'TC3T7hKRiKnvCRpB4fgG7K5RS5LtcroUCy';
const USDT_NETWORK = process.env.USDT_NETWORK || 'TRC20';
const ETH_RECEIVE_ADDRESS = process.env.ETH_RECEIVE_ADDRESS || '0xF3A5b33BADdfeC004C94319bC843a85e836465F8';
const SOL_RECEIVE_ADDRESS = process.env.SOL_RECEIVE_ADDRESS || 'Gz416eVJw3Y3rQUSCmekBxC4qjP9T4SLwua88szA6G3J';
const TRX_RECEIVE_ADDRESS = process.env.TRX_RECEIVE_ADDRESS || 'TC3T7hKRiKnvCRpB4fgG7K5RS5LtcroUCy';

const FEE_RATE = Number(process.env.FEE_RATE || 0.001); // 0.1%
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@maxxdigitalmarkets.com';
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '+2349071890800';
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || '+2349071890800';
const BANK_NAME = process.env.BANK_NAME || 'OPay';
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || 'OHWOJEHERI SAMSON';
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || '9071890800';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const BYBIT_SPOT_API = process.env.BYBIT_SPOT_API || 'https://api.bybit.com';
const BYBIT_P2P_API = process.env.BYBIT_P2P_API || 'https://api2.bybit.com/fiat/otc/item/online';
const QUOTE_TTL_MS = Math.max(10000, Number(process.env.QUOTE_TTL_MS || 30000));
const RATE_CACHE_MS = Math.max(3000, Number(process.env.RATE_CACHE_MS || 10000));

const PROOF_DIR = path.join(DATA_DIR, 'proofs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], sessions: [], orders: [], balanceAdjustments: [], reviews: [] }, null, 2));

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

function dbRead() { const db=JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db.users ||= []; db.sessions ||= []; db.orders ||= []; db.balanceAdjustments ||= []; db.reviews ||= []; return db; }
function dbWrite(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expected) {
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);
}
function token() { return crypto.randomBytes(32).toString('hex'); }
function id(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`; }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, verified: !!u.verified, demoBalance: Number(u.demoBalance||0), balanceCurrency: u.balanceCurrency||'USD', createdAt: u.createdAt }; }
function auth(req, res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return res.status(401).json({ error: 'Authentication required' });
  const db = dbRead();
  const s = db.sessions.find(x => x.token === bearer && x.expiresAt > Date.now());
  if (!s) return res.status(401).json({ error: 'Session expired or invalid' });
  const user = db.users.find(x => x.id === s.userId);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  req.user = user;
  next();
}
function admin(req, res, next) {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Admin authorization required' });
  next();
}

const ASSETS = ['BTC', 'ETH', 'USDT', 'SOL', 'TRX'];
const cache = new Map();
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: now, value });
  return value;
}

async function fetchJson(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Live rate source returned HTTP ${r.status}`);
  return r.json();
}

async function getBybitUsdPrice(asset) {
  const a = String(asset || '').toUpperCase();
  if (!ASSETS.includes(a)) throw new Error('Unsupported asset');
  return cached(`spot:${a}`, RATE_CACHE_MS, async () => {
    const symbol = a === 'USDT' ? 'USDTUSDC' : `${a}USDT`;
    const j = await fetchJson(`${BYBIT_SPOT_API.replace(/\/$/, '')}/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`);
    const row = j?.result?.list?.[0];
    const p = Number(row?.lastPrice);
    if (j?.retCode !== 0 || !Number.isFinite(p) || p <= 0) throw new Error(`Bybit live ${a} price is unavailable`);
    return {
      price: p,
      source: 'Bybit Spot',
      at: new Date().toISOString(),
      symbol,
      change24h: Number(row?.price24hPcnt || 0) * 100,
      volume24h: Number(row?.turnover24h || row?.volume24h || 0),
      high24h: Number(row?.highPrice24h || 0),
      low24h: Number(row?.lowPrice24h || 0)
    };
  });
}

function extractP2PPrices(j) {
  const candidates = [j?.result?.items, j?.result?.list, j?.result, j?.data?.items, j?.data?.list, j?.data];
  const items = candidates.find(Array.isArray) || [];
  return items
    .map(x => Number(x?.price ?? x?.quotePrice ?? x?.unitPrice))
    .filter(x => Number.isFinite(x) && x > 0);
}
function robustReference(prices) {
  const xs = prices.slice().sort((a, b) => a - b);
  if (xs.length < 3) throw new Error('Not enough live Bybit NGN offers');
  const trim = xs.length >= 8 ? Math.max(1, Math.floor(xs.length * 0.15)) : 0;
  const clean = trim ? xs.slice(trim, xs.length - trim) : xs;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}
async function fetchBybitP2PSide(side) {
  const body = {
    userId: '', tokenId: 'USDT', currencyId: 'NGN', payment: [], side: String(side),
    size: '10', page: '1', amount: '', authMaker: false, canTrade: false, itemRegion: 2
  };
  const j = await fetchJson(BYBIT_P2P_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json', 'user-agent': 'MAXX-Digital-Markets/1.0' },
    body: JSON.stringify(body)
  });
  const prices = extractP2PPrices(j);
  return { rate: robustReference(prices), sampleSize: prices.length };
}
async function getBybitNgnRates() {
  return cached('ngn:p2p', RATE_CACHE_MS, async () => {
    // Bybit's fiat convention: side 0 = buy crypto with fiat, side 1 = sell crypto for fiat.
    const [buy, sell] = await Promise.all([fetchBybitP2PSide(0), fetchBybitP2PSide(1)]);
    return {
      buy: buy.rate,
      sell: sell.rate,
      source: 'Bybit P2P USDT/NGN',
      at: new Date().toISOString(),
      sampleSize: { buy: buy.sampleSize, sell: sell.sampleSize }
    };
  });
}

async function createQuote({ side, asset, fiat, amount }) {
  side = String(side || 'buy').toLowerCase();
  asset = String(asset || 'BTC').toUpperCase();
  fiat = String(fiat || 'NGN').toUpperCase();
  amount = Number(amount);
  if (!['buy', 'sell'].includes(side)) throw new Error('Invalid side');
  if (!ASSETS.includes(asset)) throw new Error('Unsupported asset');
  if (!['USD', 'NGN'].includes(fiat)) throw new Error('Unsupported fiat currency');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount');

  const spot = await getBybitUsdPrice(asset);
  let ngnRate = 1;
  let ngnSource = null;
  let ngnAt = null;
  if (fiat === 'NGN') {
    const rates = await getBybitNgnRates();
    ngnRate = side === 'buy' ? rates.buy : rates.sell;
    ngnSource = rates.source;
    ngnAt = rates.at;
    if (!Number.isFinite(ngnRate) || ngnRate <= 0) throw new Error('Bybit NGN rate is unavailable');
  }

  const marketPrice = spot.price * ngnRate;
  const fee = amount * FEE_RATE;
  const netFiat = amount - fee;
  // Buy: fee is taken from the customer's fiat amount, so they receive slightly less crypto.
  // Sell: the customer sends crypto equal to the gross trade value, then receives netFiat after the fee.
  const cryptoAmount = side === 'buy' ? (netFiat / marketPrice) : (amount / marketPrice);
  const createdAt = Date.now();
  return {
    side, asset, fiat, amount, marketPrice, fee, feeRate: FEE_RATE, netFiat, cryptoAmount,
    spotPriceUsd: spot.price, ngnRate: fiat === 'NGN' ? ngnRate : null,
    priceSource: spot.source, ngnSource, source: fiat === 'NGN' ? `${spot.source} + ${ngnSource}` : spot.source,
    rateUpdatedAt: ngnAt || spot.at, createdAt, expiresAt: createdAt + QUOTE_TTL_MS
  };
}

app.get('/api/health', (req, res) => res.json({
  ok: true, liveTrading: LIVE_TRADING_ENABLED, manualSettlement: MANUAL_SETTLEMENT_ENABLED,
  providerConfigured: !!(PROVIDER_API_URL && PROVIDER_API_KEY), feeRate: FEE_RATE,
  pricing: { crypto: 'Bybit Spot', ngn: 'Bybit P2P USDT/NGN', fixedNgnRate: false, quoteTtlMs: QUOTE_TTL_MS },
  support: { email: SUPPORT_EMAIL, phone: SUPPORT_PHONE, whatsapp: SUPPORT_WHATSAPP }
}));

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 160);
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  const db = dbRead();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const hp = hashPassword(password);
  const user = { id: id('usr'), name, email, passwordHash: hp.hash, passwordSalt: hp.salt, verified: false, demoBalance: 0, balanceCurrency: 'USD', createdAt: new Date().toISOString() };
  db.users.push(user);
  const session = { token: token(), userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 };
  db.sessions.push(session); dbWrite(db);
  res.status(201).json({ token: session.token, user: safeUser(user) });
});
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const db = dbRead();
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) return res.status(401).json({ error: 'Incorrect email or password' });
  const session = { token: token(), userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 };
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now()); db.sessions.push(session); dbWrite(db);
  res.json({ token: session.token, user: safeUser(user) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.get('/api/rates', async (req, res) => {
  try { res.json({ ngn: await getBybitNgnRates(), feeRate: FEE_RATE }); }
  catch (e) { res.status(503).json({ error: e.message || 'Live Bybit NGN rate unavailable' }); }
});

app.get('/api/markets', async (req, res) => {
  const rows = await Promise.all(ASSETS.map(async asset => {
    try { return { asset, ...(await getBybitUsdPrice(asset)), available: true }; }
    catch (e) { return { asset, available: false, error: e.message }; }
  }));
  res.json({ markets: rows, at: new Date().toISOString(), source: 'Bybit Spot' });
});

app.post('/api/quote', async (req, res) => {
  try { res.json(await createQuote(req.body)); }
  catch (e) { res.status(503).json({ error: e.message || 'Live quote unavailable. Please try again.' }); }
});

app.post('/api/orders', auth, async (req, res) => {
  try {
    const quote = await createQuote(req.body);
    const payout = req.body.payout || null;
    const order = {
      id: id('ord'), userId: req.user.id, side: quote.side, asset: quote.asset, fiat: quote.fiat,
      amount: quote.amount, marketPrice: quote.marketPrice, fee: quote.fee, feeRate: quote.feeRate,
      netFiat: quote.netFiat, cryptoAmount: quote.cryptoAmount, spotPriceUsd: quote.spotPriceUsd,
      ngnRate: quote.ngnRate, priceSource: quote.source, rateUpdatedAt: quote.rateUpdatedAt,
      quoteExpiresAt: quote.expiresAt, status: LIVE_TRADING_ENABLED ? 'pending_provider' :
        (MANUAL_SETTLEMENT_ENABLED ? (quote.side === 'sell' ? 'awaiting_crypto' : 'awaiting_payment') : 'pending_setup'),
      payout, createdAt: new Date().toISOString()
    };

    if (LIVE_TRADING_ENABLED) {
      if (!PROVIDER_API_URL || !PROVIDER_API_KEY) return res.status(503).json({ error: 'Live trading provider is not configured' });
      const providerRes = await fetch(PROVIDER_API_URL.replace(/\/$/, '') + '/orders', {
        method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${PROVIDER_API_KEY}` },
        body: JSON.stringify({ externalId: order.id, side: order.side, asset: order.asset, fiat: order.fiat, amount: order.amount, customer: { id: req.user.id, email: req.user.email }, payout }),
        signal: AbortSignal.timeout(8000)
      });
      const provider = await providerRes.json().catch(() => ({}));
      if (!providerRes.ok) return res.status(502).json({ error: provider.error || 'Transaction provider rejected the order' });
      order.status = provider.status || 'pending'; order.providerOrderId = provider.id || null; order.checkoutUrl = provider.checkoutUrl || null;
    }

    if (!LIVE_TRADING_ENABLED && MANUAL_SETTLEMENT_ENABLED) {
      if (order.side === 'sell') {
        const walletMap = { BTC: [BTC_RECEIVE_ADDRESS, 'Bitcoin'], USDT: [USDT_RECEIVE_ADDRESS, USDT_NETWORK], ETH: [ETH_RECEIVE_ADDRESS, 'Ethereum'], SOL: [SOL_RECEIVE_ADDRESS, 'Solana'], TRX: [TRX_RECEIVE_ADDRESS, 'TRON'] };
        const [address, network] = walletMap[order.asset] || ['', ''];
        order.deposit = address ? { address, network } : null;
        order.instructions = address ? 'Send only the selected asset on the displayed network. Submit the transaction hash after sending.' : 'Receiving wallet is not configured. Contact support before sending crypto.';
      } else {
        order.payment = BANK_ACCOUNT_NUMBER ? { bankName: BANK_NAME, accountName: BANK_ACCOUNT_NAME, accountNumber: BANK_ACCOUNT_NUMBER } : null;
        order.instructions = BANK_ACCOUNT_NUMBER ? 'Transfer only to the displayed payment account and submit the payment reference. Crypto is released after cleared funds are verified.' : 'Payment instructions are not configured. Contact support before paying.';
      }
    }

    const db = dbRead(); db.orders.push(order); dbWrite(db);
    res.status(201).json({ order, liveTrading: LIVE_TRADING_ENABLED });
  } catch (e) {
    res.status(503).json({ error: e.message || 'Could not create order from the live market rate' });
  }
});

app.get('/api/orders', auth, (req, res) => {
  const db = dbRead();
  const orders = db.orders.filter(o => o.userId === req.user.id).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ orders });
});
app.post('/api/orders/:id/proof', auth, (req, res) => {
  const proof = String(req.body.proof || '').trim().slice(0, 200);
  const imageData = String(req.body.imageData || '');
  const imageName = String(req.body.imageName || 'payment-proof').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  if (proof.length < 4 && !imageData) return res.status(400).json({ error: 'Enter a payment reference / transaction hash or upload a screenshot' });
  const db = dbRead();
  const order = db.orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (imageData) {
    const match = imageData.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'Screenshot must be PNG, JPG or WEBP' });
    const buf = Buffer.from(match[2], 'base64');
    if (!buf.length || buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Screenshot must be 5 MB or smaller' });
    const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
    if (order.proofImageFile) { try { fs.unlinkSync(path.join(PROOF_DIR, order.proofImageFile)); } catch {} }
    const file = `${order.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(PROOF_DIR, file), buf, { mode: 0o600 });
    order.proofImageFile = file;
    order.proofImageName = imageName;
    order.proofImageMime = match[1];
  }
  if (proof) order.customerProof = proof;
  order.status = 'verification_pending'; order.updatedAt = new Date().toISOString(); dbWrite(db);
  res.json({ order: { ...order, proofImageFile: undefined } });
});

app.get('/api/orders/:id/proof-image', auth, (req, res) => {
  const db = dbRead();
  const order = db.orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order || !order.proofImageFile) return res.status(404).json({ error: 'Proof screenshot not found' });
  const file = path.join(PROOF_DIR, path.basename(order.proofImageFile));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Proof screenshot not found' });
  res.type(order.proofImageMime || 'image/jpeg').sendFile(file);
});

app.get('/api/admin/orders/:id/proof-image', admin, (req, res) => {
  const db = dbRead();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order || !order.proofImageFile) return res.status(404).json({ error: 'Proof screenshot not found' });
  const file = path.join(PROOF_DIR, path.basename(order.proofImageFile));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Proof screenshot not found' });
  res.type(order.proofImageMime || 'image/jpeg').sendFile(file);
});

app.get('/api/reviews', (req,res)=>{ const db=dbRead(); const reviews=db.reviews.filter(r=>r.status==='approved').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20); res.json({reviews}); });
app.post('/api/reviews', auth, (req,res)=>{ const rating=Math.round(Number(req.body.rating)); const text=String(req.body.text||'').trim().slice(0,600); if(rating<1||rating>5)return res.status(400).json({error:'Rating must be 1 to 5'}); if(text.length<10)return res.status(400).json({error:'Review must be at least 10 characters'}); const db=dbRead(); const review={id:id('rev'),userId:req.user.id,name:req.user.name.split(' ')[0],rating,text,status:'pending',createdAt:new Date().toISOString()}; db.reviews.push(review); dbWrite(db); res.status(201).json({review,message:'Review submitted for moderation'}); });
app.get('/api/admin/reviews', admin, (req,res)=>{const db=dbRead();res.json({reviews:db.reviews.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});});
app.patch('/api/admin/reviews/:id', admin, (req,res)=>{const status=String(req.body.status||'');if(!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'Invalid review status'});const db=dbRead();const r=db.reviews.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Review not found'});r.status=status;r.updatedAt=new Date().toISOString();dbWrite(db);res.json({review:r});});

app.get('/api/admin/users', admin, (req, res) => { const db=dbRead(); res.json({users:db.users.map(safeUser)}); });
app.post('/api/admin/users/:id/balance', admin, (req,res)=>{ const amount=Number(req.body.amount); const note=String(req.body.note||'Admin demo balance adjustment').trim().slice(0,200); if(!Number.isFinite(amount)||amount===0)return res.status(400).json({error:'Enter a non-zero adjustment'}); if(Math.abs(amount)>100000000)return res.status(400).json({error:'Adjustment is too large'}); const db=dbRead(); const u=db.users.find(x=>x.id===req.params.id); if(!u)return res.status(404).json({error:'User not found'}); const before=Number(u.demoBalance||0); const after=before+amount; if(after<0)return res.status(400).json({error:'Demo balance cannot go below zero'}); u.demoBalance=after; u.balanceCurrency='USD'; const entry={id:id('bal'),userId:u.id,amount,before,after,note,createdAt:new Date().toISOString()}; db.balanceAdjustments.push(entry); dbWrite(db); res.json({user:safeUser(u),adjustment:entry}); });
app.get('/api/admin/balance-adjustments', admin, (req,res)=>{const db=dbRead();res.json({adjustments:db.balanceAdjustments.slice().reverse().slice(0,200)});});
app.patch('/api/admin/users/:id/verify', admin, (req,res)=>{ const db=dbRead(); const u=db.users.find(x=>x.id===req.params.id); if(!u)return res.status(404).json({error:'User not found'}); u.verified=true; u.verifiedAt=new Date().toISOString(); dbWrite(db); res.json({user:safeUser(u)}); });
app.get('/api/admin/orders', admin, (req, res) => { const db = dbRead(); res.json({ orders: db.orders.slice().sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) }); });
app.patch('/api/admin/orders/:id', admin, (req, res) => {
  const allowed = ['awaiting_payment','awaiting_crypto','verification_pending','funds_verified','crypto_verified','payout_sent','crypto_sent','completed','cancelled','failed'];
  const status = String(req.body.status || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const db = dbRead(); const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = status;
  if (req.body.settlementTxid) order.settlementTxid = String(req.body.settlementTxid).slice(0,200);
  if (req.body.payoutReference) order.payoutReference = String(req.body.payoutReference).slice(0,200);
  order.updatedAt = new Date().toISOString(); dbWrite(db); res.json({ order });
});

app.post('/api/provider/webhook', express.json(), (req, res) => {
  const providerOrderId = req.body.providerOrderId || req.body.id;
  const status = String(req.body.status || '');
  if (!providerOrderId || !status) return res.status(400).json({ error: 'Invalid webhook payload' });
  const db = dbRead(); const order = db.orders.find(o => o.providerOrderId === providerOrderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = status; order.updatedAt = new Date().toISOString(); dbWrite(db); res.json({ received: true });
});

app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.listen(PORT, () => console.log(`MAXX Digital Markets running on http://localhost:${PORT}`));
