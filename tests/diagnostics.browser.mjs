import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchEngine, withArtifact } from './browser-helpers.mjs';

for (const engine of ['chromium', 'firefox']) {
  test(`${engine}: opt-in diagnostics exclude source content and identifiers`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const secret = 'PRIVATE-SYNTHETIC-MARKER';
      const input = {
        html: `<!doctype html><p id="reading">${secret} original passage</p>`,
        metadata: { title: secret + ' title', url: 'https://example.invalid/' + secret, savedAt: secret + ' date' },
        annotations: [
          { id: secret + '-id', type: 'highlight', text: secret + ' original passage', comment: secret + ' comment',
            tags: [secret + ' tag'], position: { type: 'CssSelector', value: '#reading' } },
          { id: secret + '-unresolved', type: 'underline', text: 'A changed quotation', comment: secret + ' note',
            position: { type: 'CssSelector', value: '#reading' } },
          { id: secret + '-unknown', type: secret + '-custom-type', text: secret + ' drawing' },
        ],
      };
      await withArtifact(browser, input, async ({ page, source, report, requests }) => {
        const panel = page.locator('#diagnostic-panel');
        assert.equal(await panel.isVisible(), false, 'summary is closed until requested');
        const button = page.getByRole('button', { name: 'Troubleshooting summary', exact: true });
        await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        const summary = page.getByRole('textbox', { name: 'Troubleshooting summary', exact: true });
        const value = await summary.inputValue();
        assert.ok(!value.includes(secret), 'no title, URL, content, comment, tag, ID or custom type enters diagnostics');
        assert.ok(!value.includes(report.sourceSha256), 'the source fingerprint is excluded too');
        const diagnostic = JSON.parse(value);
        assert.deepEqual(Object.keys(diagnostic).sort(), ['annotations', 'counts', 'format', 'version']);
        assert.equal(diagnostic.format, 'marginpack-diagnostic-1');
        assert.match(diagnostic.version, /^\d+\.\d+\.\d+$/);
        assert.deepEqual(diagnostic.counts, { total: 3, matched: 1, unresolved: 1, unsupported: 1 });
        assert.deepEqual(diagnostic.annotations, [
          { number: 1, type: 'highlight', status: 'matched' },
          { number: 2, type: 'underline', status: 'unresolved' },
          { number: 3, type: 'other', status: 'unsupported' },
        ]);
        await page.getByRole('button', { name: 'Select summary', exact: true }).click();
        assert.equal(await summary.evaluate((element) => element.selectionStart === 0 && element.selectionEnd === element.value.length), true);
        await page.keyboard.press('h');
        assert.equal(await page.locator('#toggle-highlights').getAttribute('aria-pressed'), 'true', 'typing/copying a summary does not trigger reading shortcuts');
        assert.match(await source.locator('body').innerText(), new RegExp(secret), 'diagnostics do not redact or alter the shared reading file');
        assert.deepEqual(requests, [], 'requesting diagnostics sends nothing');
        await button.click();
        assert.equal(await panel.isVisible(), false);
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
      });
    } finally { await browser.close(); }
  });
}
