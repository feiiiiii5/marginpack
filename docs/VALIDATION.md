# Validation for 0.1.0

Recorded 2026-11-06. This is an experimental first release, not a claim of complete Zotero or browser compatibility.

## Automated checks

Local environment: macOS 27.3 ARM64, Node.js 26.13.0, Playwright 1.65.0. The repository CI uses Node.js 22 on Ubuntu and records its own outcome in GitHub Actions.

| Check | Result | Scope |
| --- | --- | --- |
| JavaScript syntax and manifest checks | Passed | 10 JavaScript files; matching package/add-on version; bounded compatibility and required update URL |
| Adapter tests (`npm test`) | 9 passed, 0 skipped | Selection, allowed metadata, cancellation, conversion failure, lifecycle, shutdown, UTF-8/BOM fidelity and exclusive file creation |
| Exported-file tests (`npm run test:browser`) | 16 passed, 0 skipped | 8 cases each in Chromium and Firefox, opening actual generated HTML through `file://` |
| Actual Zotero 10.0.7 application harness | 12 checks passed | Built XPI loaded, production menus registered, real annotation serialization and export, existing destination refused, original and stored attachment bytes and annotation unchanged, menu cleanup |
| XPI packaging | Passed | Original four-file package with deterministic ZIP entries, SHA-256 checksum and versioned update manifest |

Browser cases exercise exact text ranges, overlaps, duplicate IDs, unresolved/unsupported records, selector resolution before sanitation, body offsets, hostile HTML, blocked automatic requests, highlight toggles, keyboard navigation, narrow layouts, surrogate-pair boundaries and PRE whitespace. Tests assert observable output; they are not a formal proof that every possible HTML payload is safe.

The successful application-generated HTML was also reopened in Chromium and Firefox: its highlighted source text and synthetic comment were verified.

The application harness runs the official Zotero 10.0.7 macOS ARM64 binary in a fresh, disposable profile and data directory. It creates an original synthetic snapshot and annotation through Zotero's APIs. Headless collection-tree selection does not initialize reliably, so the harness supplies the selected real item through a selection seam and replaces the save dialog with a deterministic destination. Zotero's item, attachment, annotation, plugin lifecycle, browser DOM and IOUtils implementations remain real.

**Not verified:** native selection clicks, native save-dialog interaction, Windows/Linux Zotero, Safari, every Zotero 10.0.x patch, migrated real libraries or arbitrarily large snapshots. Save-dialog cancellation and replacement handling are covered by adapter tests, not by native UI automation. The application annotation is API-created; this harness does not simulate annotating text interactively in Zotero's reader.

## Reproduce

```sh
npm ci
npx playwright install chromium firefox
npm run check
npm test
npm run test:browser
npm run build
node scripts/demo.mjs
```

For the optional application check, first obtain Zotero 10.0.7 from the official vendor. Do not point this test at a personal profile:

```sh
ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
```

The script always creates its own profile and data directory under ignored `.runtime/`, disables word-processor integration installation in that test profile, and closes its application instance. Successful test profiles are removed. A failed profile is retained for diagnosis; it contains only synthetic test data. The last successful exported document is copied to ignored `output/` for inspection. No application binary or profile is bundled in the repository or release.

Before publishing, regenerate the demo after source changes and compare the release XPI with `SHA256SUMS`. Publish the build's matching `updates.json` at the repository root. Do not broaden `strict_max_version` without fresh application evidence.
