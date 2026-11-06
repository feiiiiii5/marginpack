# Security and privacy

Development was discontinued on 2026-11-06. This document describes the last release; there is no ongoing security maintenance or response commitment. See the [project decision](docs/CLOSEOUT.md).

MarginPack is a local exporter. It needs no account, API key, model or hosted service. The Zotero adapter reads the selected attachment and its annotations through Zotero APIs; it does not read SQLite directly, sync a library or modify source items.

A Zotero plugin has broad application access. Review the source and install the release only if you trust it. MarginPack's limited actions are an application design boundary, not a sandbox imposed on Zotero plugins.

Imported HTML is untrusted. The export reconstructs readable static content, removes imported scripts and styles, restricts resources, and renders source text in a sandboxed frame without script permission. The trusted viewer can inspect that frame to navigate annotations. This is not origin isolation: the frame uses `allow-same-origin`, with scripts separately forbidden. See [architecture](docs/ARCHITECTURE.md) for the supported boundary.

An export contains the source text and annotations selected for export. Anyone receiving that file can read them. Verify the content before sharing. MarginPack does not certify that a snapshot contains no private information, that a web page is complete, or that redistribution is permitted. Public examples are synthetic.

Sidebar search and filters only change visibility; they do not remove private material from the file. The optional **Troubleshooting summary** uses an allowlist of version, counts and ordinal/type/status fields. It excludes source content, titles, URLs, dates, comments, tags, identifiers, selector data and source hashes; unknown type names become `other`. You select and copy it manually. Nothing is sent, and the underlying reading file remains unchanged. Review any information before posting it publicly.

Zotero’s normal plugin updater may request this project’s public GitHub update manifest and release package. MarginPack adds no telemetry or remote library service. The standalone exported reader blocks automatic network requests; following an external source link requires an explicit user action.

## Reporting

Please do not post private library content or exploit payloads containing real data in public issues. Use the repository's **Security → Report a vulnerability** route if it is available. Otherwise, open a minimal issue asking for a private reporting channel without including the sensitive details. No response-time guarantee is offered.
