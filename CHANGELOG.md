# Changelog

## 0.1.1 — 2026-11-06

- Explain a failure to initialize or open the system save dialog without blaming the selected snapshot. No output file is written in this case.
- Add regression coverage for native-dialog failure, cancellation, replacement, Unicode/platform paths, destination creation races and shutdown during a pending dialog.
- Exercise the installed XPI in disposable Zotero 10.0.7 profiles. Native checks use the real operating-system picker and verify source, annotation and existing-file preservation.
- Add Windows, Linux and macOS browser/adapter validation plus pinned portable Zotero application checks. See [the validation record](docs/VALIDATION.md) for exact environments and results.
- Launch macOS native tests through LaunchServices and wait for the Windows browser process, so application tests track the actual GUI lifetime.

## 0.1.0 — 2026-11-06

First experimental release.

- Export one saved UTF-8 HTML snapshot and its existing Zotero annotations into a standalone offline reader.
- Keep original context, annotation colors, comments and tags; show unresolved and unsupported records explicitly.
- Navigate annotations, filter/search cards and toggle highlights without a hosted viewer.
- Reconstruct static source content, preserve supported embedded raster images, block automatic network requests and require explicit external-link navigation.
- Provide a Zotero 10.0.x adapter, bounded to that series, with exclusive destination-file creation.
- Ship original synthetic examples, MIT licensing, English/Chinese documentation and browser tests.

Application validation used Zotero 10.0.7 on macOS ARM64 with controlled selection/save seams. See [the full validation record](docs/VALIDATION.md) for tested behavior and remaining boundaries.
