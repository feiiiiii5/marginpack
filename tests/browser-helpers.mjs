import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

export const productRoot = fileURLToPath(new URL('../', import.meta.url));
export const corePath = path.join(productRoot, 'src/marginpack.js');
export const engines = { chromium, firefox };

export async function launchEngine(name, context) {
  try {
    return await engines[name].launch({ headless: true });
  } catch (error) {
    if (name === 'firefox' && /Executable doesn't exist|browserType\.launch:.*ENOENT/s.test(String(error))) {
      context.skip('Firefox browser executable is not installed; Chromium remains required.');
      return null;
    }
    throw error;
  }
}

export async function withArtifact(browser, input, callback) {
  const outputRoot = path.join(productRoot, 'output');
  await mkdir(outputRoot, { recursive: true });
  const directory = await mkdtemp(path.join(outputRoot, 'browser-test-'));
  let context;
  try {
    const originalPath = path.join(directory, 'original.html');
    const runnerPath = path.join(directory, 'runner.html');
    const artifactPath = path.join(directory, 'export.html');
    await writeFile(originalPath, input.html, 'utf8');
    await writeFile(runnerPath, '<!doctype html><html><body></body></html>', 'utf8');
    context = await browser.newContext();
    const requests = [];
    await context.route(/https?:\/\//, async (route) => {
      requests.push(route.request().url());
      await route.abort();
    });
    const page = await context.newPage();
    // A local blank runner provides Web Crypto without a server or runtime
    // dependency in the generated file.
    await page.goto(pathToFileURL(runnerPath).href);
    await page.addScriptTag({ path: corePath });
    const sourceBefore = await readFile(originalPath);
    const result = await page.evaluate(async (payload) => {
      const before = JSON.stringify(payload);
      const result = await globalThis.MarginPack.exportSnapshot(payload);
      return { result, inputUnchanged: JSON.stringify(payload) === before };
    }, input);
    assert.equal(result.inputUnchanged, true, 'export must not mutate annotations or metadata');
    assert.deepEqual(await readFile(originalPath), sourceBefore, 'source file must remain byte-for-byte unchanged');
    assert.equal(typeof result.result.html, 'string');
    await writeFile(artifactPath, result.result.html, 'utf8');
    // Open the artifact after the generator page is gone. This catches hidden
    // dependencies on generator state and tests the delivered file:// format.
    await page.close();
    const viewer = await context.newPage();
    await viewer.goto(pathToFileURL(artifactPath).href);
    const sourceElement = viewer.locator('iframe[data-marginpack-source]');
    await sourceElement.waitFor({ state: 'attached' });
    const sourceHandle = await sourceElement.elementHandle();
    const source = await sourceHandle.contentFrame();
    assert.ok(source, 'the export contains an isolated source frame');
    await source.locator('body').waitFor({ state: 'attached' });
    return await callback({ page: viewer, source, requests, report: result.result.report,
      html: result.result.html, sourceElement, artifactPath });
  } finally {
    if (context) await context.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export function card(page, index) {
  return page.locator(`article[data-annotation-index="${index}"]`);
}

export async function markedText(source, index) {
  // A single selected range may span inline nodes and overlap another range.
  // Collect every visible marked segment belonging to its input index.
  return source.locator(`mark[data-annotation-indices~="${index}"]`).evaluateAll(
    (marks) => marks.map((mark) => mark.textContent).join(''),
  );
}
