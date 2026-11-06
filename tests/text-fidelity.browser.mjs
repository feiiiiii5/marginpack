import assert from 'node:assert/strict';
import { test } from 'node:test';
import { card, launchEngine, markedText, withArtifact } from './browser-helpers.mjs';
import { metadata } from './fixtures/original.mjs';

for (const engine of ['chromium', 'firefox']) {
  test(`${engine}: surrogate halves stay unresolved without corrupting source text`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = '<!doctype html><html><body><p id="p">A😀B</p></body></html>';
      const annotations = [[1, 2], [2, 3], [1, 3]].map(([start, end], index) => ({
        id: `surrogate-${index}`, type: 'highlight', text: '', comment: `UTF-16 range ${start}–${end}.`,
        position: { type: 'CssSelector', value: '#p', refinedBy: { type: 'TextPositionSelector', start, end } },
      }));
      await withArtifact(browser, { html, annotations, metadata }, async ({ page, source, report }) => {
        assert.equal(report.total, 3);
        assert.equal(report.matched, 1);
        assert.equal(report.unresolved, 2);
        assert.equal(report.unsupported, 0);
        assert.equal(await source.locator('body').textContent(), 'A😀B', 'export preserves the complete original surrogate pair');
        for (const index of [0, 1]) {
          assert.equal(report.annotations[index].status, 'unresolved');
          assert.ok(report.annotations[index].reason, 'a range splitting a surrogate pair explains why it is unresolved');
          assert.equal(await card(page, index).getAttribute('data-status'), 'unresolved');
          assert.equal(await markedText(source, index), '');
        }
        assert.equal(await markedText(source, 2), '😀', 'the complete UTF-16 pair remains a valid location');
        assert.equal(await card(page, 2).getAttribute('data-status'), 'matched');
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: PRE leading newline survives export parsing with its annotation`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      // The HTML parser consumes the first of these two initial newlines.
      // Exporting and reopening must not consume the remaining one again.
      const html = '<!doctype html><html><body><pre id="pre">\n\nfirst\n  second</pre></body></html>';
      const expected = '\nfirst\n  second';
      const selected = 'first\n  second';
      // Leave the leading newline outside the mark: wrapping it in <mark>
      // would itself prevent the parser bug and hide a missing core fix.
      const annotations = [{ id: 'pre-whitespace', type: 'highlight', text: selected,
        comment: 'Preserve the parsed leading newline and indentation.',
        position: { type: 'CssSelector', value: '#pre',
          refinedBy: { type: 'TextPositionSelector', start: 1, end: expected.length } } }];
      await withArtifact(browser, { html, annotations, metadata }, async ({ page, source, report }) => {
        assert.equal(report.total, 1);
        assert.equal(report.matched, 1);
        assert.equal(report.unresolved, 0);
        assert.equal(await source.locator('pre').textContent(), expected);
        assert.equal(await source.locator('body').textContent(), expected);
        assert.equal(await markedText(source, 0), selected, 'the annotation marks the exact original parsed PRE text');
        assert.equal(await card(page, 0).getAttribute('data-status'), 'matched');
      });
    } finally { await browser.close(); }
  });
}
