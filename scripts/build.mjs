import { mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'addon/manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error('Package and addon versions differ');
const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
const stage = resolve(dist, 'stage');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
for (const [from, to] of [['addon/manifest.json', 'manifest.json'], ['addon/bootstrap.js', 'bootstrap.js'], ['src/marginpack.js', 'marginpack.js'], ['LICENSE', 'LICENSE']]) {
  await copyFile(resolve(root, from), resolve(stage, to));
}
const name = `marginpack-${pkg.version}.xpi`;
const code = `import pathlib,sys,zipfile\nsrc=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as z:\n for p in sorted(src.iterdir()):\n  i=zipfile.ZipInfo(p.name,(2026,1,1,0,0,0)); i.compress_type=zipfile.ZIP_DEFLATED; i.external_attr=0o100644<<16; z.writestr(i,p.read_bytes())\n`;
const pythonCandidates = process.platform === 'win32' ? [['python', []], ['py', ['-3']], ['python3', []]] : [['python3', []], ['python', []]];
let packaged = false;
for (const [python, prefix] of pythonCandidates) {
  const result = spawnSync(python, [...prefix, '-c', code, stage, resolve(dist, name)], { stdio: 'inherit', timeout: 60000 });
  if (result.error?.code === 'ENOENT') continue;
  if (result.status !== 0) throw new Error('XPI packaging failed');
  packaged = true;
  break;
}
if (!packaged) throw new Error('Python 3 is required to build the XPI');
const bytes = await readFile(resolve(dist, name));
const digest = createHash('sha256').update(bytes).digest('hex');
const updates = { addons: { [manifest.applications.zotero.id]: { updates: [{ version: pkg.version, update_link: `https://github.com/feiiiiii5/marginpack/releases/download/v${pkg.version}/${name}`, update_hash: `sha256:${digest}`, applications: { zotero: { strict_min_version: '10.0', strict_max_version: '10.0.*' } } }] } } };
await writeFile(resolve(dist, 'updates.json'), JSON.stringify(updates, null, 2) + '\n');
await writeFile(resolve(dist, 'SHA256SUMS'), `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
await rm(stage, { recursive: true });
console.log(`Built ${name} (${bytes.length} bytes)`);
