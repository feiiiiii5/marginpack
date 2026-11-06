# MarginPack

Independent open-source product. Keep work within this repository. Never read a user's Zotero database or library without an explicit test profile. Runtime data, downloaded applications, node_modules and test profiles are ignored.

The product reads an existing single-file HTML snapshot plus Zotero's annotation JSON and creates one standalone, read-only HTML. Source snapshots and annotations must never be modified. No model, account, telemetry or network service is needed. Preserve original annotation counts; unsupported, mismatched and unresolved items must be visible and must not be silently guessed.

Public claims must distinguish browser/fixture tests from actual Zotero application testing. Do not claim complete compatibility or that all content is safe. Sanitize imported HTML, block automatic network requests and keep untrusted source content separate from the viewer.

Use original code and original synthetic fixtures. Zotero and SingleFile are independent upstream projects; do not copy their source or branding. Reference their APIs and standard selector shapes where useful.

Workers edit only their assigned files. Workers do not commit, push, change branches, publish, access credentials or spawn workers. The coordinating session handles Git and public actions.
