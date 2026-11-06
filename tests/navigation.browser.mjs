import assert from 'node:assert/strict';
import { test } from 'node:test';
import { card, launchEngine, withArtifact } from './browser-helpers.mjs';

const spacer = '<p>Original reading context before the destination.</p>'.repeat(90);
const metadata = { title: 'Original navigation notebook', url: 'https://example.test/notebook?edition=1' };
const snapshot = (links, tail, head = '') => `<!doctype html><html><head>${head}</head><body>${links}${spacer}${tail}</body></html>`;

for (const engine of ['chromium', 'firefox']) {
  test(`${engine}: source root and body IDs and the top fallback remain navigable`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = `<!doctype html><html id="document-start"><body id="body-start">${spacer}<a href="#body-start">Body start</a><a href="#document-start">Document start</a><a href="#top">Top fallback</a></body></html>`;
      await withArtifact(browser, { html, annotations: [], metadata }, async ({ source, requests }) => {
        for (const label of ['Body start', 'Document start', 'Top fallback']) {
          await source.getByText(label, { exact: true }).click();
          assert.equal(await source.evaluate(() => scrollY), 0, label + ' reaches the saved document start');
        }
        assert.deepEqual(requests, []);
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: offline fragment and same-document links reach Unicode and legacy targets`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = snapshot('<a href="#%E6%B3%A8%E9%87%8A%20%5D">Encoded footnote</a><a href="https://example.test/notebook?edition=1#legacy">Absolute same-page note</a>',
        '<p id="注释 ]">The Unicode footnote.</p>' + spacer + '<a name="legacy"></a><p>The legacy footnote.</p>',
        '<base href="https://example.test/notebook?edition=1">');
      await withArtifact(browser, { html, annotations: [], metadata }, async ({ page, source, requests }) => {
        await source.getByText('Encoded footnote', { exact: true }).click();
        await source.waitForFunction(() => scrollY > 0);
        assert.equal(await page.locator('#link-preview').isVisible(), false, 'a saved-page fragment stays inside the offline snapshot');
        assert.equal(await source.evaluate(() => {
          const bounds = document.getElementById('注释 ]').getBoundingClientRect();
          return bounds.top >= -2 && bounds.top < innerHeight;
        }), true, 'percent-decoded Unicode ID is reached without CSS-selector interpolation');
        await source.evaluate(() => scrollTo(0, 0));
        await source.getByText('Absolute same-page note', { exact: true }).click();
        await source.waitForFunction(() => scrollY > 0);
        assert.equal(await page.locator('#link-preview').isVisible(), false);
        assert.equal(await source.getByText('The legacy footnote.', { exact: true }).evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= -2 && bounds.top < innerHeight;
        }), true, 'absolute same-document link reaches the legacy named anchor');
        assert.deepEqual(requests, [], 'in-document jumps never request the original site');
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: fragments work without metadata and missing targets explain the limitation`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = snapshot('<a href="#target">Local note</a><a href="#missing">Missing note</a>', '<p id="target">Available local note.</p>');
      await withArtifact(browser, { html, annotations: [], metadata: { title: 'No original URL' } }, async ({ page, source, requests }) => {
        await source.getByText('Local note', { exact: true }).click();
        await source.waitForFunction(() => scrollY > 0);
        await source.evaluate(() => scrollTo(0, 0));
        await source.getByText('Missing note', { exact: true }).click();
        assert.match(await page.locator('#live-status').textContent(), /target.*unavailable|target.*not.*available|not.*found/i);
        assert.match(await page.locator('#navigation-status').innerText(), /target.*unavailable|target.*not.*available|not.*found/i,
          'a missing local destination has a visible explanation, not only an announcement');
        assert.equal(await page.locator('#link-preview').isVisible(), false);
        assert.deepEqual(requests, []);
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: explicit base and different query retain external preview and return keyboard focus`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = snapshot('<a href="#target">Different document through base</a><a href="https://example.test/notebook?edition=2#target">Different edition</a>',
        '<p id="target">This local target must not redirect an external link.</p>', '<base href="https://elsewhere.test/other">');
      await withArtifact(browser, { html, annotations: [], metadata }, async ({ page, source, requests }) => {
        const first = source.getByText('Different document through base', { exact: true });
        await first.focus();
        await page.keyboard.press('Enter');
        const action = page.locator('#external-link');
        assert.equal(await action.getAttribute('href'), 'https://elsewhere.test/other#target');
        assert.equal(await action.evaluate((element) => element === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await first.evaluate((element) => element === document.activeElement), true, 'Escape returns to the exact source link');
        const second = source.getByText('Different edition', { exact: true });
        await second.focus();
        await page.keyboard.press('Enter');
        assert.equal(await action.getAttribute('href'), 'https://example.test/notebook?edition=2#target');
        await page.getByRole('button', { name: 'Close link preview', exact: true }).click();
        assert.equal(await second.evaluate((element) => element === document.activeElement), true, 'Close returns to the exact source link');
        assert.equal(await source.evaluate(() => scrollY), 0, 'external preview does not jump to an unrelated local ID');
        assert.deepEqual(requests, []);
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: snapshot language and right-to-left direction survive static cleanup`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = '<!doctype html><html lang="ar" dir="rtl"><body lang="ar-SA" dir="rtl"><p>مرحبا بالعالم <span lang="en" dir="ltr">original English quotation</span></p><p lang="zh-CN" dir="invalid">中文注释</p></body></html>';
      await withArtifact(browser, { html, annotations: [], metadata }, async ({ page, source, requests }) => {
        assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'viewer controls keep their own language');
        assert.equal(await source.locator('html').getAttribute('lang'), 'ar');
        assert.equal(await source.locator('html').getAttribute('dir'), 'rtl');
        assert.equal(await source.locator('body').getAttribute('lang'), 'ar-SA');
        assert.equal(await source.locator('body').getAttribute('dir'), 'rtl');
        assert.equal(await source.locator('body').evaluate((element) => getComputedStyle(element).direction), 'rtl');
        assert.equal(await source.locator('span').getAttribute('lang'), 'en');
        assert.equal(await source.locator('span').getAttribute('dir'), 'ltr');
        assert.equal(await source.getByText('中文注释', { exact: true }).getAttribute('lang'), 'zh-CN');
        assert.equal(await source.getByText('中文注释', { exact: true }).getAttribute('dir'), null, 'invalid direction is omitted');
        assert.deepEqual(requests, []);
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: jumping from a phone-width annotation brings the source frame back into view`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = snapshot('<h1>Phone reading notebook</h1>', '<p id="target">A footnote at the end.</p>');
      const annotations = Array.from({ length: 10 }, (_, index) => ({ id: `phone-note-${index}`, type: 'highlight', text: 'A footnote at the end.', comment: `Original context note ${index + 1}.`, position: { type: 'CssSelector', value: '#target' } }));
      await withArtifact(browser, { html, annotations, metadata }, async ({ page, source, sourceElement }) => {
        await page.setViewportSize({ width: 375, height: 740 });
        const jump = card(page, 9).getByRole('button', { name: 'Jump to annotation', exact: true });
        await jump.scrollIntoViewIfNeeded();
        assert.equal(await sourceElement.evaluate((element) => element.getBoundingClientRect().bottom <= 0), true,
          'the stacked layout starts with the source frame offscreen');
        await jump.click();
        await source.waitForFunction(() => scrollY > 0);
        assert.equal(await sourceElement.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < innerHeight;
        }), true, 'jump brings the source frame into the outer viewport too');
      });
    } finally { await browser.close(); }
  });
}
