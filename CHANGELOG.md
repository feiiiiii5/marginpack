# Changelog

## 0.1.0 — 2026-11-06

First experimental release.

- Export one saved UTF-8 HTML snapshot and its existing Zotero annotations into a standalone offline reader.
- Keep original context, annotation colors, comments and tags; show unresolved and unsupported records explicitly.
- Navigate annotations, filter/search cards and toggle highlights without a hosted viewer.
- Reconstruct static source content, preserve supported embedded raster images, block automatic network requests and require explicit external-link navigation.
- Provide a Zotero 10.0.x adapter, bounded to that series, with exclusive destination-file creation.
- Ship original synthetic examples, MIT licensing, English/Chinese documentation and browser tests.

Application validation used Zotero 10.0.7 on macOS ARM64 with controlled selection/save seams. See [the full validation record](docs/VALIDATION.md) for tested behavior and remaining boundaries.
