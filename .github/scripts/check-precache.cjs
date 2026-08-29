/* Fails if sw.js and the repository have drifted apart: every shipped asset must
   be precached, and everything precached must exist. Without this the two lists
   diverge silently and the app half-works offline. */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync('sw.js', 'utf8');
const block = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!block) {
  console.error('Could not find the PRECACHE array in sw.js');
  process.exit(1);
}

const listed = new Set(
  [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]).filter(entry => entry !== './')
);

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const shipped = ['index.html', 'site.webmanifest', ...walk('css'), ...walk('js'), ...walk('icons')]
  .filter(file => !file.endsWith('.sh'))
  .map(file => './' + file.split(path.sep).join('/'));

let failed = false;
for (const file of shipped) {
  if (!listed.has(file)) {
    console.error(`not precached, but served:  ${file}`);
    failed = true;
  }
}
for (const entry of listed) {
  if (!fs.existsSync(entry.replace(/^\.\//, ''))) {
    console.error(`precached, but missing:     ${entry}`);
    failed = true;
  }
}

// The service worker caches the font stylesheet under a literal URL; if index.html
// asks for a different one, the cache is never hit and the app loses its icons
// offline.
const swFontUrl = (source.match(/const FONT_CSS = '([^']+)'/) || [])[1];
const html = fs.readFileSync('index.html', 'utf8');
if (!swFontUrl) {
  console.error('Could not find FONT_CSS in sw.js');
  failed = true;
} else if (!html.includes(swFontUrl)) {
  console.error('FONT_CSS in sw.js does not match the stylesheet link in index.html:');
  console.error(`  ${swFontUrl}`);
  failed = true;
}

if (failed) {
  console.error('\nUpdate the PRECACHE array in sw.js.');
  process.exit(1);
}
console.log(`ok  ${shipped.length} shipped files, all precached`);
