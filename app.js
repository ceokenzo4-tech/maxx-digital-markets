const API = '';
const fmt = (n, c='USD') => new Intl.NumberFormat(c==='NGN'?'en-NG':'en-US',{style:'currency',currency:c,maximumFractionDigits:c==='NGN'?2:2}).format(Number(n||0));
const num = (n, d=8) => Number(n||0).toLocaleString('en-US',{maximumFractionDigits:d});
function authToken(){return localStorage.getItem('maxx_token')||''}
function authHeaders(){return {'content-type':'application/json','authorization':`Bearer ${authToken()}`}}
async function api(path, options={}){const r=await fetch(API+path,{cache:'no-store',...options});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}
function logout(){localStorage.removeItem('maxx_token');localStorage.removeItem('maxx_user');location.href='index.html'}

async function loadMarkets(){
  const host=document.querySelector('#marketGrid');if(!host)return;
  try{
    const {markets}=await api('/api/markets');
    host.innerHTML=markets.map(m=>`<div class="card market"><div class="coin"><b>${m.asset}</b><span>${m.asset==='BTC'?'Bitcoin':m.asset==='ETH'?'Ethereum':m.asset==='USDT'?'Tether':m.asset==='SOL'?'Solana':'TRON'}</span></div><div class="price">${m.available?fmt(m.price):'Unavailable'}</div><div class="source">${m.available?'Live • Bybit Spot':'Live feed unavailable'}</div></div>`).join('');
  }catch(e){host.innerHTML=`<p class="muted">Live Bybit market data is unavailable right now.</p>`}
}

function initTrade(){
  const form=document.querySelector('#tradeForm');if(!form)return;
  let side=new URLSearchParams(location.search).get('side')==='sell'?'sell':'buy';
  const amount=document.querySelector('#amount'), asset=document.querySelector('#asset'), fiat=document.querySelector('#fiat');
  const requestedAsset=new URLSearchParams(location.search).get('asset')?.toUpperCase(); if(requestedAsset && [...asset.options].some(o=>o.value===requestedAsset)) asset.value=requestedAsset;
  const params=new URLSearchParams(location.search), requestedFiat=params.get('fiat')?.toUpperCase(), requestedAmount=Number(params.get('amount')); if(requestedFiat && [...fiat.options].some(o=>o.value===requestedFiat)) fiat.value=requestedFiat; if(Number.isFinite(requestedAmount)&&requestedAmount>0) amount.value=requestedAmount;
  const qPrice=document.querySelector('#qPrice'), qFee=document.querySelector('#qFee'), qReceive=document.querySelector('#qReceive');
  const qNgn=document.querySelector('#qNgn'), qSource=document.querySelector('#qSource'), qUpdated=document.querySelector('#qUpdated'), quoteState=document.querySelector('#quoteState');
  const submit=document.querySelector('#submitTrade');
  let timer, refreshTimer, lastQuote=null;

  function syncSide(){
    document.querySelectorAll('[data-side]').forEach(b=>b.classList.toggle('active',b.dataset.side===side));
    submit.textContent=(side==='buy'?'Buy ':'Sell ')+asset.value;
    document.querySelector('#amountLabel').textContent=side==='buy'?'You pay':'Trade value';
  }
  document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{side=b.dataset.side;syncSide();updateQuote(true)});

  async function getQuote(){
    const v=Number(amount.value);if(!v){lastQuote=null;return}
    quoteState.textContent='Updating live rate…';quoteState.className='rate-state loading';
    submit.disabled=true;
    try{
      const q=await api('/api/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({side,amount:v,asset:asset.value,fiat:fiat.value})});
      lastQuote=q;
      qPrice.textContent=fmt(q.marketPrice,q.fiat);
      qFee.textContent=`${fmt(q.fee,q.fiat)} (${(Number(q.feeRate)*100).toFixed(2).replace(/\.00$/,'')}%)`;
      qReceive.textContent=`${num(q.cryptoAmount)} ${q.asset}`;
      qNgn.textContent=q.ngnRate?`${fmt(q.ngnRate,'NGN')} / USDT`:'—';
      qSource.textContent=q.source;
      qUpdated.textContent=new Date(q.rateUpdatedAt).toLocaleTimeString();
      quoteState.textContent='LIVE';quoteState.className='rate-state live';submit.disabled=false;
    }catch(e){
      lastQuote=null;qPrice.textContent='—';qFee.textContent='—';qReceive.textContent='—';qNgn.textContent='—';qSource.textContent='Bybit';qUpdated.textContent='—';
      quoteState.textContent='RATE UNAVAILABLE';quoteState.className='rate-state error';submit.disabled=true;
      document.querySelector('#quoteError').textContent=e.message;
    }
  }
  function updateQuote(now=false){clearTimeout(timer);timer=setTimeout(getQuote,now?0:250)}
  [amount,asset,fiat].forEach(x=>x.addEventListener('input',()=>{document.querySelector('#quoteError').textContent='';syncSide();updateQuote()}));
  syncSide(); updateQuote(true); refreshTimer=setInterval(()=>updateQuote(true),10000);
  window.addEventListener('beforeunload',()=>clearInterval(refreshTimer));

  form.onsubmit=async e=>{
    e.preventDefault();if(!authToken()){location.href='login.html?next=trade';return}
    if(!lastQuote){alert('A live Bybit quote is required before creating the order.');return}
    submit.disabled=true;submit.textContent='Locking live quote…';
    try{
      const j=await api('/api/orders',{method:'POST',headers:authHeaders(),body:JSON.stringify({side,amount:Number(amount.value),asset:asset.value,fiat:fiat.value})});
      localStorage.setItem('maxx_last_order',JSON.stringify(j.order));location.href='dashboard.html';
    }catch(err){alert(err.message);updateQuote(true)}finally{syncSide()}
  };
}

function initAuth(){
  const reg=document.querySelector('#registerForm');
  if(reg)reg.onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#message');msg.className='notice';try{const j=await api('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:reg.name.value,email:reg.email.value,password:reg.password.value})});localStorage.setItem('maxx_token',j.token);localStorage.setItem('maxx_user',JSON.stringify(j.user));location.href='dashboard.html'}catch(err){msg.textContent=err.message;msg.className='notice err'}};
  const login=document.querySelector('#loginForm');
  if(login)login.onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#message');msg.className='notice';try{const j=await api('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:login.email.value,password:login.password.value})});localStorage.setItem('maxx_token',j.token);localStorage.setItem('maxx_user',JSON.stringify(j.user));location.href='dashboard.html'}catch(err){msg.textContent=err.message;msg.className='notice err'}};
}

async function initDashboard(){
  const root=document.querySelector('#dashboardRoot');if(!root)return;if(!authToken()){location.href='login.html';return}
  try{
    const [{user},{orders},health]=await Promise.all([api('/api/me',{headers:authHeaders()}),api('/api/orders',{headers:authHeaders()}),api('/api/health')]);
    document.querySelector('#welcome').textContent=`Welcome, ${user.name.split(' ')[0]}`;
    document.querySelector('#mode').textContent=health.manualSettlement?'Manual settlement':'Provider settlement';
    document.querySelector('#orderCount').textContent=orders.length; const dbal=document.querySelector('#demoBalance'); if(dbal) dbal.textContent=fmt(user.demoBalance||0,user.balanceCurrency||'USD');
    const volume=orders.reduce((a,o)=>a+Number(o.amount||0),0);document.querySelector('#volume').textContent=fmt(volume,orders[0]?.fiat||'NGN');
    document.querySelector('#status').textContent=user.verified?'Verified':'Verification required';
    const list=document.querySelector('#orderList');
    list.innerHTML=orders.length?orders.map(o=>`<div class="card" style="margin:12px 0"><div class="order"><div><b>${o.side.toUpperCase()} ${o.asset}</b><div class="muted">${new Date(o.createdAt).toLocaleString()} • ${o.id}</div></div><div>${fmt(o.amount,o.fiat)}</div><div>${num(o.cryptoAmount,6)} ${o.asset}</div><div><span class="badge">${o.status.replaceAll('_',' ')}</span></div></div><p class="muted">Rate: ${fmt(o.marketPrice,o.fiat)} • Fee: ${fmt(o.fee,o.fiat)} (${(Number(o.feeRate||0.001)*100).toFixed(2).replace(/\.00$/,'')}%)${o.ngnRate?` • Bybit NGN: ${fmt(o.ngnRate,'NGN')}/USDT`:''}</p>${o.deposit?`<div class="settlement-box"><b>Send ${o.asset} on ${o.deposit.network} only</b><code>${o.deposit.address}</code></div>`:''}${o.payment?`<div class="settlement-box"><b>Bank transfer</b><span>${o.payment.bankName} • ${o.payment.accountName} • ${o.payment.accountNumber}</span></div>`:''}${['awaiting_payment','awaiting_crypto'].includes(o.status)?`<form class="proof-form proof-upload" onsubmit="submitProof(event,'${o.id}')"><input name="proof" placeholder="${o.side==='buy'?'Payment reference (optional if screenshot uploaded)':'Transaction hash (optional if screenshot uploaded)'}"><label class="file-label">Upload screenshot<input name="proofImage" type="file" accept="image/png,image/jpeg,image/webp"></label><span class="file-name"></span><button class="btn primary" type="submit">Submit for verification</button></form>`:''}</div>`).join(''):'<p class="muted">No orders yet. Create your first buy or sell order.</p>';
  const rf=document.querySelector('#reviewForm'); if(rf) rf.onsubmit=async e=>{e.preventDefault();try{await api('/api/reviews',{method:'POST',headers:authHeaders(),body:JSON.stringify({rating:Number(rf.rating.value),text:rf.text.value})});alert('Thanks. Your genuine review was submitted for moderation.');rf.reset()}catch(err){alert(err.message)}};
  }catch(e){logout()}
}

async function submitProof(e,id){
  e.preventDefault();
  const form=e.target, proof=form.proof.value.trim(), file=form.proofImage?.files?.[0];
  if(!proof && !file){alert('Enter a payment reference / transaction hash or upload a screenshot.');return}
  if(file && file.size>5*1024*1024){alert('Screenshot must be 5 MB or smaller.');return}
  try{
    let imageData='';
    if(file) imageData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    await api('/api/orders/'+id+'/proof',{method:'POST',headers:authHeaders(),body:JSON.stringify({proof,imageData,imageName:file?.name||''})});
    location.reload();
  }catch(err){alert(err.message)}
}

document.addEventListener('change',e=>{if(e.target.matches('.proof-upload input[type=file]')){const n=e.target.closest('.proof-upload').querySelector('.file-name');n.textContent=e.target.files?.[0]?.name||''}});
document.addEventListener('DOMContentLoaded',()=>{loadMarkets();initTrade();initAuth();initDashboard()});
