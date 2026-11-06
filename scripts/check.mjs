import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
let count = 0;
for (const dir of ['src', 'addon', 'scripts', 'tests']) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(mjs|js)$/.test(entry.name)) continue;
    const file = resolve(root, dir, entry.name);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
    count++;
  }
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'addon/manifest.json'), 'utf8'));
if (!manifest.applications.zotero.id || !manifest.applications.zotero.update_url?.startsWith('https://')) throw new Error('Zotero requires plugin ID and HTTPS update_url');
if (pkg.version !== manifest.version) throw new Error('Version mismatch');
if (manifest.applications.zotero.strict_max_version !== '10.0.*') throw new Error('Do not silently broaden compatibility');
console.log(`Syntax checked ${count} JavaScript files; manifests agree`);
