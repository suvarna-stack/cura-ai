#!/usr/bin/env bash
# Build the full report (all chapters + all appendices) into one PDF and one
# combined Markdown file. Uses paged.js (a CSS Paged Media polyfill) so the
# PDF gets standard report formatting: running header, bottom-center page
# numbers, and a real table of contents with dot leaders + correct page
# numbers per entry -- not just a plain linked list.
#
# Prerequisites:
#   brew install pandoc        # or your OS's pandoc package
#   npm install playwright pagedjs && npx playwright install chromium
#   (run npm install from this directory, or export NODE_PATH to wherever
#   they're installed)
#
# Usage: ./build-report.sh
# Output: MedCode-AI-Report.md, MedCode-AI-Report.html, MedCode-AI-Report.pdf
#   (this directory). Only the .pdf is meant to be committed as the actual
#   submission artifact -- the .md/.html are regenerable intermediates.

set -euo pipefail
cd "$(dirname "$0")"

FILES=(
  00-title.md
  01-problem.md
  02-related-work.md
  03-design.md
  04-implementation.md
  05-data-pdpa.md
  06-testing-evaluation.md
  07-results.md
  08-conclusion.md
  appendices-outline.md
  appendix-a-api-reference.md
  appendix-b-architecture.md
  appendix-c-database-schema.md
  appendix-d-test-evidence.md
  appendix-f-screenshots.md
  appendix-g-production-readiness.md
  appendix-h-data-provenance.md
)

echo "Concatenating ${#FILES[@]} files..."
> MedCode-AI-Report.md
for f in "${FILES[@]}"; do
  { echo; echo; echo '<div class="pagebreak"></div>'; echo; echo; cat "$f"; } >> MedCode-AI-Report.md
done

echo "Converting to HTML (pandoc)..."
pandoc MedCode-AI-Report.md \
  -f markdown -t html5 --standalone \
  --css=report-print.css \
  --metadata title="MedCode AI — Final Report" \
  --toc --toc-depth=2 --metadata toc-title="Table of Contents" \
  -o MedCode-AI-Report.html

echo "Rendering to PDF via paged.js (needs Node + playwright + pagedjs)..."
# paged.js fetches its stylesheet via XHR to parse @page rules; file:// URLs
# are blocked by CORS for that fetch in Chromium, so serve this repo root
# (medcode-stack/.. , covers the ../../audit-chart-frontend image paths too)
# over a throwaway local HTTP server instead of using file://.
node - <<'NODE'
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

function findPagedjs() {
  for (const dir of (process.env.NODE_PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'pagedjs', 'dist', 'paged.polyfill.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  const local = path.join(process.cwd(), 'node_modules', 'pagedjs', 'dist', 'paged.polyfill.js');
  if (fs.existsSync(local)) return local;
  throw new Error('pagedjs/dist/paged.polyfill.js not found on NODE_PATH or local node_modules');
}
const pagedjsPath = findPagedjs();

const REPO_ROOT = path.resolve('..', '..'); // cura-ai/
const REPORT_REL = path.relative(REPO_ROOT, process.cwd()); // medcode-stack/report

const MIME = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.js': 'text/javascript' };

(async () => {
  const server = http.createServer((req, res) => {
    const filePath = path.join(REPO_ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${REPORT_REL}/MedCode-AI-Report.html`;
  console.log('serving at', url);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    window.PagedConfig = {
      auto: true,
      after: () => { window.__pagedDone = true; },
    };
  });
  await page.addScriptTag({ path: pagedjsPath });
  await page.waitForFunction(() => window.__pagedDone === true, undefined, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(500); // let final layout settle

  await page.pdf({
    path: 'MedCode-AI-Report.pdf',
    printBackground: true,
    preferCSSPageSize: true, // respect paged.js's own @page size/margins
  });
  await browser.close();
  server.close();
  console.log('Wrote MedCode-AI-Report.pdf');
})();
NODE

echo "Done: MedCode-AI-Report.md, MedCode-AI-Report.html, MedCode-AI-Report.pdf"
