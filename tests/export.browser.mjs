import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { card, launchEngine, markedText, withArtifact } from './browser-helpers.mjs';
import {
  bodyText, cleanupBodyText, cleanupHtml, hostileAnnotations, hostileComment,
  hostileHtml, metadata, originalPng, readingAnnotations, readingHtml, selectedText,
} from './fixtures/original.mjs';

for (const engine of ['chromium', 'firefox']) {
  test(`${engine}: exact annotation ranges, preservation and unresolved reporting`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const annotations = readingAnnotations();
      await withArtifact(browser, { html: readingHtml, annotations, metadata }, async ({ page, source, report, requests }) => {
        assert.equal(report.total, 7);
        assert.equal(report.matched, 5);
        assert.equal(report.unresolved, 1);
        assert.equal(report.unsupported, 1);
        assert.equal(report.sourceSha256, createHash('sha256').update(readingHtml, 'utf8').digest('hex'));
        assert.equal(report.annotations.length, annotations.length);
        assert.equal(await page.locator('article[data-annotation-index]').count(), annotations.length);
        const summary = await page.locator('.counts').innerText();
        assert.match(summary, /5 located/);
        assert.match(summary, /1 unresolved/);
        assert.match(summary, /1 unsupported/);
        const expected = [selectedText.inline, selectedText.overlapA, selectedText.overlapB, selectedText.whole, selectedText.body];
        for (let index = 0; index < expected.length; index++) {
          assert.equal(await markedText(source, index), expected[index], `annotation ${index} marks its exact original text`);
          assert.equal(await card(page, index).getAttribute('data-status'), 'matched');
          assert.match(await card(page, index).innerText(), new RegExp(annotations[index].comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
        assert.equal(await source.locator('body').textContent(), bodyText, 'marking keeps source text and whitespace intact');
        assert.equal(await markedText(source, 5), '', 'stale quote is never silently relocated');
        assert.equal(await card(page, 5).getAttribute('data-status'), 'unresolved');
        assert.equal(await card(page, 6).getAttribute('data-status'), 'unsupported');
        assert.ok(report.annotations[5].reason, 'unresolved annotation explains the failure');
        assert.ok(report.annotations[6].reason, 'unsupported annotation explains the limitation');
        await page.getByText('Export details & limitations', { exact: true }).click();
        const visible = await page.locator('body').innerText();
        assert.ok(visible.includes(metadata.title));
        assert.ok(visible.includes(metadata.url));
        assert.ok(visible.includes(report.sourceSha256));
        assert.ok(visible.includes('2026'), 'saved time is visible');
        assert.match(visible, /resource|style|media|image/i, 'viewer discloses resource limitations');
        const overlap = source.locator('mark[data-annotation-indices="1 2"]');
        await overlap.click();
        assert.equal(await card(page, 1).getAttribute('aria-current'), 'true');
        await overlap.click();
        assert.equal(await card(page, 2).getAttribute('aria-current'), 'true', 'overlapping notes cycle without losing either note');
        await page.keyboard.press(']');
        assert.equal(await card(page, 3).getAttribute('aria-current'), 'true', 'source-frame keyboard advances to the next located note');
        await page.getByLabel('Filter annotations', { exact: true }).selectOption('unresolved');
        assert.equal(await card(page, 5).isVisible(), true);
        assert.equal(await card(page, 0).isVisible(), false);
        await page.getByLabel('Search annotations', { exact: true }).fill('no synthetic note has this phrase');
        assert.equal(await page.getByText('No annotations match this filter.', { exact: true }).isVisible(), true);
        await page.getByLabel('Search annotations', { exact: true }).fill('');
        await page.getByLabel('Filter annotations', { exact: true }).selectOption('all');
        assert.deepEqual(requests, [], 'opening an offline export must not request external resources');
      });
    } finally {
      await browser.close();
    }
  });

  test(`${engine}: cleanup preserves original CSS selectors and body offsets`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const quote = 'Still the selected paragraph.';
      const start = cleanupBodyText.indexOf(quote);
      const annotations = [
        { id: 'child-selector', type: 'highlight', text: quote,
          position: { type: 'CssSelector', value: 'body > p:nth-child(3)' }, comment: 'Original child index.' },
        { id: 'body-offset', type: 'highlight', text: quote,
          position: { type: 'TextPositionSelector', start, end: start + quote.length }, comment: 'Original body offset.' },
      ];
      await withArtifact(browser, { html: cleanupHtml, annotations, metadata }, async ({ source, report }) => {
        assert.equal(report.matched, 2);
        assert.equal(await markedText(source, 0), quote);
        assert.equal(await markedText(source, 1), quote);
        assert.equal(await source.locator('script').count(), 0);
      });
    } finally {
      await browser.close();
    }
  });

  test(`${engine}: ambiguous, invalid and out-of-bounds selectors stay visible without guessed marks`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const positions = [
        { type: 'CssSelector', value: 'p' },
        { type: 'CssSelector', value: '#absent' },
        { type: 'CssSelector', value: '[' },
        { type: 'TextPositionSelector', start: -1, end: 2 },
        { type: 'TextPositionSelector', start: 0, end: bodyText.length + 1 },
        { type: 'TextPositionSelector', start: 2, end: 2 },
        '{invalid JSON',
        { type: 'TextQuoteSelector', exact: selectedText.whole },
      ];
      const annotations = positions.map((position, index) => ({
        id: `unreliable-${index}`, type: 'highlight', text: '', position, comment: `Unreliable selector ${index}.`,
      }));
      await withArtifact(browser, { html: readingHtml, annotations, metadata }, async ({ page, source, report }) => {
        assert.equal(report.total, positions.length);
        assert.equal(report.matched, 0);
        assert.equal(report.unresolved + report.unsupported, positions.length);
        assert.equal(await source.locator('mark').count(), 0);
        for (let index = 0; index < positions.length; index++) {
          assert.ok(['unresolved', 'unsupported'].includes(report.annotations[index].status));
          assert.ok(report.annotations[index].reason, 'every failed location has an explanation');
          assert.ok((await card(page, index).innerText()).includes(`Unreliable selector ${index}.`));
        }
      });
    } finally { await browser.close(); }
  });

  test(`${engine}: duplicate and malformed IDs retain every input item`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const ids = ['same', 'same', '', null, 42, { unexpected: 'object' }, 'x"><script>globalThis.marginpackInjected=1</script>'];
      const annotations = ids.map((id, index) => ({ id, type: 'highlight', text: selectedText.whole,
        position: { type: 'CssSelector', value: '#whole' }, comment: `Preserved input ${index}.` }));
      const hostileMetadata = { ...metadata, title: hostileComment, url: 'javascript:globalThis.marginpackInjected="metadata"' };
      await withArtifact(browser, { html: readingHtml, annotations, metadata: hostileMetadata }, async ({ page, report }) => {
        assert.equal(report.total, ids.length);
        assert.equal(report.annotations.length, ids.length);
        assert.equal(report.matched + report.unresolved + report.unsupported, ids.length);
        assert.equal(await page.locator('article[data-annotation-index]').count(), ids.length);
        for (let index = 0; index < ids.length; index++) {
          assert.ok((await card(page, index).innerText()).includes(`Preserved input ${index}.`));
        }
        assert.equal(await page.evaluate(() => globalThis.marginpackInjected), undefined);
        assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), hostileComment);
        assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
      });
    } finally {
      await browser.close();
    }
  });

  test(`${engine}: hostile imported HTML stays inert and comments remain plain text`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      await withArtifact(browser, { html: hostileHtml, annotations: hostileAnnotations(), metadata }, async ({ page, source, sourceElement, report, requests }) => {
        assert.equal(report.matched, 1);
        assert.equal(await markedText(source, 0), 'Keep this visible phrase.');
        assert.ok((await card(page, 0).innerText()).includes(hostileComment));
        assert.equal(await card(page, 0).locator('script, img').count(), 0, 'comment markup must render as text');
        assert.equal(await page.evaluate(() => globalThis.marginpackInjected), undefined, 'source/comment code cannot affect viewer');
        assert.equal(await source.evaluate(() => globalThis.marginpackInjected), undefined, 'source scripts and events never execute');
        assert.equal(await source.locator('script, iframe, object, embed, form, base, meta[http-equiv="refresh"]').count(), 0);
        assert.equal(await source.locator('[srcset], [srcdoc], [autoplay]').count(), 0);
        const unsafeAttributes = await source.locator('*').evaluateAll((elements) => elements.flatMap((element) =>
          [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)
            || (/^(?:javascript|vbscript|data):/i.test(attribute.value.trim())
              && !(element.tagName === 'IMG' && attribute.name === 'src'
                && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(attribute.value)))
            || (attribute.name === 'style' && /url\s*\(|@import/i.test(attribute.value)))
            .map((attribute) => `${element.tagName}.${attribute.name}`)));
        assert.deepEqual(unsafeAttributes, []);
        const sourceStyles = await source.locator('style').allTextContents();
        assert.ok(sourceStyles.every((css) => !/@import|url\s*\(/i.test(css)), 'no imported CSS can initiate a fetch');
        assert.equal(await source.locator('img').count(), 1, 'only the valid embedded raster is retained');
        const raster = source.getByAltText('Original red pixel', { exact: true });
        assert.equal(await raster.getAttribute('src'), originalPng);
        assert.equal(await raster.evaluate((image) => image.complete && image.naturalWidth === 1 && image.naturalHeight === 1), true,
          'the original embedded bitmap actually renders offline');
        const sandbox = await sourceElement.getAttribute('sandbox');
        assert.ok(sandbox !== null, 'source document has a sandbox boundary');
        assert.ok(!sandbox.split(/\s+/).includes('allow-scripts'), 'untrusted source cannot run scripts');
        const sourceCsp = await source.locator('meta[http-equiv="Content-Security-Policy" i]').getAttribute('content');
        assert.match(sourceCsp, /script-src\s+'none'/i, 'source also disables scripts through CSP');
        await source.getByText('Keep this visible phrase.', { exact: true }).click();
        await source.getByText('Unsafe link', { exact: true }).click();
        assert.equal(await page.evaluate(() => globalThis.marginpackInjected), undefined, 'click handlers and javascript links remain inert');
        assert.equal(page.context().pages().length, 1, 'hostile content does not open windows');
        assert.equal(await source.getByText('Unsafe link', { exact: true }).getAttribute('href'), null);
        const goodLink = source.getByText('Safe explicit link', { exact: true });
        await goodLink.click();
        const explicitAction = page.getByRole('link', { name: 'Open external link: https://example.test/explicit', exact: true });
        assert.equal(await explicitAction.isVisible(), true, 'safe source links require an explicit viewer action');
        assert.equal(await explicitAction.getAttribute('href'), 'https://example.test/explicit');
        assert.match(await explicitAction.getAttribute('rel') || '', /noopener/);
        assert.deepEqual(requests, [], 'no automatic external request is attempted');
      });
    } finally {
      await browser.close();
    }
  });

  test(`${engine}: highlights, keyboard jump and narrow layout work in the exported file`, async (t) => {
    const browser = await launchEngine(engine, t);
    if (!browser) return;
    try {
      const paragraphs = Array.from({ length: 100 }, (_, index) =>
        `<p>Original context paragraph ${index + 1}: the reader follows a paper kite past the harbor and records the changing wind.</p>`).join('');
      const html = `<!doctype html><html><body><h1>Long notebook</h1>${paragraphs}<p id="destination">The last meaningful annotation.</p></body></html>`;
      const annotations = [{ id: 'destination', type: 'highlight', color: '#ffd400',
        text: 'The last meaningful annotation.', comment: 'Jump here using the keyboard.',
        position: { type: 'CssSelector', value: '#destination' } }];
      await withArtifact(browser, { html, annotations, metadata }, async ({ page, source, report }) => {
        assert.equal(report.matched, 1);
        const toggle = page.getByRole('button', { name: 'Toggle highlights', exact: true });
        const marks = source.locator('mark[data-annotation-indices~="0"]');
        const originalColor = await marks.first().evaluate((mark) => getComputedStyle(mark).backgroundColor);
        await toggle.focus();
        await page.keyboard.press('Enter');
        assert.match(await toggle.innerText(), /show/i, 'keyboard activation visibly changes the toggle state');
        const hiddenColor = await marks.first().evaluate((mark) => getComputedStyle(mark).backgroundColor);
        assert.notEqual(hiddenColor, originalColor, 'hiding highlights changes visible mark styling');
        assert.equal(await markedText(source, 0), annotations[0].text, 'toggle preserves source text');
        await page.keyboard.press('Space');
        assert.match(await toggle.innerText(), /hide/i);
        assert.equal(await marks.first().evaluate((mark) => getComputedStyle(mark).backgroundColor), originalColor);
        assert.equal(await source.evaluate(() => scrollY), 0);
        const jump = card(page, 0).getByRole('button', { name: 'Jump to annotation' });
        await jump.focus();
        await page.keyboard.press('Enter');
        await source.waitForFunction(() => {
          const mark = document.querySelector('mark');
          const bounds = mark.getBoundingClientRect();
          return scrollY > 0 && bounds.top >= -2 && bounds.top < innerHeight;
        });
        await page.setViewportSize({ width: 375, height: 740 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true,
          'narrow viewer does not require horizontal scrolling');
        await card(page, 0).scrollIntoViewIfNeeded();
        assert.equal(await card(page, 0).isVisible(), true, 'annotation remains reachable at phone width');
        assert.equal(await toggle.isVisible(), true, 'highlight control remains available at phone width');
        const frameBounds = await page.locator('iframe[data-marginpack-source]').boundingBox();
        assert.ok(frameBounds.width > 100 && frameBounds.width <= 375, 'source reading area fits the narrow viewport');
      });
    } finally {
      await browser.close();
    }
  });
}
