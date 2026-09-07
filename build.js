const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
}
fs.cpSync(path.join(__dirname, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Static storefront built in dist/');
