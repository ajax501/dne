import checkout from '../lib/checkout.js';
export default {async fetch(request){
  if(request.method!=='POST')return checkout.json({error:'Method not allowed.'},405);
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_SECRET_KEY)return checkout.json({error:'Webhook is not configured.'},503);
  try{return await checkout.webhook(request,checkout.stripeClient(),process.env.STRIPE_WEBHOOK_SECRET);}catch(error){
    console.error('Stripe webhook processing failed',error.type||error.name);
    return checkout.json({error:'Please retry webhook delivery.'},500);
  }
}};
