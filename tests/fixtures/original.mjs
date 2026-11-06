// Original synthetic pages. These contain no imported articles or library data.
export const leadText = 'Quartz fox 🦊 crosses\t  the\nquiet brook.';
export const overlapText = 'A bright green kite turns above the harbor.';
export const wholeText = 'Keep this exact sentence.';
export const tailText = 'A final note.';
export const bodyText = leadText + overlapText + wholeText + tailText;

export const readingHtml = '<!doctype html><html><head><title>Field notes</title></head><body>'
  + '<main id="reading"><p id="lead">Quartz <em>fox 🦊</em> crosses\t  the\nquiet brook.</p>'
  + `<p id="overlap">${overlapText}</p><p id="whole">${wholeText}</p>`
  + `<p id="tail">${tailText}</p></main></body></html>`;

export const metadata = {
  title: 'Field notes: a tiny offline reading test',
  url: 'https://example.test/field-notes',
  savedAt: '2026-11-06T05:00:00.000Z',
};

function cssRange(value, text, phrase) {
  const start = text.indexOf(phrase);
  if (start < 0) throw new Error('Invalid original fixture phrase');
  return { type: 'CssSelector', value, refinedBy: {
    type: 'TextPositionSelector', start, end: start + phrase.length,
  } };
}

export const selectedText = {
  inline: 'fox 🦊 crosses\t  the\nquiet',
  overlapA: 'bright green',
  overlapB: 'green kite turns',
  whole: wholeText,
  body: 'final note',
};

export function readingAnnotations() {
  const bodyStart = bodyText.indexOf(selectedText.body);
  return [
    { id: 'inline', type: 'highlight', color: '#ffd400', text: selectedText.inline,
      position: cssRange('#lead', leadText, selectedText.inline),
      comment: 'An inline phrase with an astral character and exact whitespace.', tags: ['range'] },
    { id: 'overlap-a', type: 'highlight', color: '#ff6666', text: selectedText.overlapA,
      position: cssRange('#overlap', overlapText, selectedText.overlapA), comment: 'First overlapping note.' },
    { id: 'overlap-b', type: 'highlight', color: '#5fb236', text: selectedText.overlapB,
      position: JSON.stringify(cssRange('#overlap', overlapText, selectedText.overlapB)),
      comment: 'Second overlapping note; its selector is serialized.' },
    { id: 'whole', type: 'highlight', color: '#2ea8e5', text: selectedText.whole,
      position: { type: 'CssSelector', value: '#whole' }, comment: 'A complete element.' },
    { id: 'body', type: 'highlight', color: '#a28ae5', text: selectedText.body,
      position: { type: 'TextPositionSelector', start: bodyStart, end: bodyStart + selectedText.body.length },
      comment: 'Body-relative offsets.' },
    { id: 'stale', type: 'highlight', color: '#ffd400', text: 'An older sentence that is absent.',
      position: { type: 'CssSelector', value: '#whole' }, comment: 'Keep this unresolved instead of guessing.' },
    { id: 'unsupported', type: 'ink', text: 'A drawing', position: { type: 'CssSelector', value: '#whole' },
      comment: 'An unsupported drawing must remain visible.' },
  ];
}

export const hostileComment = '</script><script>globalThis.marginpackInjected = "comment"</script>'
  + '<img src="https://attack.invalid/comment" onerror="globalThis.marginpackInjected=\'comment-image\'">';

// Generated for this fixture from one red RGBA pixel, using PNG chunks/zlib.
export const originalPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

export const hostileHtml = `<!doctype html><html><head><title>Hostile synthetic page</title>
<base href="https://attack.invalid/base/">
<meta http-equiv="refresh" content="0;url=https://attack.invalid/refresh">
<link rel="stylesheet" href="https://attack.invalid/style.css">
<style>@import url("https://attack.invalid/import.css"); body { background-image:url(https://attack.invalid/background); }</style>
</head><body onload="parent.marginpackInjected='body'">
<script>globalThis.marginpackInjected='source';try{parent.marginpackInjected='parent'}catch{}</script>
<h1 id="security-heading">Synthetic security notebook</h1>
<p id="security-note" onclick="parent.marginpackInjected='click'">Keep this visible phrase.</p>
<a id="bad-link" href="javascript:parent.marginpackInjected='link'">Unsafe link</a>
<a id="good-link" href="https://example.test/explicit">Safe explicit link</a>
<a id="data-link" href="data:text/html,&lt;script&gt;parent.marginpackInjected='data-link'&lt;/script&gt;">Data link</a>
<form action="https://attack.invalid/submit"><input name="secret" value="synthetic"><button>Submit</button></form>
<iframe src="https://attack.invalid/frame"></iframe><iframe srcdoc="&lt;script&gt;parent.marginpackInjected='srcdoc'&lt;/script&gt;"></iframe>
<object data="https://attack.invalid/object"></object><embed src="https://attack.invalid/embed">
<img src="https://attack.invalid/image" srcset="https://attack.invalid/a 1x, https://attack.invalid/b 2x" onerror="parent.marginpackInjected='image'">
<video poster="https://attack.invalid/poster" autoplay><source src="https://attack.invalid/video"></video>
<audio autoplay src="https://attack.invalid/audio"></audio>
<img src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20onload='parent.marginpackInjected=1'%3E%3C/svg%3E">
<img src="${originalPng}" alt="Original red pixel">
<img src="data:image/png;base64,PHNjcmlwdD5wYXJlbnQubWFyZ2lucGFja0luamVjdGVkPTE8L3NjcmlwdD4=" alt="Spoofed PNG containing HTML">
<iframe src="data:text/html,%3Cscript%3Eparent.marginpackInjected=1%3C/script%3E"></iframe>
<svg xmlns="http://www.w3.org/2000/svg" onload="parent.marginpackInjected='svg'"><foreignObject><iframe src="https://attack.invalid/svg-frame"></iframe></foreignObject><image href="https://attack.invalid/svg-image" /></svg>
<div style="background:url(https://attack.invalid/inline)">End of synthetic page.</div>
</body></html>`;

export function hostileAnnotations() {
  return [{ id: 'hostile-comment', type: 'highlight', color: '#ffd400',
    text: 'Keep this visible phrase.', comment: hostileComment,
    position: { type: 'CssSelector', value: '#security-note' } }];
}

// An active node changes both the body offsets and nth-child selector before
// cleanup. A correct exporter resolves against the source document first.
export const cleanupHtml = '<!doctype html><html><body><script>/* inert fixture payload */</script>'
  + '<p>First page paragraph.</p><p id="cleanup-target">Still the selected paragraph.</p></body></html>';
export const cleanupBodyText = '/* inert fixture payload */First page paragraph.Still the selected paragraph.';
