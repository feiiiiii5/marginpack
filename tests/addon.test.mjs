import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const adapterSource = await readFile(new URL('../addon/bootstrap.js', import.meta.url), 'utf8');

function loadAdapter() {
  const scope = { TextDecoder, TextEncoder };
  vm.runInNewContext(adapterSource, scope, { filename: 'addon/bootstrap.js' });
  return scope.MarginPackAddon;
}

class MenuNode {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
}

function mockWindow(selected) {
  const tools = new MenuNode('menu_ToolsPopup');
  const context = new MenuNode('zotero-itemmenu');
  // An unrelated extension's menu item must survive MarginPack shutdown.
  tools.appendChild(new MenuNode('another-extension'));
  return {
    closed: false,
    URL,
    TextDecoder,
    ZoteroPane: { getSelectedItems: () => selected },
    document: {
      getElementById(id) { return [tools, context].find((node) => node.id === id) || null; },
      createXULElement() { return new MenuNode(); },
    },
    tools,
    context,
  };
}

function attachment(options = {}) {
  const fields = { title: 'Synthetic notebook', url: 'https://example.test/notebook', dateAdded: '2026-11-06 05:00:00', ...options.fields };
  return {
    isAttachment: () => true,
    isFileAttachment: () => true,
    attachmentContentType: options.contentType || 'text/html',
    getField: (name) => fields[name],
    getFilePathAsync: async () => '/synthetic/library/source.html',
    getAnnotations: () => options.annotations || [{ fixture: 1 }],
    saveTx() { throw new Error('The source attachment must never be saved'); },
    eraseTx() { throw new Error('The source attachment must never be erased'); },
  };
}

function harness(options = {}) {
  const api = loadAdapter();
  const source = options.source || '<!doctype html><html><body>Synthetic saved page.</body></html>';
  const snapshot = options.snapshot || attachment();
  const window = mockWindow(options.selected || [snapshot]);
  const windows = [window];
  const calls = { reads: [], writes: [], converted: [], alerts: [], pickers: [], loads: [] };
  const annotation = { key: 'PRIVATE-ITEM-KEY', libraryID: 999, authorName: 'Private fixture author',
    type: 'highlight', color: '#ffd400', text: 'Synthetic saved page.', comment: 'Synthetic comment.',
    position: { type: 'CssSelector', value: 'body' }, tags: [{ name: 'test-tag' }] };
  const zotero = {
    Items: { getAsync: async () => options.children || [] },
    File: { getContentsAsync: async (path) => { calls.reads.push(path); return source.replace(/^\uFEFF/, ''); } },
    Annotations: { toJSON: options.toJSON || (async () => annotation) },
    Date: { sqlToISO8601: () => '2026-11-06T05:00:00Z' },
    getMainWindows: () => windows,
  };
  const output = { html: '<!doctype html><html><body>Standalone result.</body></html>',
    report: { total: 1, matched: 1, unresolved: 0, unsupported: 0 } };
  const services = {
    prompt: { alert: (_window, _title, message) => calls.alerts.push(message) },
    scriptloader: { loadSubScript(uri, target) {
      calls.loads.push(uri);
      target.MarginPack = { exportSnapshot: options.exportSnapshot || (async (input) => { calls.converted.push(input); return output; }) };
    } },
  };
  class FilePicker {
    constructor() {
      this.modeSave = 1;
      this.returnOK = 0;
      this.returnCancel = 1;
      this.returnReplace = 2;
      this.file = '/synthetic/exports/result.html';
      calls.pickers.push(this);
    }
    init() {}
    appendFilter() {}
    async show() { return options.pickerResult ?? this.returnOK; }
  }
  const chromeUtils = { importESModule: () => ({ FilePicker }) };
  const ioUtils = {
    read: async (path) => { calls.reads.push(path); return options.bytes || new TextEncoder().encode(source); },
    writeUTF8: async (...args) => calls.writes.push(args),
  };
  const controller = api.createController({ zotero, services, chromeUtils, ioUtils });
  controller.start('resource://marginpack/');
  return { api, source, snapshot, window, windows, calls, zotero, ioUtils, controller, output };
}

test('snapshot selection requires one exact saved HTML attachment', async () => {
  const api = loadAdapter();
  const html = attachment();
  const pdf = attachment({ contentType: 'application/pdf' });
  const parent = { isRegularItem: () => true, getAttachments: () => [1, 2] };
  const zotero = { Items: { getAsync: async () => [pdf, html] } };
  assert.equal(await api.selectSnapshot(zotero, [html]), html);
  assert.equal(await api.selectSnapshot(zotero, [parent]), html);
  await assert.rejects(api.selectSnapshot(zotero, []), /Select one/);
  await assert.rejects(api.selectSnapshot(zotero, [html, pdf]), /Select one/);
  await assert.rejects(api.selectSnapshot(zotero, [pdf]), /not a saved HTML snapshot/);
  zotero.Items.getAsync = async () => [html, attachment()];
  await assert.rejects(api.selectSnapshot(zotero, [parent]), /more than one HTML snapshot/);
  zotero.Items.getAsync = async () => [];
  await assert.rejects(api.selectSnapshot(zotero, [parent]), /no saved HTML snapshot/);
});

test('adapter exports only allowed annotation data and writes a new chosen file', async () => {
  const fixture = harness();
  try {
    const result = await fixture.controller.exportSelected(fixture.window);
    assert.equal(result.status, 'saved');
    assert.equal(fixture.calls.converted.length, 1);
    const input = fixture.calls.converted[0];
    assert.equal(input.html, fixture.source);
    assert.equal(input.annotations.length, 1);
    assert.equal(input.annotations[0].id, 'annotation-1');
    assert.equal(input.annotations[0].comment, 'Synthetic comment.');
    assert.equal(input.annotations[0].key, undefined);
    assert.equal(input.annotations[0].libraryID, undefined);
    assert.equal(input.annotations[0].authorName, undefined);
    assert.ok(!JSON.stringify(input).includes('/synthetic/library/'), 'local source path is not exported');
    assert.ok(fixture.calls.reads.length >= 1);
    assert.ok(fixture.calls.reads.every((path) => path === '/synthetic/library/source.html'));
    assert.equal(fixture.calls.writes.length, 1);
    assert.equal(fixture.calls.writes[0][0], '/synthetic/exports/result.html');
    assert.equal(fixture.calls.writes[0][1], fixture.output.html);
    assert.equal(fixture.calls.writes[0][2].mode, 'create', 'existing files cannot be overwritten');
    assert.match(fixture.calls.alerts.at(-1), /1 annotations: 1 matched, 0 unresolved, 0 unsupported/);
  } finally { fixture.controller.stop(); }
});

test('cancel or replacement selection leaves the source and filesystem unchanged', async () => {
  for (const pickerResult of [1, 2]) {
    const fixture = harness({ pickerResult });
    try {
      const result = await fixture.controller.exportSelected(fixture.window);
      assert.equal(result.status, 'cancelled');
      assert.equal(fixture.calls.writes.length, 0);
      assert.equal(fixture.window.tools.children.find((node) => node.id === 'marginpack-tools-export').disabled, false);
    } finally { fixture.controller.stop(); }
  }
});

test('annotation conversion failure refuses partial output before showing a save dialog', async () => {
  const fixture = harness({ toJSON: async () => { throw new Error('Synthetic conversion failure'); } });
  try {
    assert.equal((await fixture.controller.exportSelected(fixture.window)).status, 'error');
    assert.equal(fixture.calls.converted.length, 0);
    assert.equal(fixture.calls.pickers.length, 0);
    assert.equal(fixture.calls.writes.length, 0);
    assert.match(fixture.calls.alerts[0], /annotation could not be read/);
  } finally { fixture.controller.stop(); }
});

test('menu lifecycle covers existing and new windows without duplicate or leftover controls', async () => {
  const fixture = harness();
  const second = mockWindow([fixture.snapshot]);
  fixture.controller.addWindow(second);
  fixture.controller.addWindow(second);
  fixture.controller.start('resource://unused-second-start/');
  assert.equal(fixture.window.tools.children.length, 2);
  assert.equal(second.tools.children.length, 2);
  assert.equal(second.context.children.length, 1);
  const previous = { existingExporter: true };
  fixture.window.MarginPack = previous;
  await fixture.controller.exportSelected(fixture.window);
  assert.notEqual(fixture.window.MarginPack, previous);
  fixture.controller.removeWindow(second);
  assert.deepEqual(second.tools.children.map((node) => node.id), ['another-extension']);
  assert.equal(second.context.children.length, 0);
  assert.equal([...second.context.listeners.values()].every((listeners) => listeners.size === 0), true);
  fixture.controller.stop();
  assert.deepEqual(fixture.window.tools.children.map((node) => node.id), ['another-extension']);
  assert.equal(fixture.window.context.children.length, 0);
  assert.equal(fixture.window.MarginPack, previous, 'shutdown restores a pre-existing window property');
});

test('shutdown during conversion cancels the operation before a dialog or write', async () => {
  let complete;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const pendingOutput = new Promise((resolve) => { complete = resolve; });
  const fixture = harness({ exportSnapshot: async () => { started(); return pendingOutput; } });
  const pending = fixture.controller.exportSelected(fixture.window);
  await ready;
  assert.equal((await fixture.controller.exportSelected(fixture.window)).status, 'busy');
  fixture.controller.stop();
  complete(fixture.output);
  assert.equal((await pending).status, 'cancelled');
  assert.equal(fixture.calls.pickers.length, 0);
  assert.equal(fixture.calls.writes.length, 0);
});

test('source metadata cannot accidentally reveal local paths or URL credentials', async () => {
  const snapshot = attachment({ fields: {
    title: '/synthetic/private/library/source.html', url: 'https://username:password@example.test/notebook',
  } });
  const fixture = harness({ snapshot });
  try {
    await fixture.controller.exportSelected(fixture.window);
    const serialized = JSON.stringify(fixture.calls.converted[0].metadata);
    assert.ok(!serialized.includes('/synthetic/private'));
    assert.ok(!serialized.includes('username'));
    assert.ok(!serialized.includes('password'));
    assert.equal(fixture.calls.converted[0].metadata.url, 'https://example.test/notebook');
  } finally { fixture.controller.stop(); }
});

test('a UTF-8 BOM is preserved for source hashing rather than silently stripped', async () => {
  const source = '\uFEFF<!doctype html><html><body>Original BOM fixture.</body></html>';
  const fixture = harness({ source });
  try {
    assert.equal((await fixture.controller.exportSelected(fixture.window)).status, 'saved');
    assert.equal(fixture.calls.converted[0].html, source);
    assert.equal(fixture.calls.converted[0].html.charCodeAt(0), 0xFEFF);
  } finally { fixture.controller.stop(); }
});

test('invalid UTF-8 or a snapshot changed during reading cannot produce a misleading source hash', async () => {
  for (const bytes of [Uint8Array.from([0xC3, 0x28]), new TextEncoder().encode('<html>Changed after text read.</html>')]) {
    const fixture = harness({ bytes });
    try {
      assert.equal((await fixture.controller.exportSelected(fixture.window)).status, 'error');
      assert.equal(fixture.calls.converted.length, 0);
      assert.equal(fixture.calls.pickers.length, 0);
      assert.equal(fixture.calls.writes.length, 0);
    } finally { fixture.controller.stop(); }
  }
});
