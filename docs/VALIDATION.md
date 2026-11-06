# Validation for 0.1.2

Recorded 2026-11-06. This is an experimental release with a narrow format boundary. A repeated case on another system is additional platform evidence, not a new unique product scenario.

## Current release results

| Environment | Adapter cases | Chromium/Firefox cases | Actual application API/filesystem | Native save checks (3 scenarios) | Production-menu checks |
| --- | --- | --- | --- | --- | --- |
| macOS 27.3 ARM64, local | 18 passed | 36 passed | 50/50 passed | **Not reverified for 0.1.2** | **Not completed locally** |
| Ubuntu 24.04 x64, GTK/X11 application through Xvfb | 18 passed | 36 passed | 50/50 passed | 43/43 passed | 31/31 passed |
| Windows Server 2025 Datacenter x64 | 18 passed | 36 passed | 50/50 passed | 43/43 passed | 31/31 passed |

The [passing cross-platform run](https://github.com/feiiiiii5/marginpack/actions/runs/42210436757) records all five jobs for source commit `b6666e95591632163f8841fad23748280fbe5f23`. Sanitized application evidence is retained for [macOS](validation-macos.json), [Linux](validation-linux.json) and [Windows](validation-windows.json). The [Windows replacement confirmation screenshot](native-windows-confirmation.png) is unmodified synthetic CI evidence. The JSON records identify the local release package hash and the CI source revision separately; each hosted application check installs its own build from that source. Documentation and updater publication do not change the tested XPI source.

macOS native save/cancel/replacement checks passed for [0.1.1](https://github.com/feiiiiii5/marginpack/blob/v0.1.1/docs/validation-macos.json). That earlier result is **not** counted as a current-version pass. This round's local production-menu preparation reached real reader-derived annotations and actual library selection, but the computer-use connection to the native app repeatedly timed out. No save interaction completed in that attempt; the owned test was stopped. The cause of that UI-connection failure is unverified. Windows/Linux native and production-menu checks are independent evidence.

The workflow tests source, tests, package and workflow changes. Pure documentation/update-pointer changes and tag pushes do not repeat the functional matrix. This release separately verifies the published package/demo/checksum bytes and the public update manifest; a tag alone is not test evidence. Browser caching is keyed by OS, architecture and lockfile, and does not skip dependency installation or tests.

## What the application checks do

The harness installs the built XPI into a fresh, disposable Zotero **10.0.7** profile and data directory. Before inserting fixtures it waits for the actual library's initial item load, avoiding a race between fresh-library initialization and fixture writes.

It imports original UTF-8 HTML, opens the installed snapshot reader and supplies two DOM ranges. The installed reader's own `getAnnotationFromRange()` generates a highlight across a BR, including CJK and an emoji, and an underline spanning two paragraphs. Quote text, selector and sort index come from the reader; comments and persistence keys are synthetic test data saved through Zotero APIs. The exact generated quotes/selectors are retained in the evidence. This verifies range serialization, not mouse-drag annotation creation.

All application modes require both annotations to be located. They check original source bytes, stored attachment bytes, both persisted annotations, an existing sentinel and the successful export for unintended changes. The local actual-application export was reopened in Chromium and Firefox to verify both exact highlight ranges, Unicode comments, the troubleshooting summary and zero automatic HTTP requests.

- **API/headless mode:** actual `ZoteroPane.selectItem()` selection and the adapter loaded from the installed XPI. A separate controller uses a deterministic picker and captured alerts to exercise serialization, lifecycle, real IOUtils and destination-create races.
- **Native three-scenario mode:** a separate installed-XPI controller uses the real system picker. Selection is an explicit selected-real-item seam; notification alerts are captured. It saves a new Unicode path, cancels a second dialog, then selects an existing file and approves the operating system's replacement confirmation. The actual picker must return replacement and MarginPack must refuse it. Cancellation cannot pass as replacement protection.
- **Production-menu mode on hosted Windows/Linux:** actual library selection, the add-on's original startup-registered XUL menu action and its production controller, real picker and real success notification. The harness invokes `menu.doCommand()`; this is command dispatch rather than a pointer click on a menu. The native driver operates the save dialog, reads back the chosen path and dismisses the actual application notification. No second controller, picker replacement or notification replacement is used in this mode.

The CI-only driver uses Xvfb/X11 on Linux and UI Automation/native input on Windows. Its environment/platform checks are execution conventions, not a security sandbox. The installed app's original module, real picker return codes, saved bytes and menu completion remain authoritative assertions.

## Browser and adapter regressions

The suite has 18 adapter cases and 18 browser scenarios repeated in Chromium and Firefox: **54 test executions per operating system**. CI repeats these on three operating systems; engine/platform repetitions are not additional unique product scenarios.

Coverage includes exact/overlapping ranges, stale and unsupported annotations, duplicate/malformed IDs, selectors resolved before cleanup, hostile HTML, automatic request blocking, Unicode surrogate boundaries, PRE whitespace, BR/block quotations, inline word-boundary negative controls, local/Unicode/legacy/root anchors, base/query URL distinctions, missing targets, source language/RTL, preview focus return, phone layout, diagnostic data minimization and portable filename suggestions. Default filenames are suggestions only; the chosen path is forwarded unchanged and writes remain exclusive.

The new quote and navigation failures were reproduced before their fixes. The quote fallback compares a detached clone of the **same** resolved range with explicit semantic separators. It never searches elsewhere or drops all whitespace to force a match. Original CSS layout and generated content are not emulated.

## Reproduce

Node.js 22+ and Python 3.9+ are required:

```sh
npm ci
npx playwright install chromium firefox
npm run check
npm test
npm run test:browser
npm run build
node scripts/demo.mjs
```

Browser tests open actual generated `file://` HTML. No server, account, model or personal Zotero library is needed.

For a disposable application API check, obtain the official pinned app and set its executable:

```sh
ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
```

On Windows/Linux, `node scripts/setup-zotero.mjs` downloads the official portable archive into ignored `.runtime/` and sets `ZOTERO_BIN` on CI. An observed archive hash identifies a download; it is not an independent vendor signature. The local macOS download's app signature was verified as Corporation for Digital Scholarship, Team ID `8LAYR367YV`.

For separately operated native checks:

```sh
ZOTERO_NATIVE=1 ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
ZOTERO_NATIVE=1 ZOTERO_PRODUCTION_MENU=1 ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
```

Follow `.runtime/zotero-native-latest.json` or `.runtime/zotero-production-latest.json` for the current action and exact destination. Native macOS tests launch through LaunchServices. Do not open a second instance to bind an automation tool. Automatic menu-command dispatch is explicitly limited to the hosted CI mode.

Results, bounded logs and synthetic exports go to ignored `output/`; CI retains synthetic evidence for 14 days. Successful test profiles are removed, while failures are kept for diagnosis until the owning worktree is cleaned. Test profiles strip credential/proxy variables, disable app/plugin updates and skip office-integration installation. No application binary, test harness, user data or dependency is bundled into the release XPI.

## Limits

These checks do not establish compatibility with every Zotero 10.0.x patch, migrated personal libraries, arbitrary snapshot sizes, Safari, Linux Wayland/desktop portals or every Windows desktop configuration. Reader ranges and library selection are supplied through application APIs; pointer-drag annotation creation is not tested. Complete printing, PDF/EPUB export, source scripts/CSS, live resources, export editing and import back into Zotero remain outside this release.

Filters do not redact a shared file. The troubleshooting summary excludes source content and identifiers, but should still be reviewed before posting. Source hashes identify input bytes and do not certify truth, completeness or redistribution rights.

Regenerate the synthetic demo after source changes. Publish `updates.json` only with its matching release XPI and checksum. Do not broaden `strict_max_version` without new application evidence.
