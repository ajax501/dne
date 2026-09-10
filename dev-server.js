const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
http.createServer(async (req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);res.end('Bad request');return;}
  if(pathname.startsWith('/api/')){
    const routes={'/api/checkout':'checkout','/api/order':'order','/api/stripe-webhook':'stripe-webhook'};
    if(!routes[pathname]){res.writeHead(404);res.end('Not found');return;}
    try{
      let body; if(!['GET','HEAD'].includes(req.method)){
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);
      }
      const handler=(await import('./api/'+routes[pathname]+'.mjs')).default;
      const response=await handler.fetch(new Request('http://localhost:'+ (process.env.PORT||3000)+req.url,{method:req.method,headers:req.headers,body}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500);res.end('API error');}return;
  }
  if(!['/','/index.html','/app.js','/checkout-ui.js','/contact-shader.js','/styles.css'].includes(pathname)&&!pathname.startsWith('/assets/')){res.writeHead(404);res.end('Not found');return;}
  if(pathname.includes('..')){res.writeHead(403);res.end('Forbidden');return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);});
}).listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('DO NOT ENTER is running at http://localhost:3000'));
