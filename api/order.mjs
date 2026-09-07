import checkout from '../lib/checkout.js';
export default {async fetch(request){
  if(request.method!=='GET')return checkout.json({error:'Method not allowed.'},405);
  try{return await checkout.orderStatus(request,checkout.stripeClient());}catch{return checkout.json({error:'Unable to verify payment. Please try again or contact support.'},503);}
}};
