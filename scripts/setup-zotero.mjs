// Download a version-pinned official Zotero build into this checkout only.
// This script never installs or starts the application.
import { createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERSION = '10.0.7';
const DISTRIBUTIONS = {
  linux: { archive: `Zotero-${VERSION}_linux-x86_64.tar.xz`, executable: 'zotero' },
  win32: { archive: `Zotero-${VERSION}_win-x64.zip`, executable: 'zotero.exe' },
};
const root = fileURLToPath(new URL('..', import.meta.url));
const distribution = DISTRIBUTIONS[process.platform];
if (!distribution || process.arch !== 'x64') throw new Error('Pinned application setup supports Linux x64 and Windows x64 only.');
const runtime = resolve(root, '.runtime', `zotero-${VERSION}-${process.platform}`);
const extracted = join(runtime, 'application');
const archive = join(runtime, distribution.archive);
const temporaryArchive = archive + '.partial';
const url = `https://download.zotero.org/client/release/${VERSION}/${distribution.archive}`;
const blocked = new Set([
  'SSH_AUTH_SOCK', 'GH_TOKEN', 'GITHUB_TOKEN', 'SSH_ASKPASS', 'GIT_ASKPASS',
  'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_URL',
  'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_RESULTS_URL',
  'HTTPS_PROXY', 'HTTP_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy',
]);
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.has(key)));
await mkdir(runtime, { recursive: true });

async function download() {
  let lastError;
  // Each complete request, including its response body, has a 60 second bound.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const digest = createHash('sha256');
    let size = 0;
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'error' });
      if (!response.ok || !response.body) throw new Error(`Official Zotero download returned HTTP ${response.status}.`);
      await pipeline(Readable.fromWeb(response.body), new Transform({
        transform(chunk, encoding, done) {
          size += chunk.length;
          if (size > 512 * 1024 * 1024) return done(new Error('Official archive exceeded the 512 MiB setup limit.'));
          digest.update(chunk);
          done(null, chunk);
        },
      }), createWriteStream(temporaryArchive, { flags: 'w' }));
      if (size < 1_000_000) throw new Error('Official archive is unexpectedly small.');
      const { rename } = await import('node:fs/promises');
      await rm(archive, { force: true });
      await rename(temporaryArchive, archive);
      return { bytes: size, sha256: digest.digest('hex') };
    } catch (error) {
      lastError = error;
      await rm(temporaryArchive, { force: true });
      console.warn(`Official archive download attempt ${attempt} failed: ${error.message}`);
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

function command(command, args, timeout = 120_000) {
  const result = spawnSync(command, args, { env: childEnv, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${basename(command)} failed: ${result.error?.message || result.stderr?.slice(-4000) || result.status}`);
  return result.stdout;
}

const downloaded = await download();
await rm(extracted, { recursive: true, force: true });
await mkdir(extracted, { recursive: true });
if (process.platform === 'win32') {
  // Python is already present on GitHub-hosted runners. zipfile needs no global
  // installer and checks every entry before extracting the official archive.
  const python = process.env.PYTHON || 'python';
  const code = `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(sys.argv[1]) as archive:
 for entry in archive.infolist():
  destination=(root / entry.filename).resolve()
  if not destination.is_relative_to(root): raise RuntimeError('Unsafe archive path')
 archive.extractall(root)
`;
  command(python, ['-c', code, archive, extracted]);
} else {
  const members = command('tar', ['-tJf', archive]).split('\n').filter(Boolean);
  if (members.some((member) => member.startsWith('/') || member.split('/').includes('..'))) throw new Error('Official archive contains an unsafe extraction path.');
  command('tar', ['-xJf', archive, '-C', extracted, '--no-same-owner']);
}

async function findExecutables(directory, depth = 0) {
  if (depth > 5) return [];
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...await findExecutables(candidate, depth + 1));
    else if (entry.isFile() && entry.name.toLowerCase() === distribution.executable) matches.push(candidate);
  }
  return matches;
}
const candidates = await findExecutables(extracted);
if (candidates.length !== 1) throw new Error(`Expected exactly one ${distribution.executable}; found ${candidates.length}.`);
const binary = candidates[0];
if (process.platform !== 'win32') await chmod(binary, 0o755);
const metadata = {
  version: VERSION, platform: process.platform, architecture: process.arch,
  source: url, archiveBytes: downloaded.bytes, archiveSha256: downloaded.sha256,
  checksumMeaning: 'Observed archive hash; downloaded from the official HTTPS vendor URL. No independent vendor checksum was supplied.',
  binary,
};
await writeFile(resolve(root, '.runtime', 'zotero-setup.json'), JSON.stringify(metadata, null, 2) + '\n');
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `ZOTERO_BIN=${binary}\nZOTERO_EXPECTED_VERSION=${VERSION}\n`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `binary=${binary}\nversion=${VERSION}\n`);
console.log(JSON.stringify(metadata, null, 2));
console.log('ZOTERO_BIN=' + binary);
