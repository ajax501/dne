let checkoutAttempt = null;
async function beginCheckout(){
  const button=document.querySelector('#stripe-checkout');
  const result=document.querySelector('#checkout-result');
  if(!cart.length||!button||button.disabled)return;
  button.disabled=true;button.textContent='OPENING SECURE CHECKOUT…';result.textContent='';
  const snapshot=cart.map(({id,size,qty})=>({id,size,qty}));
  const fingerprint=JSON.stringify(snapshot);
  if(checkoutAttempt?.fingerprint!==fingerprint)checkoutAttempt={fingerprint,requestId:crypto.randomUUID()};
  try{
    const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:snapshot,requestId:checkoutAttempt.requestId})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Unable to open checkout. Please try again.');
    const target=new URL(data.url);
    if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com')throw Error('Unable to open secure checkout.');
    try{sessionStorage.setItem('dne-pending-'+data.id,JSON.stringify(snapshot));}catch{}
    window.location.assign(target.href);
  }catch(error){result.textContent=error.message||'Unable to connect. Please try again.';button.disabled=false;button.textContent='PAY WITH STRIPE';}
}
function orderPage(){return '<div class="page empty"><h1 class="page-title">YOUR ORDER</h1><p id="order-status" role="status" aria-live="polite">Checking payment status…</p><p id="order-reference"></p><button class="secondary" id="refresh-order">CHECK AGAIN</button><p><a class="text-link" href="#/shop">CONTINUE SHOPPING</a></p><p class="quiet">Questions? <a href="mailto:dnedonotenterdne@gmail.com">dnedonotenterdne@gmail.com</a></p></div>';}
async function verifyOrder(){
  const id=new URLSearchParams(location.hash.split('?')[1]||'').get('session_id');
  const el=document.querySelector('#order-status');if(!el)return;
  if(!id){el.textContent='No order reference was provided.';return;}
  const button=document.querySelector('#refresh-order');button.disabled=true;
  try{
    const response=await fetch('/api/order?session_id='+encodeURIComponent(id),{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to verify payment.');
    if(!location.hash.startsWith('#/order'))return;
    el.textContent=data.paid?(data.test?'Test payment successful. No real payment was taken.':'Payment received. Thank you for your order.'):(data.status==='expired'?'This checkout has expired. Your bag is still available.':'Payment is not confirmed yet. Check again before starting another payment.');
    document.querySelector('#order-reference').textContent=data.reference?'Order reference: '+data.reference:'';
    if(data.paid){
      try{
        const key='dne-pending-'+id;const purchased=JSON.parse(sessionStorage.getItem(key)||'null');
        if(Array.isArray(purchased)){
          // Subtract only this checkout's items; preserve anything added later.
          for(const item of purchased){const current=cart.find(x=>x.id===item.id&&x.size===item.size);if(current)current.qty=Math.max(0,current.qty-item.qty);}
          cart=cart.filter(x=>x.qty>0);saveCart();sessionStorage.removeItem(key);
        }
      }catch{}
      button.hidden=true;
    }
  }catch(error){el.textContent=error.message||'Unable to check payment. Please try again.';}finally{button.disabled=false;}
}
document.addEventListener('click',event=>{
  if(event.target.closest('#stripe-checkout'))beginCheckout();
  if(event.target.closest('#refresh-order'))verifyOrder();
});
