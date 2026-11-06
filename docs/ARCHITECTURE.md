# Architecture and provenance

MarginPack has two boundaries: a read-only Zotero adapter and a browser document exporter. There is no hosted application server, model inference, account service or analytics. Zotero checks the project’s GitHub update manifest through its normal plugin updater; generated reading files make no automatic network requests.

## Data flow

1. The plugin resolves one selected downloaded HTML attachment through Zotero's item APIs.
2. It reads the snapshot and serializes its annotations through Zotero.Annotations.toJSON. It exports only the content fields required by the reader, replacing library item keys with export-local IDs and omitting author/library identity fields.
3. The core resolves CSS and text-position selectors against the original parsed DOM. Text offsets count UTF-16 units. It checks a stored quote before calling a location matched.
4. Imported HTML is reconstructed as static readable content. Original scripts, handlers and styles are not carried over. Highlight segments represent overlaps without altering the recorded quote.
5. A trusted outer document displays text-only comment cards and controls a sandboxed source frame. The source frame does not have script permission. It permits same-origin access so the outer viewer can navigate and toggle marks; this is not an opaque-origin security boundary. Restrictive content policies and sanitation also apply.
6. The adapter saves a new standalone HTML only after a destination is chosen. It never edits source items or overwrites an existing destination.

The source SHA-256 identifies the original UTF-8 snapshot input; it is not a signature, truth attestation, or proof that the page was captured completely. Unmatched or unsupported annotations remain in the report rather than disappearing from the denominator.

## Compatibility and limits

The initial plugin targets Zotero 10.0.x. Broader version claims require actual application tests. Multi-file archived sites, live DOM changes, PDF/EPUB, source scripts, arbitrary CSS and iframe content are deliberately not emulated. This keeps the first supported task inspectable and avoids silently altering old annotation locations.

Exported comments and source text can contain sensitive information. The exporter cannot infer which notes a user considers private. It does not claim anonymization or a perfect historical copy of the original website.

## Independent implementation

All project code and synthetic fixtures were written for MarginPack. No Zotero/SingleFile implementation code is bundled. The implementation follows observed API data shapes and the relevant standard:

- [Zotero plugin lifecycle and manifest documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero 10 plugin changes](https://www.zotero.org/support/dev/zotero_10_for_developers)
- [Zotero annotation serialization API](https://github.com/zotero/zotero/blob/10.0.7/chrome/content/zotero/xpcom/annotations.js)
- [Zotero snapshot selector types](https://github.com/zotero/reader/blob/master/src/dom/common/lib/selector.ts)
- [W3C Web Annotation Data Model selectors](https://www.w3.org/TR/annotation-model/#selectors)

Zotero provides the source annotation workflow. SingleFile provides existing webpage capture technology used in that ecosystem. MarginPack's addition is the export adapter and standalone reader for annotations that already exist in Zotero. No claim of inventing web annotations, snapshot capture, or selector matching is made.
