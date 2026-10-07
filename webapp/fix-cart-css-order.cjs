/* Vite appends its hashed <link> at the end of <head>, which would put Tailwind's
   preflight AFTER the sw-* stylesheet on pages that reuse the vanilla CSS.
   Equal-specificity rules must resolve in favour of the vanilla styles,
   so we reorder after build for every page that links /css/styles.css. */
const fs = require('fs');
const path = require('path');

const PAGES = ['cart.html', 'order-success.html', 'track.html', 'login.html', 'account.html', 'about.html', 'faq.html', 'terms.html', 'privacy.html', 'refund.html', 'subscriptions.html', '404.html', 'partner.html', 'admin.html'];

for (const name of PAGES) {
  const file = path.join(__dirname, '..', 'public', name);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const reactLink = html.match(/<link rel="stylesheet" crossorigin href="\/react\/[^"]+\.css">/);
  const vanilla = /<link rel="stylesheet" href="\/css\/styles\.css\?v=[^"]+">/.exec(html);
  if (reactLink && vanilla && html.indexOf(reactLink[0]) > html.indexOf(vanilla[0])) {
    html = html.replace(reactLink[0] + '\n', '').replace(reactLink[0], '');
    html = html.replace(vanilla[0], reactLink[0] + '\n  ' + vanilla[0]);
    fs.writeFileSync(file, html);
    console.log(`${name}: css order fixed (react css first, sw-* stylesheet last)`);
  }
}
