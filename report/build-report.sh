#!/usr/bin/env bash
# Build the full report (all chapters + all appendices) into one PDF and one
# combined Markdown file.
#
# Prerequisites:
#   brew install pandoc        # or your OS's pandoc package
#   npm install playwright && npx playwright install chromium
#   (run npm install from this directory, or export NODE_PATH to wherever
#   playwright is installed)
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
  appendix-e-questionnaire.md
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
  --toc --toc-depth=2 \
  -o MedCode-AI-Report.html

echo "Rendering to PDF (needs Node + playwright)..."
node - <<'NODE'
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve('MedCode-AI-Report.html'), { waitUntil: 'networkidle' });
  await page.pdf({
    path: 'MedCode-AI-Report.pdf',
    format: 'A4',
    margin: { top: '2.5cm', bottom: '2.5cm', left: '2.5cm', right: '2.5cm' },
    printBackground: true,
  });
  await browser.close();
  console.log('Wrote MedCode-AI-Report.pdf');
})();
NODE

echo "Done: MedCode-AI-Report.md, MedCode-AI-Report.html, MedCode-AI-Report.pdf"
