const fs = require('node:fs');
const path = require('node:path');
const catalog = require('./lib/catalog.json');
const products = require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').split('const money')[0] + 'products');
if (products.length !== catalog.length || products.some(p => catalog.find(x => x.id === p.id)?.price !== p.price * 100)) throw Error('Storefront and server catalog prices must match.');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'app.js', 'checkout-ui.js', 'contact-shader.js', 'styles.css']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
}
fs.cpSync(path.join(__dirname, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Static storefront built in dist/');
