// Render every figures/*.mmd to a PNG beside it (Mermaid in headless Chromium).
// Needs Node with `playwright` and `mermaid` resolvable (npm install playwright
// mermaid, or NODE_PATH pointing at them). Usage: node render-figures.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const mermaidJs = require.resolve('mermaid/dist/mermaid.min.js');
const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.mmd')).sort();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent('<html><body style="margin:0;background:#fff"><div id="out" style="width:1500px;padding:16px"></div></body></html>');
  await page.addScriptTag({ path: mermaidJs });
  await page.evaluate(() => {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: 'Arial, Helvetica, sans-serif',
      flowchart: { htmlLabels: true, curve: 'basis' },
      sequence: { mirrorActors: false },
    });
  });
  for (const f of sources) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log('rendering', f);
    const id = 'g' + f.replace(/\W/g, '');
    await page.evaluate(async ({ id, text }) => {
      const { svg } = await window.mermaid.render(id, text);
      document.getElementById('out').innerHTML = svg;
    }, { id, text });
    const box = await page.$('#out svg');
    const png = path.join(dir, f.replace(/\.mmd$/, '.png'));
    await box.screenshot({ path: png });
    console.log('wrote', path.basename(png));
  }
  await browser.close();
})();
