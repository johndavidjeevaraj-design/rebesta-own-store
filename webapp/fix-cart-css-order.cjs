/* Vite appends its hashed <link> at the end of <head>, which would put Tailwind's
   preflight AFTER the Swiggy-exact sw-* stylesheet. Equal-specificity rules must
   resolve in favour of the vanilla basket styles, so we reorder after build. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'cart.html');
let html = fs.readFileSync(file, 'utf8');
const reactLink = html.match(/<link rel="stylesheet" crossorigin href="\/react\/[^"]+\.css">/);
const vanilla = /<link rel="stylesheet" href="\/css\/styles\.css\?v=[^"]+">/.exec(html);
if (reactLink && vanilla && html.indexOf(reactLink[0]) > html.indexOf(vanilla[0])) {
  html = html.replace(reactLink[0] + '\n', '').replace(reactLink[0], '');
  html = html.replace(vanilla[0], reactLink[0] + '\n  ' + vanilla[0]);
  fs.writeFileSync(file, html);
  console.log('cart.html css order fixed: react css first, sw-* stylesheet last');
} else {
  console.log('cart.html css order already fine');
}
