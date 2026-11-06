/* MarginPack — original browser export core. MIT License. */
(function (global) {
  'use strict';

  const VERSION = '0.1.2';
  const VIEWER_LICENSE = `MarginPack viewer software only; this notice does not license the source snapshot or annotations.

MIT License

Copyright (c) 2026 feiiiiii5

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const SAFE_TAGS = new Set(('address article aside b bdi bdo blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i ins kbd li main mark nav ol p pre q rp rt ruby s samp section small span strong sub summary sup table tbody td tfoot th thead time tr u ul var').split(' '));
  const DROP_TAGS = new Set(('script style link meta base iframe frame frameset object embed applet template noscript svg math input source track').split(' '));
  const SUPPORTED_TYPES = new Set(['highlight', 'underline', 'note']);
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  function normalizedQuote(value) {
    return value.replace(/\s+/gu, ' ').trim();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function jsonForHTML(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  }

  function safeURL(value, base) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = base ? new URL(value, base) : new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (_) { return null; }
  }

  function textNodes(root) {
    const nodes = [];
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  }

  function embeddedRaster(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 2048) return null;
    const match = /^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value);
    if (!match) return null;
    const encoded = match[2].replace(/\s/g, '');
    if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) return null;
    let bytes;
    try { bytes = global.atob(encoded); } catch (_) { return null; }
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    const format = match[1].toLowerCase();
    const signature = {
      png: () => bytes.slice(0, 8) === '\x89PNG\r\n\x1a\n',
      jpeg: () => bytes.charCodeAt(0) === 0xff && bytes.charCodeAt(1) === 0xd8 && bytes.charCodeAt(2) === 0xff,
      gif: () => bytes.startsWith('GIF87a') || bytes.startsWith('GIF89a'),
      webp: () => bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
    };
    return signature[format]() ? 'data:image/' + format + ';base64,' + encoded : null;
  }

  function slicesFor(root, start, end) {
    const nodes = textNodes(root);
    const length = nodes.reduce((total, node) => total + node.data.length, 0);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > length) {
      return { error: 'Text positions must be a nonempty UTF-16 range within the selected element.' };
    }
    const slices = [];
    let offset = 0;
    const splitsSurrogate = (value, boundary) => {
      const before = value.charCodeAt(boundary - 1), after = value.charCodeAt(boundary);
      return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
    };
    for (const node of nodes) {
      const from = Math.max(0, start - offset);
      const to = Math.min(node.data.length, end - offset);
      if (from < to) {
        if (splitsSurrogate(node.data, from) || splitsSurrogate(node.data, to)) {
          return { error: 'A text position splits a Unicode surrogate pair; no highlight was substituted.' };
        }
        slices.push({ node, from, to });
      }
      offset += node.data.length;
      if (offset >= end) break;
    }
    return { slices, text: slices.map(({ node, from, to }) => node.data.slice(from, to)).join('') };
  }

  function quoteMatches(quote, resolved) {
    const expected = normalizedQuote(quote);
    if (expected === normalizedQuote(resolved.text)) return true;
    // Rendered reader quotations can contain line breaks that are absent from
    // textContent (BRs, paragraphs, table cells). Derive one conservative text
    // representation of this exact range; never search for another location or
    // insert untrusted source nodes into the host document to measure layout.
    const first = resolved.slices[0], last = resolved.slices[resolved.slices.length - 1];
    const range = first.node.ownerDocument.createRange();
    range.setStart(first.node, first.from);
    range.setEnd(last.node, last.to);
    const blocks = new Set(('address article aside blockquote caption dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section table tbody td tfoot th thead tr ul').split(' '));
    function structuralText(node) {
      if (node.nodeType === 3) return node.data;
      if (node.nodeType === 1 && node.localName === 'br') return '\n';
      const content = Array.from(node.childNodes, structuralText).join('');
      return node.nodeType === 1 && blocks.has(node.localName) ? '\n' + content + '\n' : content;
    }
    return expected === normalizedQuote(structuralText(range.cloneContents()));
  }

  function resolvePosition(document, selector) {
    if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
      return { status: 'unsupported', reason: 'Missing or malformed annotation selector.' };
    }
    let root = document.body;
    let range = selector;
    if (selector.type === 'CssSelector') {
      if (typeof selector.value !== 'string' || !selector.value.trim()) return { status: 'unresolved', reason: 'The CSS selector is empty.' };
      let matches;
      try { matches = document.querySelectorAll(selector.value); }
      catch (_) { return { status: 'unresolved', reason: 'The CSS selector is invalid.' }; }
      if (matches.length !== 1) return { status: 'unresolved', reason: matches.length ? 'The CSS selector matches more than one element; no location was guessed.' : 'The CSS selector does not match this snapshot.' };
      root = matches[0];
      range = selector.refinedBy;
      if (!range) {
        const length = textNodes(root).reduce((total, node) => total + node.data.length, 0);
        return slicesFor(root, 0, length);
      }
    }
    if (range.type !== 'TextPositionSelector') return { status: 'unsupported', reason: 'This selector type or refinement is not supported.' };
    if (range.refinedBy) return { status: 'unsupported', reason: 'Additional selector refinements are not supported.' };
    return slicesFor(root, range.start, range.end);
  }

  function colorName(value) {
    const match = typeof value === 'string' && /^#([0-9a-f]{6})$/i.exec(value);
    return match ? match[1].toLowerCase() : 'ffd966';
  }

  function colorCSS(items) {
    // Only six validated hexadecimal digits enter these selectors or values.
    return [...new Set(items.map((item) => item.color))].map((color) =>
      '.mp-color-' + color + '{background:#' + color + '}' +
      '.mp-underlined-' + color + '{text-decoration:underline;text-decoration-color:#' + color + ';text-decoration-thickness:3px;text-underline-offset:.16em}' +
      '.mp-noted-' + color + '{outline:1px dashed #' + color + ';outline-offset:2px}'
    ).join('');
  }

  function cleanDocument(original, metadata, nonce) {
    const safe = original.implementation.createHTMLDocument('');
    const mapping = new Map();
    const links = [];
    const counts = { removedElements: 0, removedAttributes: 0, omittedMedia: 0, retainedImages: 0 };
    const snapshotURL = safeURL(metadata.url);
    let linkBase = snapshotURL;
    const originalBase = original.querySelector('base[href]');
    const explicitBase = originalBase && safeURL(originalBase.getAttribute('href'), linkBase);
    if (explicitBase) linkBase = explicitBase;

    function readingAttributes(from, to) {
      const language = from.getAttribute('lang');
      if (language !== null && /^(?:[a-z]{1,8}(?:-[a-z0-9]{1,8})*)?$/i.test(language.trim())) {
        to.setAttribute('lang', language.trim());
      }
      const direction = (from.getAttribute('dir') || '').trim().toLowerCase();
      if (['ltr', 'rtl', 'auto'].includes(direction)) to.setAttribute('dir', direction);
    }
    readingAttributes(original.documentElement, safe.documentElement);
    readingAttributes(original.body, safe.body);
    if (original.documentElement.hasAttribute('id')) safe.documentElement.id = original.documentElement.id;
    if (original.body.hasAttribute('id')) safe.body.id = original.body.id;

    function linkDestination(raw) {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const value = raw.trim();
      const href = safeURL(value, linkBase);
      // Fragment-only links remain usable without an original URL. An explicit
      // base pointing at another document must retain its original meaning.
      if (value.startsWith('#') && !snapshotURL && !explicitBase) {
        return { kind: 'local', fragment: value.slice(1) };
      }
      if (href && snapshotURL && href.includes('#')
        && href.split('#')[0] === snapshotURL.split('#')[0]) {
        return { kind: 'local', fragment: href.slice(href.indexOf('#') + 1) };
      }
      return href ? { kind: 'external', href } : null;
    }

    function copy(node, parent) {
      if (node.nodeType === 3) {
        const clone = safe.createTextNode(node.data);
        mapping.set(node, clone);
        parent.appendChild(clone);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.localName.toLowerCase();
      counts.removedAttributes += node.attributes.length;
      if (node.namespaceURI !== HTML_NS || DROP_TAGS.has(tag)) {
        counts.removedElements++;
        return;
      }
      if (['img', 'video', 'audio', 'canvas'].includes(tag)) {
        const raster = tag === 'img' ? embeddedRaster(node.getAttribute('src')) : null;
        if (raster) {
          const image = safe.createElement('img');
          image.src = raster;
          image.alt = node.getAttribute('alt') || '';
          image.className = 'mp-image';
          readingAttributes(node, image);
          parent.appendChild(image);
          counts.retainedImages++;
          return;
        }
        counts.omittedMedia++;
        const placeholder = safe.createElement('span');
        placeholder.className = 'mp-omitted-media';
        const description = tag === 'img' ? (node.getAttribute('alt') || '').trim() : tag;
        placeholder.textContent = description ? '[Media omitted: ' + description + ']' : '[Media omitted]';
        parent.appendChild(placeholder);
        return;
      }
      if (tag === 'a') {
        const span = safe.createElement('span');
        if (node.hasAttribute('id')) span.id = node.getAttribute('id');
        if (node.hasAttribute('name')) span.setAttribute('data-anchor-name', node.getAttribute('name'));
        readingAttributes(node, span);
        const destination = linkDestination(node.getAttribute('href'));
        if (destination) {
          span.className = 'mp-source-link';
          span.setAttribute('data-source-link', String(links.length));
          span.setAttribute('role', 'link');
          span.setAttribute('tabindex', '0');
          if (destination.kind === 'external') span.setAttribute('aria-label', 'Preview external link');
          links.push(destination);
        }
        parent.appendChild(span);
        for (const child of Array.from(node.childNodes)) copy(child, span);
        return;
      }
      if (!SAFE_TAGS.has(tag)) {
        counts.removedElements++;
        for (const child of Array.from(node.childNodes)) copy(child, parent);
        return;
      }
      const element = safe.createElement(tag);
      if (node.hasAttribute('id')) element.id = node.getAttribute('id');
      readingAttributes(node, element);
      // HTML parsing consumes one newline immediately after <pre>. The source
      // was already parsed once, so a comment prevents a second consumption.
      if (tag === 'pre') element.appendChild(safe.createComment('marginpack-preserve-whitespace'));
      if (tag === 'details') element.setAttribute('open', '');
      if ((tag === 'td' || tag === 'th')) {
        for (const name of ['colspan', 'rowspan']) {
          const value = node.getAttribute(name);
          if (value && /^[1-9]\d{0,2}$/.test(value)) element.setAttribute(name, value);
        }
      }
      parent.appendChild(element);
      for (const child of Array.from(node.childNodes)) copy(child, element);
    }
    for (const child of Array.from(original.body.childNodes)) copy(child, safe.body);
    return { safe, mapping, links, counts, nonce };
  }

  function applyHighlights(cleaned, items) {
    const rangesByNode = new Map();
    for (const item of items) {
      if (item.status !== 'matched') continue;
      if (item.slices.some(({ node }) => !cleaned.mapping.has(node))) {
        item.status = 'unresolved';
        item.reason = 'The selected text includes content omitted during safety cleanup; no partial highlight was substituted.';
        continue;
      }
      for (const slice of item.slices) {
        const target = cleaned.mapping.get(slice.node);
        if (!rangesByNode.has(target)) rangesByNode.set(target, []);
        rangesByNode.get(target).push({ from: slice.from, to: slice.to, index: item.index });
      }
    }
    for (const [node, ranges] of rangesByNode) {
      const boundaries = [...new Set([0, node.data.length, ...ranges.flatMap(({ from, to }) => [from, to])])].sort((a, b) => a - b);
      const fragment = node.ownerDocument.createDocumentFragment();
      for (let offset = 0; offset < boundaries.length - 1; offset++) {
        const from = boundaries[offset], to = boundaries[offset + 1];
        const active = ranges.filter((range) => range.from < to && range.to > from).map((range) => range.index);
        const text = node.data.slice(from, to);
        if (!active.length) { fragment.appendChild(node.ownerDocument.createTextNode(text)); continue; }
        const mark = node.ownerDocument.createElement('mark');
        const primary = items[active[0]];
        mark.className = 'mp-highlight mp-color-' + primary.color + ' mp-type-' + primary.type;
        const underline = active.find((index) => items[index].type === 'underline');
        const note = active.find((index) => items[index].type === 'note');
        if (underline !== undefined) mark.classList.add('mp-underlined-' + items[underline].color);
        if (note !== undefined) mark.classList.add('mp-noted-' + items[note].color);
        if (active.length > 1) mark.classList.add('mp-overlap');
        mark.setAttribute('data-annotation-id', items[active[0]].id);
        mark.setAttribute('data-annotation-ids', JSON.stringify(active.map((index) => items[index].id)));
        mark.setAttribute('data-annotation-indices', active.join(' '));
        mark.setAttribute('data-annotation-type', primary.type);
        mark.setAttribute('data-annotation-types', [...new Set(active.map((index) => items[index].type))].join(' '));
        mark.setAttribute('role', 'button');
        mark.setAttribute('tabindex', '0');
        mark.setAttribute('aria-label', 'Show annotation' + (active.length > 1 ? 's ' : ' ') + active.map((index) => index + 1).join(', '));
        mark.textContent = text;
        fragment.appendChild(mark);
      }
      node.replaceWith(fragment);
    }
  }

  const SOURCE_CSS = `
    :root{color-scheme:light;font-family:Georgia,"Times New Roman",serif;color:#263443;background:#fffefa;line-height:1.8;font-size:18px}*{box-sizing:border-box}body{margin:0;padding:48px clamp(22px,6vw,76px) 100px;overflow-wrap:anywhere}body> :first-child{margin-top:0}main,article,section{max-width:78ch;margin-inline:auto}p,ul,ol,blockquote,pre,figure{margin-block:1.2em}h1,h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;line-height:1.3;color:#172d3e;margin-top:1.8em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}blockquote{border-left:3px solid #cbd4d4;margin-left:0;padding-left:1.3em;color:#50636b}pre,code,kbd,samp{font-family:ui-monospace,monospace;font-size:.86em}pre{padding:18px;background:#f0f3f3;white-space:pre-wrap}table{border-collapse:collapse;max-width:100%;font-size:.9em}td,th{border:1px solid #d6dfe0;padding:8px 12px}hr{border:0;border-top:1px solid #d6dfe0;margin-block:2em}.mp-highlight{color:inherit;padding:2px 0;border-radius:2px;cursor:pointer;box-decoration-break:clone;-webkit-box-decoration-break:clone}.mp-color-yellow{background:#fff0ad}.mp-color-red{background:#ffd1d1}.mp-color-green{background:#c8eed7}.mp-color-blue{background:#cce6ff}.mp-color-purple{background:#e0d2f6}.mp-color-gray{background:#e0e6ea}.mp-overlap{border-bottom:3px double #657984}.mp-highlight[data-active="true"]{outline:2px solid #176d74;outline-offset:3px}.mp-highlight:focus-visible,.mp-source-link:focus-visible{outline:3px solid #176d74;outline-offset:3px}.mp-highlights-off .mp-highlight{background:transparent;border-bottom:0}.mp-source-link{color:#176d74;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.mp-source-link::after{content:" ↗";font-size:.75em}.mp-omitted-media{display:block;font-family:system-ui,sans-serif;font-size:.78em;background:#eef2f2;color:#586d75;padding:10px 14px;border:1px dashed #c4d0d2;margin-block:1em}summary{font-family:system-ui,sans-serif}details{margin-block:1em}@media(max-width:600px){body{padding:28px 22px 60px;font-size:17px}}
  `;

  const TYPE_CSS = '.mp-highlight.mp-type-underline,.mp-highlight.mp-type-note{background:transparent}.mp-highlight.mp-type-underline{border-bottom:0}.mp-highlights-off .mp-highlight{background:transparent!important;border-bottom:0!important;text-decoration:none!important;outline:none!important;box-shadow:none!important}';

  function sourceHTML(cleaned, nonce, items) {
    const csp = "default-src 'none'; script-src 'none'; style-src 'nonce-" + nonce + "'; img-src data:; media-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    const readingAttributes = (element) => ['id', 'lang', 'dir'].filter((name) => element.hasAttribute(name))
      .map((name) => ' ' + name + '="' + escapeHTML(element.getAttribute(name)) + '"').join('');
    return '<!doctype html><html' + readingAttributes(cleaned.safe.documentElement) + '><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + escapeHTML(csp) + '"><meta name="viewport" content="width=device-width, initial-scale=1"><style nonce="' + nonce + '">' + SOURCE_CSS + colorCSS(items) + TYPE_CSS + '.mp-image{display:block;max-width:100%;height:auto;margin:1.2em auto}</style><title>Snapshot text</title></head><body' + readingAttributes(cleaned.safe.body) + '>' + cleaned.safe.body.innerHTML + '</body></html>';
  }

  const VIEWER_CSS = `
    :root{color-scheme:light;--ink:#19313f;--muted:#637781;--line:#dce4e6;--accent:#176d74;--surface:#f4f7f7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:#eaf0f1;font-size:14px}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:default;opacity:.55}button,a,input,select,summary{outline-offset:3px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #30909b}.topbar{height:74px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid var(--line);gap:18px}.brand{display:flex;align-items:center;gap:11px}.brand-symbol{display:grid;place-items:center;width:35px;height:39px;background:var(--accent);color:white;border-radius:8px 8px 8px 2px;font-family:Georgia,serif;font-size:25px;font-weight:bold}.brand strong{display:block;font-size:18px;letter-spacing:-.5px}.brand small{color:var(--muted);font-size:11px}.pill{border:1px solid #c3d7d9;border-radius:30px;padding:6px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);white-space:nowrap}.app{display:grid;grid-template-columns:minmax(0,1fr) 370px;max-width:1700px;margin:0 auto;height:calc(100vh - 74px);height:calc(100dvh - 74px)}.reading-pane{min-width:0;display:flex;flex-direction:column;padding:24px 24px 0;gap:14px}.document-heading{display:flex;align-items:start;justify-content:space-between;gap:18px;padding:0 4px}.eyebrow{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);font-weight:700}.document-heading h1{font-family:Georgia,serif;font-size:clamp(22px,2.3vw,32px);line-height:1.2;letter-spacing:-.5px;margin:7px 0 9px;overflow-wrap:anywhere}.source-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--muted)}a{color:var(--accent)}.source-meta a{max-width:min(55vw,520px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar-button{background:white;border:1px solid #c4d2d5;color:var(--ink);border-radius:7px;padding:9px 12px;white-space:nowrap;font-size:12px}.toolbar-button:hover{border-color:var(--accent);background:#edf6f6}.reading-note{margin:0;color:#61737d;font-size:11px;line-height:1.6}.frame-wrap{background:#fffefa;border:1px solid #d7e0e2;border-radius:10px 10px 0 0;box-shadow:0 6px 24px #203c4c08;flex:1;min-height:0;overflow:hidden;display:flex}iframe{border:0;width:100%;height:100%;min-height:0;background:#fffefa}.sidebar{background:#f8fafb;border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}.sidebar-header{padding:24px 23px 17px;border-bottom:1px solid var(--line)}.sidebar-header h2{margin:0 0 5px;font-size:17px}.counts{font-size:12px;color:var(--muted);line-height:1.7}.counts strong{color:var(--ink)}.attention{color:#9a511b}.filters{display:flex;gap:7px;margin-top:15px}.filters input{min-width:0;flex:1}.filters input,.filters select{background:#fff;border:1px solid #cad7da;border-radius:6px;padding:8px;color:var(--ink);font-size:11px}.filters select{max-width:130px}.annotations{padding:16px 16px 24px;overflow:auto;flex:1;scroll-padding:18px}.annotation-card{border:1px solid #d9e2e4;background:white;border-radius:9px;padding:15px;margin-bottom:12px;box-shadow:0 2px 4px #21354203}.annotation-card[hidden]{display:none}.annotation-card[aria-current="true"]{border-color:#39858c;box-shadow:0 0 0 2px #cce5e5}.card-top{display:flex;align-items:center;gap:7px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.color-dot{width:9px;height:9px;border-radius:50%;flex:none}.mp-color-yellow{background:#ffd966}.mp-color-red{background:#ff8a8a}.mp-color-green{background:#93d9b0}.mp-color-blue{background:#90c5f8}.mp-color-purple{background:#c2a8ef}.mp-color-gray{background:#b9c3cb}.status{margin-left:auto;font-size:9px;padding:3px 5px;background:#eaf4f2;color:#2d7062;border-radius:3px;letter-spacing:.02em}.status-unresolved,.status-unsupported{background:#fcf0e4;color:#9a511b}.quote{font-family:Georgia,serif;font-size:14px;line-height:1.65;border-left:2px solid #dce5e7;margin:13px 0 0;padding-left:11px;white-space:pre-wrap;overflow-wrap:anywhere}.comment{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0 0;color:#344e5c}.empty-comment{font-style:italic;color:#84929a}.card-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:13px}.jump{color:var(--accent);border:0;background:none;font-size:11px;padding:3px 0}.reason{font-size:11px;line-height:1.6;color:#8a592c;margin:11px 0 0}.tags{font-size:10px;color:var(--muted);overflow-wrap:anywhere}.empty{color:var(--muted);font-size:12px;text-align:center;padding:30px 0;line-height:1.7}.sidebar-footer{padding:13px 22px;border-top:1px solid var(--line);font-size:10px;line-height:1.7;color:var(--muted);background:#f8fafb}.sidebar-footer summary{cursor:pointer;color:var(--ink)}.hash{font-family:ui-monospace,monospace;overflow-wrap:anywhere;margin-top:7px;font-size:10px}.link-preview{background:#eaf4f3;border-bottom:1px solid #c6dfdd;padding:12px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}.link-preview[hidden]{display:none}.link-preview a{overflow-wrap:anywhere;flex:1}.link-preview button{border:0;background:transparent;color:var(--ink);padding:4px}.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}@media(max-width:1000px){.app{grid-template-columns:minmax(0,1fr) 320px}.reading-pane{padding:20px 16px 0}.document-heading{flex-wrap:wrap}.document-heading h1{font-size:25px}.sidebar-header{padding:22px 17px 15px}.source-meta a{max-width:40vw}}@media(max-width:720px){.topbar{height:64px;padding:0 18px}.brand strong{font-size:17px}.app{height:auto;display:block}.reading-pane{padding:22px 14px 0}.document-heading{gap:12px}.source-meta a{max-width:85vw}.frame-wrap{height:65vh;min-height:360px;border-radius:9px}.sidebar{border-left:0;border-top:1px solid var(--line);margin-top:20px}.sidebar-header{padding:22px 20px 16px}.annotations{max-height:none;padding:16px 20px}.sidebar-footer{padding:15px 20px}.pill{font-size:9px}.toolbar-button{padding:8px 10px}.link-preview{padding:12px 18px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  `;

  const DIAGNOSTIC_CSS = '.sidebar-footer{max-height:45%;overflow:auto}.diagnostic-summary{display:block;width:100%;min-height:160px;resize:vertical;border:1px solid #cad7da;border-radius:5px;padding:8px;background:#fff;color:#19313f;font:10px/1.5 ui-monospace,monospace}.diagnostic-summary:focus-visible{outline:3px solid #30909b;outline-offset:3px}';

  function viewerRuntime() {
    'use strict';
    const state = JSON.parse(document.getElementById('marginpack-data').textContent);
    const items = state.items;
    const frame = document.querySelector('[data-marginpack-source]');
    const cards = document.getElementById('annotations');
    const search = document.getElementById('annotation-search');
    const filter = document.getElementById('annotation-filter');
    const toggle = document.getElementById('toggle-highlights');
    const live = document.getElementById('live-status');
    const cardNodes = [];
    let current = -1;
    let highlights = true;
    const make = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    const text = (id, value) => { document.getElementById(id).textContent = value; };
    document.title = state.metadata.title + ' — MarginPack';
    text('snapshot-title', state.metadata.title);
    const sourceURL = document.getElementById('source-url');
    if (state.metadata.url) { sourceURL.href = state.metadata.url; sourceURL.textContent = state.metadata.url; }
    else { sourceURL.hidden = true; text('source-unavailable', 'Source URL unavailable'); }
    text('saved-at', state.metadata.savedAt ? 'Saved ' + state.metadata.savedAt : 'Save time unavailable');
    text('total-count', state.report.total);
    text('matched-count', state.report.matched);
    text('unresolved-count', state.report.unresolved);
    text('unsupported-count', state.report.unsupported);
    text('snapshot-hash', state.report.sourceSha256);
    text('limitations', state.report.limitations.join(' '));
    const diagnosticSummary = document.getElementById('diagnostic-summary');
    const diagnosticButton = document.getElementById('show-diagnostics');
    const diagnosticPanel = document.getElementById('diagnostic-panel');
    diagnosticButton.addEventListener('click', () => {
      diagnosticPanel.hidden = !diagnosticPanel.hidden;
      diagnosticButton.setAttribute('aria-expanded', String(!diagnosticPanel.hidden));
      if (!diagnosticPanel.hidden) {
        // A deliberately small allowlist: never include original content,
        // metadata, source hashes, library/export IDs or selector payloads.
        diagnosticSummary.value = JSON.stringify({
          format: 'marginpack-diagnostic-1', version: state.version,
          counts: { total: state.report.total, matched: state.report.matched,
            unresolved: state.report.unresolved, unsupported: state.report.unsupported },
          annotations: items.map((item, index) => ({ number: index + 1,
            type: ['highlight', 'underline', 'note'].includes(item.type) ? item.type : 'other', status: item.status }))
        }, null, 2);
        diagnosticSummary.focus();
        diagnosticSummary.select();
      }
    });
    document.getElementById('select-diagnostics').addEventListener('click', () => {
      diagnosticSummary.focus(); diagnosticSummary.select();
    });

    function select(index, scrollSource) {
      if (!items[index] || items[index].status !== 'matched') return;
      current = index;
      cardNodes.forEach((card, number) => { if (number === index) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current'); });
      const source = frame.contentDocument;
      if (source) {
        let first = null;
        source.querySelectorAll('.mp-highlight').forEach((mark) => {
          const active = mark.getAttribute('data-annotation-indices').split(' ').includes(String(index));
          if (active) { mark.setAttribute('data-active', 'true'); first = first || mark; }
          else mark.removeAttribute('data-active');
        });
        if (scrollSource && first) first.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      if (cardNodes[index].hidden) { search.value = ''; filter.value = 'all'; applyFilter(); }
      if (!scrollSource) cardNodes[index].scrollIntoView({ block: 'nearest', behavior: 'auto' });
      live.textContent = 'Annotation ' + (index + 1) + ' selected.';
    }

    items.forEach((item, index) => {
      const card = make('article', 'annotation-card');
      card.setAttribute('data-annotation-id', item.id);
      card.setAttribute('data-annotation-index', String(index));
      card.setAttribute('data-status', item.status);
      card.setAttribute('aria-label', 'Annotation ' + (index + 1));
      const top = make('div', 'card-top');
      top.append(make('span', 'color-dot mp-color-' + item.color), make('span', '', String(index + 1).padStart(2, '0') + ' · ' + item.type));
      top.append(make('span', 'status status-' + item.status, item.status));
      card.append(top);
      if (item.text) card.append(make('blockquote', 'quote', item.text));
      if (item.comment) card.append(make('p', 'comment', item.comment));
      else card.append(make('p', 'comment empty-comment', 'No comment'));
      if (item.status !== 'matched') card.append(make('p', 'reason', item.reason));
      const bottom = make('div', 'card-bottom');
      if (item.tags.length) bottom.append(make('span', 'tags', item.tags.map((tag) => '#' + tag).join(' ')));
      if (item.status === 'matched') {
        const jump = make('button', 'jump', 'Jump to text ↗');
        jump.type = 'button';
        jump.setAttribute('aria-label', 'Jump to annotation');
        jump.setAttribute('data-jump-index', String(index));
        jump.addEventListener('click', () => select(index, true));
        bottom.append(jump);
      }
      if (bottom.childNodes.length) card.append(bottom);
      cards.append(card);
      cardNodes.push(card);
    });

    function applyFilter() {
      const needle = search.value.toLocaleLowerCase();
      let visible = 0;
      items.forEach((item, index) => {
        const matches = (filter.value === 'all' || filter.value === item.status) && [item.text, item.comment, item.id, ...item.tags].join(' ').toLocaleLowerCase().includes(needle);
        cardNodes[index].hidden = !matches;
        if (matches) visible++;
      });
      document.getElementById('no-annotations').hidden = visible !== 0;
      text('no-annotations', items.length ? 'No annotations match this filter.' : 'This snapshot has no annotations.');
      live.textContent = visible + ' annotations shown.';
    }
    search.addEventListener('input', applyFilter);
    filter.addEventListener('change', applyFilter);
    applyFilter();

    function toggleHighlights() {
      highlights = !highlights;
      if (frame.contentDocument) frame.contentDocument.body.classList.toggle('mp-highlights-off', !highlights);
      toggle.setAttribute('aria-pressed', String(highlights));
      toggle.textContent = highlights ? 'Hide highlights' : 'Show highlights';
      live.textContent = highlights ? 'Highlights shown.' : 'Highlights hidden.';
    }
    toggle.addEventListener('click', toggleHighlights);
    const linkPreview = document.getElementById('link-preview');
    const navigationStatus = document.getElementById('navigation-status');
    let previewOrigin = null;
    function closeLinkPreview() {
      const wasOpen = !linkPreview.hidden;
      linkPreview.hidden = true;
      if (wasOpen && previewOrigin?.isConnected) previewOrigin.focus({ preventScroll: true });
      previewOrigin = null;
    }
    document.getElementById('close-link').addEventListener('click', closeLinkPreview);

    function keyControls(event) {
      if (event.key === 'Escape') closeLinkPreview();
      if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === 'h') { event.preventDefault(); toggleHighlights(); }
      if (event.key === '[' || event.key === ']') {
        const matched = items.map((item, index) => item.status === 'matched' ? index : -1).filter((index) => index >= 0);
        if (!matched.length) return;
        const position = matched.indexOf(current);
        const next = event.key === ']' ? (position + 1) % matched.length : (position <= 0 ? matched.length - 1 : position - 1);
        event.preventDefault();
        select(matched[next], true);
      }
    }
    document.addEventListener('keydown', keyControls);
    frame.addEventListener('load', () => {
      const source = frame.contentDocument;
      if (!source) { live.textContent = 'The isolated snapshot could not be opened in this browser.'; return; }
      source.body.classList.toggle('mp-highlights-off', !highlights);
      source.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.mp-highlight,[data-source-link]')) {
          event.preventDefault(); event.target.closest('.mp-highlight,[data-source-link]').click(); return;
        }
        keyControls(event);
      });
      source.addEventListener('click', (event) => {
        const mark = event.target.closest('.mp-highlight');
        if (mark) {
          const indices = mark.getAttribute('data-annotation-indices').split(' ').map(Number);
          const next = indices[(indices.indexOf(current) + 1) % indices.length];
          select(next, false);
          return;
        }
        const link = event.target.closest('[data-source-link]');
        if (link) {
          const destination = state.links[Number(link.getAttribute('data-source-link'))];
          if (!destination) return;
          navigationStatus.hidden = true;
          if (destination.kind === 'local') {
            previewOrigin = null;
            closeLinkPreview();
            let fragment = destination.fragment;
            try { fragment = decodeURIComponent(fragment); } catch (_) { /* Keep a literal malformed escape. */ }
            const target = fragment === '' ? source.body : source.getElementById(fragment)
              || Array.from(source.querySelectorAll('[data-anchor-name]')).find((element) => element.getAttribute('data-anchor-name') === fragment)
              || (fragment.toLowerCase() === 'top' ? source.body : null);
            if (!target) {
              const message = 'The link target is unavailable in this saved snapshot.';
              navigationStatus.textContent = message;
              navigationStatus.hidden = false;
              live.textContent = message;
              return;
            }
            target.scrollIntoView({ block: 'start', behavior: 'auto' });
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
            live.textContent = 'Moved to the linked section in this saved snapshot.';
            return;
          }
          if (destination.kind !== 'external') return;
          const action = document.getElementById('external-link');
          action.href = destination.href;
          action.textContent = 'Open external link: ' + destination.href;
          previewOrigin = link;
          linkPreview.hidden = false;
          action.focus();
        }
      });
      if (current >= 0) select(current, false);
    });
    frame.srcdoc = state.sourceHTML;
  }

  function viewerHTML(state, nonce) {
    const csp = "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; frame-src 'self' about:; img-src data:; media-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    return `<!doctype html>
<!--
${VIEWER_LICENSE}
-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHTML(csp)}"><meta name="referrer" content="no-referrer"><title>MarginPack offline reader</title><style nonce="${nonce}">${VIEWER_CSS}${DIAGNOSTIC_CSS}${colorCSS(state.items)}</style></head>
<body><header class="topbar"><div class="brand"><span class="brand-symbol" aria-hidden="true">M</span><div><strong>MarginPack</strong><small>Your reading, kept together.</small></div></div><span class="pill">Offline · Read only</span></header>
<div id="link-preview" class="link-preview" hidden><span>Snapshot link</span><a id="external-link" target="_blank" rel="noopener noreferrer">Open external link</a><button id="close-link" type="button" aria-label="Close link preview">Close ×</button></div>
<div id="navigation-status" class="link-preview" hidden></div>
<main class="app"><section class="reading-pane" aria-label="Snapshot"><div class="document-heading"><div><div class="eyebrow">Saved snapshot</div><h1 id="snapshot-title"></h1><div class="source-meta"><a id="source-url" target="_blank" rel="noopener noreferrer"></a><span id="source-unavailable"></span><span id="saved-at"></span></div></div><button id="toggle-highlights" class="toolbar-button" type="button" aria-label="Toggle highlights" aria-pressed="true" title="Keyboard shortcut: H">Hide highlights</button></div><p class="reading-note">Readable text view · Original styling and remote media omitted. Select a highlight to read its annotation.</p><div class="frame-wrap"><iframe data-marginpack-source title="Isolated snapshot text" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe></div></section>
<aside class="sidebar" aria-label="Annotations"><div class="sidebar-header"><h2>Annotations <span id="total-count"></span></h2><div class="counts"><strong id="matched-count"></strong> located · <span class="attention"><span id="unresolved-count"></span> unresolved · <span id="unsupported-count"></span> unsupported</span></div><div class="filters"><label class="sr-only" for="annotation-search">Search annotations</label><input id="annotation-search" type="search" placeholder="Search notes & quotes"><label class="sr-only" for="annotation-filter">Filter annotations</label><select id="annotation-filter"><option value="all">All annotations</option><option value="matched">Located</option><option value="unresolved">Unresolved</option><option value="unsupported">Unsupported</option></select></div></div><div id="annotations" class="annotations"><p id="no-annotations" class="empty" hidden></p></div><footer class="sidebar-footer"><details><summary>Export details & limitations</summary><p id="limitations"></p><p>Keyboard: H toggles highlights. [ and ] move between located annotations. Overlapping highlights cycle through their annotations.</p><p>Created with MarginPack ${VERSION}. This export does not certify the source content as complete or safe.</p></details><div>Original snapshot SHA-256</div><div id="snapshot-hash" class="hash"></div><button id="show-diagnostics" type="button" class="jump" aria-expanded="false" aria-controls="diagnostic-panel">Troubleshooting summary</button><div id="diagnostic-panel" hidden><p>Version, counts and status numbers only. Source text, comments, tags, URLs, identifiers and source hash are excluded. Review before posting. Select and copy manually; nothing is sent.</p><label class="sr-only" for="diagnostic-summary">Troubleshooting summary</label><textarea id="diagnostic-summary" class="diagnostic-summary" readonly spellcheck="false"></textarea><button id="select-diagnostics" class="jump" type="button">Select summary</button></div></footer></aside></main><div id="live-status" class="sr-only" role="status" aria-live="polite"></div>
<script nonce="${nonce}" id="marginpack-data" type="application/json">${jsonForHTML(state)}</script><script nonce="${nonce}">(${viewerRuntime.toString()})();</script></body></html>`;
  }

  async function exportSnapshot(options) {
    if (!options || typeof options.html !== 'string') throw new TypeError('html must be the original snapshot string.');
    if (!Array.isArray(options.annotations)) throw new TypeError('annotations must be an array.');
    if (!global.crypto || !global.crypto.subtle) throw new Error('Web Crypto is required to hash the original snapshot.');
    const html = options.html;
    const original = new DOMParser().parseFromString(html, 'text/html');
    const suppliedMetadata = options.metadata && typeof options.metadata === 'object' ? options.metadata : {};
    const metadata = {
      title: typeof suppliedMetadata.title === 'string' && suppliedMetadata.title.trim() ? suppliedMetadata.title : (original.title.trim() || 'Untitled snapshot'),
      url: safeURL(suppliedMetadata.url),
      savedAt: typeof suppliedMetadata.savedAt === 'string' ? suppliedMetadata.savedAt : ''
    };
    const digest = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
    const sourceSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const nonceBytes = new Uint8Array(18);
    global.crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const items = Array.from(options.annotations, (annotation, index) => {
      const valid = annotation && typeof annotation === 'object' && !Array.isArray(annotation);
      const data = valid ? annotation : {};
      const item = {
        index,
        id: typeof data.id === 'string' && data.id ? data.id : 'annotation-' + (index + 1),
        type: typeof data.type === 'string' ? data.type : 'unknown',
        color: colorName(data.color),
        text: typeof data.text === 'string' ? data.text : '',
        comment: typeof data.comment === 'string' ? data.comment : '',
        tags: Array.isArray(data.tags) ? data.tags.map((tag) => typeof tag === 'string' ? tag : tag && typeof tag.name === 'string' ? tag.name : '').filter(Boolean) : [],
        status: 'unsupported', reason: '', slices: []
      };
      if (!valid) { item.reason = 'Malformed annotation item; original array position retained.'; return item; }
      if (!SUPPORTED_TYPES.has(item.type)) { item.reason = 'Annotation type “' + item.type + '” is not supported for text highlighting.'; return item; }
      let position = data.position;
      if (typeof position === 'string') {
        try { position = JSON.parse(position); }
        catch (_) { item.status = 'unresolved'; item.reason = 'The annotation position is not valid JSON.'; return item; }
      }
      const result = resolvePosition(original, position);
      if (!result.slices) {
        item.status = result.status || 'unresolved';
        item.reason = result.reason || result.error;
        return item;
      }
      if (item.text && !quoteMatches(item.text, result)) {
        item.status = 'unresolved'; item.reason = 'The quote differs from the selected snapshot text; no relocation was attempted.'; return item;
      }
      item.status = 'matched';
      item.reason = item.text ? 'Selected text verified against the quote (whitespace and semantic line breaks normalized).' : 'Selector resolved; no quote was available to verify.';
      item.slices = result.slices;
      return item;
    });
    const cleaned = cleanDocument(original, metadata, nonce);
    applyHighlights(cleaned, items);
    const report = {
      total: items.length,
      matched: items.filter((item) => item.status === 'matched').length,
      unresolved: items.filter((item) => item.status === 'unresolved').length,
      unsupported: items.filter((item) => item.status === 'unsupported').length,
      annotations: items.map(({ id, type, status, reason }) => ({ id, type, status, reason })),
      sourceSha256,
      limitations: [
        'Original page styling, scripts, forms and embedded content are omitted; textual structure is retained where supported.',
        'Embedded base64 PNG, JPEG, GIF and WebP images with recognized file headers are retained up to 10 MiB per image. Other media is omitted.',
        'Automatic network access is blocked. External links require an explicit preview and open action.',
        'Locations use original DOM UTF-16 offsets. Quote comparisons normalize whitespace and semantic HTML line breaks, without emulating original CSS layout; unresolved content is never relocated.',
        'A matched selector without an available quote cannot independently verify that the source text is unchanged.'
      ],
      sanitation: { ...cleaned.counts }
    };
    const state = { version: VERSION, metadata, report, links: cleaned.links, sourceHTML: sourceHTML(cleaned, nonce, items), items: items.map(({ slices, ...item }) => item) };
    return { html: viewerHTML(state, nonce), report };
  }

  global.MarginPack = Object.freeze({ version: VERSION, exportSnapshot });
})(globalThis);
