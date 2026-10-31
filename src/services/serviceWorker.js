/**
 * Builds /sw.js on the fly: the template plus the list of every page, script and stylesheet in /public.
 * The version changes whenever any of those files change, so a new release replaces the saved copies on the next visit.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMPLATE = path.join(__dirname, 'sw.template.js');
const CODE_EXT = new Set(['.html', '.css', '.js', '.svg', '.png', '.ico', '.webmanifest', '.woff2']);

// Fonts and icons the pages load from a CDN (kept in step with <link> tags in index.html / login.html)
const EXTERNAL = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
];

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = `${base}/${name}`;
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full, rel));
    else if (CODE_EXT.has(path.extname(name).toLowerCase())) out.push({ url: rel, sig: `${rel}:${st.size}:${Math.round(st.mtimeMs)}` });
  }
  return out;
}

let memo = null;

function render(publicDir) {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && memo && Date.now() - memo.at < 60 * 1000) return memo.body;

  const files = walk(publicDir).filter((f) => f.url !== '/sw.js').sort((a, b) => (a.url < b.url ? -1 : 1));
  const version = crypto.createHash('sha1').update(files.map((f) => f.sig).join('|')).digest('hex').slice(0, 12);
  const urls = ['/', ...files.map((f) => f.url)];
  const body = fs.readFileSync(TEMPLATE, 'utf8')
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(urls))
    .replace('__EXTERNAL__', JSON.stringify(EXTERNAL));
  memo = { at: Date.now(), body };
  return body;
}

module.exports = { render };
