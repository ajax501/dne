const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Stripe=require('stripe');
const {configuration,validateCart,createCheckout,orderStatus,webhook}=require('./lib/checkout');
const origin='https://dne-rho.vercel.app';
const config={origin,countries:['US','GB'],allowedSizes:['XS','S','M','L','XL','XXL'],automaticTax:true};
const items=[{id:'yellow-camo-set',size:'M',qty:2,price:1}];
const request=(body,site=origin)=>new Request(origin+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',origin:site},body:JSON.stringify(body)});
test('server prices override client prices and match the storefront',()=>{
  assert.equal(validateCart(items)[0].price,20000);
  const products=vm.runInNewContext(fs.readFileSync('app.js','utf8').split('const money')[0]+'products');
  for(const p of products)assert.equal(validateCart([{id:p.id,size:'M',qty:1}])[0].price,p.price*100);
});
test('invalid products, sizes, quantities, and duplicate overflow are rejected',()=>{
  for(const value of [[],null,[{id:'nope',size:'M',qty:1}],[{id:items[0].id,size:'BAD',qty:1}],[{...items[0],qty:-1}],[{...items[0],qty:1.5}],[{...items[0],qty:21}],[{...items[0],qty:15},{...items[0],qty:10}]])assert.throws(()=>validateCart(value));
});
test('checkout stays closed without configuration and live approval',()=>{
  assert.throws(()=>configuration({}));
  const env={CHECKOUT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_mock',STRIPE_WEBHOOK_SECRET:'whsec_mock',SITE_URL:origin};
  assert.equal(configuration(env).automaticTax,true);
  assert.throws(()=>configuration({...env,STRIPE_SECRET_KEY:'sk_live_mock'}));
  assert.equal(configuration({...env,STRIPE_SECRET_KEY:'sk_live_mock',LIVE_CHECKOUT_APPROVED:'true'}).live,true);
});
test('session creation includes sizes, fixed shipping, return links and stable retry parameters',async()=>{
  const calls=[];const client={checkout:{sessions:{create:async(params,options)=>{calls.push({params,options});return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
  const body={items,requestId:'request-1234567890123456'};
  assert.equal((await createCheckout(request(body),client,config)).status,200);
  assert.equal((await createCheckout(request(body),client,config)).status,200);
  assert.deepEqual(calls[0],calls[1]);
  const p=calls[0].params;
  assert.equal(p.line_items[0].price_data.unit_amount,20000);
  assert.equal(p.line_items[0].price_data.product_data.metadata.size,'M');
  assert.equal(p.line_items[0].price_data.product_data.name,'001');
  assert.equal(p.line_items[0].price_data.product_data.description,'Size M. Top and bottom included.');
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
  assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
  assert.equal((await createCheckout(request(body,'https://other.example'),client,config)).status,403);
  assert.equal((await createCheckout(request({items:[],requestId:body.requestId}),client,config)).status,400);
  assert.equal(calls.length,2);
});
test('order status only confirms completed paid Stripe sessions and does not expose customer details',async()=>{
  const url=new Request(origin+'/api/order?session_id=cs_test_123456789012');
  for(const [status,payment_status,paid] of [['open','unpaid',false],['complete','unpaid',false],['complete','paid',true]]){
    const client={checkout:{sessions:{retrieve:async()=>({status,payment_status,metadata:{store:'dne',order_reference:'DNE-ABC'},customer_details:{email:'private@example.com'},amount_total:41000,currency:'usd',livemode:false})}}};
    const result=await (await orderStatus(url,client)).json();assert.equal(result.paid,paid);assert.ok(!JSON.stringify(result).includes('private@example.com'));
  }
});
test('signed webhook persists verification, is safe to retry, and rejects forged events',async()=>{
  const sdk=new Stripe('sk_test_mock');const calls=[];
  const client={webhooks:sdk.webhooks,paymentIntents:{update:async(...args)=>calls.push(args)}};
  const event={type:'checkout.session.completed',data:{object:{id:'cs_test_123456789012',payment_status:'paid',payment_intent:'pi_mock',metadata:{store:'dne'}}}};
  const payload=JSON.stringify(event),secret='whsec_test_secret';
  const signature=sdk.webhooks.generateTestHeaderString({payload,secret});
  const req=sig=>new Request(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':sig},body:payload});
  assert.equal((await webhook(req('invalid'),client,secret)).status,400);assert.equal(calls.length,0);
  assert.equal((await webhook(req(signature),client,secret)).status,200);
  assert.equal((await webhook(req(signature),client,secret)).status,200);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0][1].metadata.dne_payment_verified,'true');
  event.data.object.payment_status='unpaid';const unpaid=JSON.stringify(event);
  await webhook(new Request(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':sdk.webhooks.generateTestHeaderString({payload:unpaid,secret})},body:unpaid}),client,secret);
  assert.equal(calls.length,2);
});
test('unconfigured deployed endpoint responds gracefully',async()=>{
  const handler=(await import('./api/checkout.mjs')).default;
  const previous=process.env.CHECKOUT_ENABLED;delete process.env.CHECKOUT_ENABLED;
  try{assert.equal((await handler.fetch(request({items}))).status,503);}finally{if(previous!==undefined)process.env.CHECKOUT_ENABLED=previous;}
});
test('successful browser verification subtracts only purchased items and only once',async()=>{
  const elements=new Map();const storage=new Map([['dne-pending-cs_test_123456789012',JSON.stringify([{id:'yellow-camo-set',size:'M',qty:2}])]]);
  const context=vm.createContext({URLSearchParams,JSON,location:{hash:'#/order?session_id=cs_test_123456789012'},document:{addEventListener(){},querySelector(s){if(!elements.has(s))elements.set(s,{});return elements.get(s);}},sessionStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},cart:[{id:'yellow-camo-set',size:'M',qty:3},{id:'linear-set',size:'S',qty:1}],saveCart(){},fetch:async()=>({ok:true,json:async()=>({paid:true,reference:'DNE-ABC'})})});
  vm.runInContext(fs.readFileSync('checkout-ui.js','utf8'),context);
  await vm.runInContext('verifyOrder()',context);await vm.runInContext('verifyOrder()',context);
  assert.equal(context.cart[0].qty,1);assert.equal(context.cart[1].qty,1);assert.equal(storage.size,0);
});
