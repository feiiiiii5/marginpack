# Contributing

Development was discontinued on 2026-11-06. No further review, fixes or releases are scheduled; the instructions below are retained for people studying or independently using the code. See the [project decision](docs/CLOSEOUT.md).

Report a reproducible problem, request a supported export shape, or send a focused pull request. Start with the current release and include the Zotero version, operating system, browser and the exact action that failed.

Do not upload a personal library, login credentials, private notes or copyrighted snapshots. A small original HTML example and synthetic annotation JSON are usually enough. Keep unresolved annotations visible when a selector cannot be recovered; do not make an export look complete by dropping records.

## Development

Node.js 22 or later and Python 3 are required. Run:

```sh
npm ci
npx playwright install chromium firefox
npm run check
npm test
npm run test:browser
npm run build
```

Browser tests run against original fixtures and the actual exported HTML. No development server or Zotero library is required. See [validation](docs/VALIDATION.md) for the separately recorded application checks and limits.

Keep changes focused. Tests should check observable behavior: the located text, the saved file, an unresolved record, or a blocked automatic request. Document any added annotation type or compatibility range. Public descriptions must state which environments were actually exercised.

AI coding assistance is welcome. Contributors remain responsible for understanding their changes, checking the final diff and reporting only validation they ran. Do not include credentials, local library paths or invented test results.
