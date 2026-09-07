import checkout from '../lib/checkout.js';
export default {async fetch(request){
  if(request.method!=='POST')return checkout.json({error:'Method not allowed.'},405);
  let config;
  try{config=checkout.configuration();}catch{return checkout.json({error:'Checkout is not open yet. Please try again soon.'},503);}
  try{return await checkout.createCheckout(request,checkout.stripeClient(),config);}catch(error){
    console.error('Stripe checkout failed',error.type||error.name);
    return checkout.json({error:'Unable to open payment checkout. Please try again.'},502);
  }
}};
