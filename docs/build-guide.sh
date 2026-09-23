#!/usr/bin/env bash
# Build USER-GUIDE-TH.pdf from USER-GUIDE-TH.md: pandoc → HTML → paged.js → PDF.
#
# Prerequisites:
#   brew install pandoc
#   npm install playwright pagedjs && npx playwright install chromium
#   (run npm install here, or export NODE_PATH to wherever they are installed)
#
# Usage: ./build-guide.sh     Output: USER-GUIDE-TH.pdf (this directory)

set -euo pipefail
cd "$(dirname "$0")"

HTML=".guide-build.html"
trap 'rm -f "$HTML"' EXIT

pandoc USER-GUIDE-TH.md -f markdown -t html5 --standalone \
  --css=guide-print.css \
  --metadata pagetitle="คู่มือการใช้งาน MedCode AI" \
  --metadata lang=th \
  -o "$HTML"

# paged.js fetches the stylesheet over XHR to read @page rules, which Chromium
# blocks for file:// pages, so the directory is served over a throwaway local
# HTTP server instead.
HTML="$HTML" node - <<'NODE'
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

function findPagedjs() {
  const dirs = [...(process.env.NODE_PATH || '').split(path.delimiter), path.join(process.cwd(), 'node_modules')];
  for (const dir of dirs) {
    if (!dir) continue;
    const p = path.join(dir, 'pagedjs', 'dist', 'paged.polyfill.js');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('pagedjs/dist/paged.polyfill.js not found on NODE_PATH or in ./node_modules');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png',
               '.ttf': 'font/ttf', '.js': 'text/javascript' };

(async () => {
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${process.env.HTML}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.PagedConfig = { auto: true, after: () => { window.__pagedDone = true; } };
  });
  await page.addScriptTag({ path: findPagedjs() });
  await page.waitForFunction(() => window.__pagedDone === true, undefined, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(500);
  await page.pdf({ path: 'USER-GUIDE-TH.pdf', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  server.close();
  console.log('Wrote USER-GUIDE-TH.pdf');
})();
NODE
