// ============================================================
// printDocument — hands a self-contained HTML document to the
// browser's own print engine.
//
// WHY THE BROWSER'S ENGINE AND NOT A PDF LIBRARY: this record is
// mostly Thai. Thai needs real OpenType shaping — vowels and tone
// marks stack above and below the consonant — and the canvas-style
// PDF writers (jsPDF & co.) place glyphs one after another, which
// turns a Thai discharge note into mojibake. The print engine is
// the same one that renders the page, so what the coder reads on
// screen is what lands in the PDF. It also keeps the frontend
// dependency-free.
//
// Two entry points, both fed by buildCaseReportDocument():
//   printHtmlDocument   — an off-screen iframe, prints in place.
//   openHtmlPreview     — a real window: the coder sees the
//                         document, then saves it from the print
//                         dialog's "Save as PDF" destination.
// ============================================================

/** How long to wait for a print dialog before tidying the frame away.
 *  afterprint is unreliable across browsers, so this is the backstop. */
const ABANDON_MS = 5 * 60 * 1000;
/** Removing the frame the instant afterprint fires can cancel the job. */
const REMOVE_DELAY_MS = 800;

/**
 * Print `html` without leaving the page. The frame is sized to A4 rather than
 * hidden at 1px: an off-screen frame still lays out at its own width, and a
 * 1px-wide frame prints a 1px-wide document.
 *
 * `title` is set on the host document for the duration of the dialog — it is
 * what browsers offer as the default "Save as PDF" filename.
 */
export function printHtmlDocument(html: string, title?: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Print document";
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";

  const hostTitle = document.title;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(abandon);
    document.title = hostTitle;
    window.setTimeout(() => frame.remove(), REMOVE_DELAY_MS);
  };
  const abandon = window.setTimeout(finish, ABANDON_MS);

  frame.addEventListener("load", () => {
    const win = frame.contentWindow;
    if (!win) {
      finish();
      return;
    }
    if (title) document.title = title;
    // Chrome fires afterprint inside the frame, Safari on the host — listen to
    // both and let `finished` swallow the second one.
    win.addEventListener("afterprint", finish, { once: true });
    window.addEventListener("afterprint", finish, { once: true });
    try {
      win.focus();
      win.print();
    } catch {
      finish();
    }
  });

  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/**
 * Open `html` in its own window as a document preview and raise the print
 * dialog on it. Returns false when the browser blocked the popup, so the
 * caller can fall back to printHtmlDocument.
 */
export function openHtmlPreview(html: string): boolean {
  // no `noopener` — that makes window.open return null, and the handle is how
  // the document gets written and the dialog raised
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // let the new document lay out before the dialog covers it, so cancelling
  // leaves the coder looking at the report rather than a blank page
  window.setTimeout(() => {
    if (win.closed) return;
    try {
      win.focus();
      win.print();
    } catch {
      /* the coder closed it, or printing is unavailable — the preview stands */
    }
  }, 400);
  return true;
}
