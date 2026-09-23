(()=>{
  if(!document.getElementById('maxx-support-style')){
    const st=document.createElement('style'); st.id='maxx-support-style';
    st.textContent='.support-float{position:fixed;right:18px;bottom:18px;z-index:2500;display:flex;flex-direction:column;gap:8px}.support-float a{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 14px;border-radius:999px;text-decoration:none;font:900 11px -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)}.support-float .wa{background:#25d366;color:#04140a}.support-float .phone{background:#111a31;color:#fff;border:1px solid rgba(255,255,255,.16)}@media(max-width:640px){.support-float{right:10px;bottom:10px}.support-float a{padding:10px 12px;font-size:10px}}';
    document.head.appendChild(st);
  }
  if(document.querySelector('.support-float')) return;
  const box=document.createElement('div'); box.className='support-float';
  box.innerHTML='<a class="wa" href="https://wa.me/2349071890800" target="_blank" rel="noopener">WhatsApp +234 907 189 0800</a><a class="phone" href="tel:+2349071890800">Call +234 907 189 0800</a>';
  document.body.appendChild(box);
})();
