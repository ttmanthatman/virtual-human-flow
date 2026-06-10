import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const styles = readFileSync("src/styles.css", "utf8");

function buildAuditEntry(index) {
  return `
    <article class="audit-entry">
      <div class="audit-entry-head">
        <strong>测试用户 ${index + 1}</strong>
        <div class="audit-entry-actions">
          <span>2026/6/10 10:${String(index).padStart(2, "0")}</span>
          <button class="icon-button compact" type="button">x</button>
        </div>
      </div>
      <small>滚动验证档案 · 完成</small>
      <section>
        <h3>输入</h3>
        <p>这是一条用于撑高审计列表的输入记录 ${index + 1}。</p>
      </section>
      <section>
        <h3>输出</h3>
        <p>这是一条用于撑高审计列表的输出记录 ${index + 1}。</p>
      </section>
    </article>
  `;
}

const entries = Array.from({ length: 60 }, (_, index) => buildAuditEntry(index)).join("");
const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>${styles}</style>
    </head>
    <body>
      <main>
        <div class="modal-backdrop">
          <section class="audit-modal">
            <div class="modal-head">
              <div>
                <strong>用户输入输出</strong>
                <span>仅管理员可见，后台保留最近 1000 条</span>
              </div>
              <div class="modal-actions">
                <button class="secondary-button danger-button compact-text-button" type="button">清空</button>
                <button class="icon-button compact" type="button">x</button>
              </div>
            </div>
            <div class="audit-list">${entries}</div>
          </section>
        </div>
      </main>
    </body>
  </html>
`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
await page.setContent(html);

const metrics = await page.evaluate(() => {
  const modal = document.querySelector(".audit-modal");
  const list = document.querySelector(".audit-list");
  if (!(modal instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    throw new Error("Audit modal fixture did not render.");
  }

  const initialScrollTop = list.scrollTop;
  list.scrollTop = 240;

  return {
    initialScrollTop,
    listClientHeight: list.clientHeight,
    listScrollHeight: list.scrollHeight,
    listScrollTopAfter: list.scrollTop,
    modalClientHeight: modal.clientHeight,
    modalScrollHeight: modal.scrollHeight,
    overflowY: getComputedStyle(list).overflowY,
  };
});

await browser.close();

if (metrics.overflowY !== "auto") {
  throw new Error(`Expected audit list overflow-y to be auto, got ${metrics.overflowY}.`);
}

if (metrics.listScrollHeight <= metrics.listClientHeight) {
  throw new Error(`Expected audit list to have overflow content, got ${JSON.stringify(metrics)}.`);
}

if (metrics.listScrollTopAfter <= metrics.initialScrollTop) {
  throw new Error(`Expected audit list to accept scrollTop changes, got ${JSON.stringify(metrics)}.`);
}

if (metrics.modalScrollHeight > metrics.modalClientHeight + 1) {
  throw new Error(`Expected audit modal content to stay inside the modal, got ${JSON.stringify(metrics)}.`);
}

console.log("Audit modal scroll verification passed.");
