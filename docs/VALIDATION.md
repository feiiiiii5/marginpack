# Validation for 0.1.1

Recorded 2026-11-06. This remains an experimental release with a narrow format boundary.

## Results

| Environment | Adapter + exported-file cases | Real Zotero API/filesystem checks | Real native save checks |
| --- | --- | --- | --- |
| macOS 27.3 ARM64 (local application) | 16 + 16 passed locally; also passed on hosted macOS | 36/36 passed | 30/30 passed |
| Ubuntu 24.04 x64, GTK/X11 through Xvfb | 16 + 16 passed on hosted Linux | 36/36 passed | 30/30 passed |
| Windows Server 2025 Datacenter x64 (`windows-latest`) | 16 + 16 passed | 36/36 passed | 30/30 passed |

These repeat the same cases on different systems; they are not separate sets of unique product scenarios. Native scenarios cover a new path containing Chinese, spaces and an emoji, cancellation, and selecting an existing file followed by the operating system's replacement confirmation. MarginPack then refuses to replace it.

The [passing cross-platform run](https://github.com/feiiiiii5/marginpack/actions/runs/42196437531) records all five jobs. Sanitized application evidence is retained in [macOS](validation-macos.json), [Linux](validation-linux.json) and [Windows](validation-windows.json). The [native Windows confirmation screenshot](native-windows-confirmation.png) comes from the synthetic CI run. The XPI source was unchanged during the later CI-driver refinements. Local actual-application exports were reopened in Chromium and Firefox to verify their highlighted source range and Unicode comment.

## What is being tested

The application harness installs the built XPI into a fresh, disposable Zotero 10.0.7 profile. It creates a synthetic UTF-8 snapshot and annotation through Zotero APIs. The actual installed adapter and exporter perform conversion and exclusive file creation. Source-file bytes, stored attachment bytes, the original annotation, an existing sentinel file and the saved export are checked for unintended changes after each action.

Selection is supplied as a real-item test seam, and notification alerts are captured to avoid blocking. Native mode imports the actual system FilePicker, obtains its actual return codes and writes through real IOUtils. The check requires the plugin's replacement-refusal notification after confirming the operating system's replacement prompt; cancelling that prompt cannot pass as replacement protection. Destination-write observation delegates directly to IOUtils without replacing its behavior.

Headless mode uses a deterministic picker seam to exercise real Zotero serialization, DOM, lifecycle and filesystem behavior, including a destination already created after the picker reports OK. Headless results are separate from native-dialog results.

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

Node.js 22+ and Python 3.9+ are required. Browser tests open actual generated `file://` HTML in Chromium and Firefox. Cases cover exact ranges and overlaps, stale/unsupported annotations, duplicate IDs, selectors resolved before sanitation, hostile HTML, automatic request blocking, navigation, narrow layouts, surrogate-pair boundaries and PRE whitespace.

For the application API check, obtain the pinned official binary and set `ZOTERO_BIN`:

```sh
ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
```

On Windows/Linux, `node scripts/setup-zotero.mjs` downloads the pinned official portable archive into ignored `.runtime/`. On GitHub Actions it also sets `ZOTERO_BIN`. The recorded archive hash identifies the observed download; it is not an independent vendor signature.

For a local macOS native-dialog check:

```sh
ZOTERO_NATIVE=1 ZOTERO_BIN='/path/to/Zotero.app/Contents/MacOS/zotero' node scripts/test-zotero.mjs
```

Operate each real dialog according to `.runtime/zotero-native-latest.json`: save the new Unicode path, cancel the next dialog, then select the existing sentinel and confirm replacement. macOS native mode launches through LaunchServices (`open -n -W`) and strips credential/proxy variables; launching the raw binary did not produce a reliable native panel in the local automation session. Do not start a second Zotero instance when binding an automation tool.

The CI-only native driver operates actual Windows/GTK dialogs in the hosted runner. It requires the GitHub Actions environment flag and a Windows/Linux platform; local macOS checks use the separately operated native mode. Linux uses Xvfb/X11, a focused picker and a bounded UTF-8 clipboard owner. Windows locates the native dialog and filename control through UI Automation, types the path using the system clipboard and reads it back before saving. It confirms the brokered replacement prompt with the native Yes accelerator; the real picker return code and refusal alert remain mandatory assertions. GUI launcher lifetime is tracked separately from the Windows browser process.

Results, bounded logs and synthetic exports go to ignored `output/`; the CI retains its synthetic evidence for 14 days. Successful test profiles are removed. Failed profiles remain for diagnosis. Tests never request a personal profile and do not bundle an application binary, user data or dependencies into the XPI.

## Limits

These checks do not establish compatibility with every Zotero 10.0.x patch, migrated personal libraries, arbitrary snapshot sizes, Safari, Linux Wayland/desktop portals or every Windows desktop configuration. The native checks validate the save dialog and filesystem results; they do not simulate selecting or annotating text interactively in Zotero's reader. Browser tests and application checks remain distinct evidence.

Regenerate the synthetic demo after source changes. Publish `updates.json` only with its matching release XPI and checksum. Do not broaden `strict_max_version` without new application evidence.
