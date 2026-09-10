const Stripe = require('stripe');
const {createHash} = require('node:crypto');
const catalog = require('./catalog.json');
const sizes = ['XS','S','M','L','XL','XXL'];
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
function configuration(env=process.env){
  if(env.CHECKOUT_ENABLED!=='true'||!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw Error('Checkout is not configured');
  const origin=new URL(env.SITE_URL).origin;
  if(!origin.startsWith('https://')&&!origin.startsWith('http://localhost:'))throw Error('Invalid site URL');
  const live=env.STRIPE_SECRET_KEY.startsWith('sk_live_');
  if(live && env.LIVE_CHECKOUT_APPROVED!=='true')throw Error('Live checkout is not enabled');
  if(!live&&!env.STRIPE_SECRET_KEY.startsWith('sk_test_'))throw Error('Invalid key mode');
  const countries=require('./shipping-countries.json');
  const allowedSizes=sizes;
  return {origin,live,countries,allowedSizes,automaticTax:env.STRIPE_AUTOMATIC_TAX!=='false'};
}
function stripeClient(){return new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000});}
function validateCart(items,allowedSizes=sizes){
  if(!Array.isArray(items)||!items.length||items.length>54)throw Error('Your bag must contain between 1 and 54 selections.');
  const combined=new Map();
  for(const item of items){
    const product=catalog.find(p=>p.id===item?.id);
    if(!product||!allowedSizes.includes(item.size)||!Number.isInteger(item.qty)||item.qty<1||item.qty>20)throw Error('Please check the products, sizes, and quantities in your bag.');
    const key=product.id+':'+item.size;
    const qty=(combined.get(key)?.qty||0)+item.qty;
    if(qty>20)throw Error('Maximum 20 of each size per order.');
    combined.set(key,{...product,size:item.size,qty});
  }
  return [...combined.values()].sort((a,b)=>(a.id+a.size).localeCompare(b.id+b.size));
}
async function createCheckout(request,client,config){
  if(request.headers.get('origin')!==config.origin)return json({error:'Please start checkout from the store website.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  const raw=await request.text();
  if(raw.length>16000)return json({error:'Request too large.'},413);
  let body,items;
  try{body=JSON.parse(raw);items=validateCart(body.items,config.allowedSizes);}catch(e){return json({error:e instanceof SyntaxError?'Invalid request.':e.message},400);}
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId||''))return json({error:'Please refresh and try again.'},400);
  const fingerprint=createHash('sha256').update(JSON.stringify(items)).digest('hex');
  const reference='DNE-'+createHash('sha256').update(body.requestId+fingerprint).digest('hex').slice(0,12).toUpperCase();
  const metadata={store:'dne',order_reference:reference};
  const session=await client.checkout.sessions.create({
    mode:'payment',payment_method_types:['card'],billing_address_collection:'required',
    shipping_address_collection:{allowed_countries:config.countries},
    shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:1000,currency:'usd'},display_name:'Standard shipping',tax_behavior:'exclusive'}}],
    automatic_tax:{enabled:config.automaticTax},
    customer_creation:'always',client_reference_id:reference,
    metadata,payment_intent_data:{metadata},
    success_url:config.origin+'/#/order?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:config.origin+'/#/checkout',
    line_items:items.map(p=>({quantity:p.qty,price_data:{currency:'usd',unit_amount:p.price,tax_behavior:'exclusive',product_data:{name:p.model,description:`Size ${p.size}. Top and bottom included.`,images:[config.origin+'/'+p.image],metadata:{model:p.model,size:p.size,product_id:p.id}}}})),
  },{idempotencyKey:'dne-'+body.requestId+'-'+fingerprint});
  if(!session.url||new URL(session.url).hostname!=='checkout.stripe.com')throw Error('Missing Checkout URL');
  return json({url:session.url,id:session.id});
}
async function orderStatus(request,client){
  const id=new URL(request.url).searchParams.get('session_id');
  if(!/^cs_(test_|live_)?[A-Za-z0-9]{12,200}$/.test(id||''))return json({error:'Invalid order link.'},400);
  const session=await client.checkout.sessions.retrieve(id);
  if(session.metadata?.store!=='dne')return json({error:'Order not found.'},404);
  return json({paid:session.status==='complete'&&session.payment_status==='paid',status:session.status,reference:session.metadata.order_reference,amount:session.amount_total,currency:session.currency,test:!session.livemode});
}
async function webhook(request,client,secret){
  let event;
  try{event=client.webhooks.constructEvent(await request.text(),request.headers.get('stripe-signature'),secret);}catch{return json({error:'Invalid webhook signature.'},400);}
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
    const session=event.data.object;
    if(session.metadata?.store==='dne'&&session.payment_status==='paid'){
      // Stripe is the durable order ledger. Store a payment-verified marker on the
      // payment for manual fulfillment. Repeated webhook deliveries set the same value.
      const payment=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
      if(!payment)throw Error('Paid session has no payment');
      await client.paymentIntents.update(payment,{metadata:{dne_payment_verified:'true',dne_checkout_session:session.id}});
    }
  }
  return json({received:true});
}
module.exports={json,configuration,stripeClient,validateCart,createCheckout,orderStatus,webhook};
