import assert from 'node:assert/strict';
import { test } from 'node:test';
import { card, launchEngine, markedText, withArtifact } from './browser-helpers.mjs';

// Original examples model quotes produced by rendering a selected DOM range.
// Positions still count the original text nodes' UTF-16 code units; visual
// line breaks must never be added to those offsets or used to relocate a range.
const metadata = { title: 'Original rendered quote examples', url: 'https://example.invalid/rendered-quotes' };
const annotation = (id, value, text, range) => ({
  id, type: 'highlight', text, comment: 'Original regression example: ' + id,
  position: { type: 'CssSelector', value,
    ...(range ? { refinedBy: { type: 'TextPositionSelector', start: range[0], end: range[1] } } : {}) },
});

for (const engine of ['chromium', 'firefox']) {
  test(`${engine}: rendered BR and block boundaries verify without changing DOM offsets`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = '<!doctype html><html><body><p id="line">Alpha<br>Beta</p><section id="blocks"><p>first Alpha</p><p>Beta last</p></section></body></html>';
      const annotations = [
        annotation('line-break', '#line', 'Alpha\nBeta'),
        annotation('partial-blocks', '#blocks', 'Alpha\n\nBeta', [6, 15]),
      ];
      await withArtifact(browser, { html, annotations, metadata }, async ({ page, source, report, requests }) => {
        assert.equal(report.total, 2);
        assert.equal(report.matched, 2, 'valid rendered quotes across BR/block boundaries are located');
        assert.equal(report.unresolved, 0);
        assert.equal(await markedText(source, 0), 'AlphaBeta');
        assert.equal(await markedText(source, 1), 'AlphaBeta', 'only the exact partial range is marked');
        assert.equal(await source.locator('#line br').count(), 1, 'the structural line break is retained');
        assert.equal(await source.locator('#line').innerText(), 'Alpha\nBeta');
        assert.equal(await source.locator('#blocks').textContent(), 'first AlphaBeta last');
        assert.equal(await source.locator('body').textContent(), 'AlphaBetafirst AlphaBeta last', 'comparison does not insert text into the snapshot');
        for (let index = 0; index < annotations.length; index++) {
          assert.equal(await card(page, index).getAttribute('data-status'), 'matched');
        }
        assert.deepEqual(requests, []);
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: rendered quote comparison preserves real inline word boundaries`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = '<!doctype html><html><body><p id="joined">A<span>B</span></p><p id="spaced">A <span>B</span></p><p id="wrapped">Alpha <em>Beta</em> Gamma</p></body></html>';
      const annotations = [
        annotation('joined-valid', '#joined', 'AB'),
        annotation('joined-stale-space', '#joined', 'A B'),
        annotation('space-valid', '#spaced', 'A\nB'),
        annotation('space-stale-joined', '#spaced', 'AB'),
        annotation('inline-valid', '#wrapped', 'Alpha Beta Gamma'),
        annotation('inline-stale', '#wrapped', 'AlphaBeta Gamma'),
      ];
      await withArtifact(browser, { html, annotations, metadata }, async ({ source, report }) => {
        assert.equal(report.total, 6);
        assert.equal(report.matched, 3);
        assert.equal(report.unresolved, 3, 'whitespace cannot be discarded to force a quote match');
        for (const index of [0, 2, 4]) assert.equal(report.annotations[index].status, 'matched');
        for (const index of [1, 3, 5]) {
          assert.equal(report.annotations[index].status, 'unresolved');
          assert.equal(await markedText(source, index), '');
        }
        assert.equal(await markedText(source, 0), 'AB');
        assert.equal(await markedText(source, 2), 'A B');
        assert.equal(await markedText(source, 4), 'Alpha Beta Gamma');
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: line breaks preserve Unicode range boundaries and reject surrogate halves`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const html = '<!doctype html><html><body><p id="unicode">A😀<br>中B</p><pre id="pre">first\n  second</pre></body></html>';
      const annotations = [
        annotation('unicode-valid', '#unicode', '😀\n中', [1, 4]),
        annotation('unicode-half', '#unicode', '', [2, 4]),
        annotation('pre-valid', '#pre', 'first\n  second', [0, 14]),
      ];
      await withArtifact(browser, { html, annotations, metadata }, async ({ source, report }) => {
        assert.equal(report.total, 3);
        assert.equal(report.matched, 2);
        assert.equal(report.unresolved, 1);
        assert.equal(await markedText(source, 0), '😀中');
        assert.equal(report.annotations[1].status, 'unresolved');
        assert.equal(await markedText(source, 1), '');
        assert.equal(await source.locator('#unicode').textContent(), 'A😀中B');
        assert.equal(await markedText(source, 2), 'first\n  second');
        assert.equal(await source.locator('#pre').textContent(), 'first\n  second');
      });
    } finally { await browser.close(); }
  });
}
