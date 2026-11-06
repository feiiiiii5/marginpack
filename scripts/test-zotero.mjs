// Explicit, disposable application integration test. Never uses a default profile.
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

if (!process.env.ZOTERO_BIN) throw new Error('Set ZOTERO_BIN to a Zotero 10.0.x executable. No application is installed by this script.');
const native = process.env.ZOTERO_NATIVE === '1';
const mode = native ? 'native' : 'headless';
const timeout = Number(process.env.ZOTERO_TEST_TIMEOUT_MS || (native ? 900000 : 300000));
if (!Number.isSafeInteger(timeout) || timeout < 30000 || timeout > 1200000) {
  throw new Error('ZOTERO_TEST_TIMEOUT_MS must be an integer from 30000 to 1200000.');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const xpi = resolve(root, `dist/marginpack-${pkg.version}.xpi`);
await readFile(xpi); // Fail before creating a profile if the build is missing.
const blocked = new Set([
  'SSH_AUTH_SOCK', 'GH_TOKEN', 'GITHUB_TOKEN',
  'GIT_ASKPASS', 'SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'GIT_SSH', 'GIT_SSH_COMMAND',
  'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_URL',
  'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_RESULTS_URL',
  'HTTPS_PROXY', 'HTTP_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy',
]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.has(key)));
if (native) delete env.MOZ_HEADLESS;
else env.MOZ_HEADLESS = '1';

await mkdir(resolve(root, '.runtime'), { recursive: true });
await mkdir(resolve(root, 'output'), { recursive: true });
const run = await mkdtemp(resolve(root, '.runtime/zotero-test-'));
const profile = resolve(run, 'profile'), data = resolve(run, 'data'), harness = resolve(run, 'harness');
const exportDirectory = resolve(run, '导出 空间 🦊');
for (const directory of [profile, data, harness, exportDirectory, resolve(profile, 'extensions')]) {
  await mkdir(directory, { recursive: true });
}
const config = {
  mode, run, expectedAddonVersion: pkg.version, expectedVersion: process.env.ZOTERO_EXPECTED_VERSION || '10.0.7',
  resultFile: resolve(run, 'result.json'),
  progressFile: resolve(run, 'progress.json'),
  latestFile: resolve(root, `.runtime/zotero-${mode}-latest.json`),
  sourceFile: resolve(run, '原始 页面 🦊.html'),
  exportFile: resolve(exportDirectory, '阅读笔记 中文 🦊.html'),
  existingFile: resolve(exportDirectory, '已有 文件 保护 🦊.html'),
  exportDirectory,
};
const stableResult = resolve(root, `output/zotero-${mode}-result.json`);
const stableExport = resolve(root, `output/zotero-${mode}-export.html`);
for (const filename of [stableResult, stableExport, resolve(root, `output/zotero-${mode}-log.txt`)]) {
  await rm(filename, { force: true });
}
const source = '<!doctype html><html><head><title>Original synthetic study</title></head><body><h1>A saved reading</h1><p id="evidence">Portable notes retain their original context.</p><p>中文与 🦊 remain readable.</p></body></html>';
await writeFile(config.sourceFile, source, 'utf8');
await writeFile(config.existingFile, '<!doctype html><title>Existing synthetic file</title><p>Keep this sentinel unchanged: 中文 🦊.</p>', 'utf8');
await copyFile(xpi, resolve(profile, 'extensions/marginpack@marginpack.local.xpi'));
await writeFile(resolve(harness, 'manifest.json'), JSON.stringify({
  manifest_version: 2, name: 'Disposable MarginPack test harness', version: '1.0',
  applications: { zotero: {
    id: 'marginpack-test@marginpack.local', update_url: 'https://example.invalid/disposable-updates.json',
    strict_min_version: '10.0', strict_max_version: '10.0.*',
  } },
}));
await copyFile(resolve(root, 'scripts/zotero-harness.js'), resolve(harness, 'bootstrap.js'));
const prefs = {
  'extensions.autoDisableScopes': 0, 'extensions.startupScanScopes': 15,
  'extensions.sideloadScopes': 15, 'extensions.logging.enabled': true,
  'extensions.zotero.useDataDir': true, 'extensions.zotero.dataDir': data,
  'extensions.zotero.firstRun2': false, 'extensions.zotero.firstRunGuidance': false,
  'extensions.zotero.automaticScraperUpdates': false,
  'extensions.zoteroMacWordIntegration.skipInstallation': true,
  'extensions.zoteroWinWordIntegration.skipInstallation': true,
  'extensions.zoteroOpenOfficeIntegration.skipInstallation': true,
  'extensions.zotero.httpServer.enabled': false, 'app.update.enabled': false,
  'extensions.update.enabled': false, 'datareporting.healthreport.uploadEnabled': false,
  'toolkit.telemetry.enabled': false, 'extensions.zotero.debug.log': true,
  'marginpack.test.config': JSON.stringify(config),
};
await writeFile(resolve(profile, 'user.js'), Object.entries(prefs).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));

const zipProgram = 'import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.iterdir()): z.write(f,f.name)\n';
const pythonCandidates = process.env.PYTHON
  ? [[process.env.PYTHON, []]]
  : process.platform === 'win32' ? [['python', []], ['py', ['-3']], ['python3', []]] : [['python3', []], ['python', []]];
let packaged = false;
for (const [python, prefix] of pythonCandidates) {
  const result = spawnSync(python, [...prefix, '-c', zipProgram, harness, resolve(profile, 'extensions/marginpack-test@marginpack.local.xpi')], {
    env, timeout: 60000, encoding: 'utf8', windowsHide: true,
  });
  if (result.error?.code === 'ENOENT') continue;
  if (result.status !== 0) throw new Error(`Could not package disposable test harness: ${result.stderr || result.error || result.status}`);
  packaged = true;
  break;
}
if (!packaged) throw new Error('Python 3 is required to package the disposable test harness. Set PYTHON if it is not on PATH.');

const descriptor = { ...config, phase: 'launching', finished: false, stableResult, stableExport };
await writeFile(config.latestFile, JSON.stringify(descriptor, null, 2));
console.log('MARGINPACK_RUN ' + JSON.stringify(descriptor));
const args = ['-no-remote', '-profile', profile, '-datadir', data, '-purgecaches'];
if (!native) args.push('-headless');
if (native && process.platform === 'win32') args.push('-wait-for-browser');
const macNative = native && process.platform === 'darwin';
const appBundle = resolve(process.env.ZOTERO_BIN, '../../..');
const launchArgs = macNative
  ? ['-n', '-W', ...[...blocked, 'MOZ_HEADLESS'].flatMap(key => ['--env', key + '=']), appBundle, '--args', ...args]
  : args;
const child = spawn(macNative ? '/usr/bin/open' : process.env.ZOTERO_BIN, launchArgs, {
  env, cwd: run, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: !native,
  detached: process.platform !== 'win32',
});
let logs = '', startupLogs = '', timedOut = false, interrupted = false;
let exitResolve;
const exited = new Promise(resolveExit => { exitResolve = resolveExit; });
let exitState;
child.on('error', error => { exitState = { error: String(error) }; exitResolve(); });
child.on('exit', (code, signal) => { exitState = { code, signal }; exitResolve(); });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  const text = chunk.toString();
  logs = (logs + text).slice(-24000);
  if (startupLogs.length < 30000) startupLogs = (startupLogs + text).slice(0, 30000);
  const useful = text.split('\n').filter(line => /Calling bootstrap|plugin marginpack|applications.zotero|Extension is invalid|Error running bootstrap|MARGINPACK_TEST/.test(line));
  if (useful.length) process.stdout.write(useful.join('\n').slice(-4000) + '\n');
});

let stopping;
function stopChild() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (!child.pid) return;
    if (macNative && !exitState) {
      // LaunchServices gives open -W a different PID. Match only this fresh
      // profile's binary invocation when stopping a timed-out native test.
      const listing = spawnSync('ps', ['-axo', 'pid=,command='], {env, encoding:'utf8', timeout:5000});
      const prefix = process.env.ZOTERO_BIN + ' ' + args.join(' ');
      for (const line of (listing.stdout || '').split('\n')) {
        const match = /^\s*(\d+)\s+(.+)$/.exec(line);
        if (match && match[2] === prefix) {
          try { process.kill(Number(match[1]), 'SIGTERM'); } catch (_) {}
        }
      }
    }
    if (exitState) {
      // A graceful application exit normally stops content processes. Dispose
      // any remaining members of this test's Unix process group as well.
      if (process.platform !== 'win32') {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (_) {}
      }
      return;
    }
    if (process.platform === 'win32') {
      // Zotero has content processes. Stop only this test's process tree.
      await new Promise(done => {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => { killer.kill(); done(); }, 15000);
        killer.on('error', () => { clearTimeout(timer); child.kill(); done(); });
        killer.on('exit', () => { clearTimeout(timer); done(); });
      });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { child.kill('SIGTERM'); }
      await Promise.race([exited, new Promise(done => setTimeout(done, 3000))]);
      if (!exitState) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
      }
    }
  })();
  return stopping;
}
const onSignal = () => { interrupted = true; void stopChild(); };
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);
const timer = setTimeout(() => { timedOut = true; void stopChild(); }, timeout);
let successful = false;
try {
  await exited;
  let result;
  try { result = JSON.parse(await readFile(config.resultFile, 'utf8')); }
  catch (_) {
    result = {
      mode, ok: false, finished: true, phase: 'failed',
      error: timedOut ? `Application test exceeded ${timeout} ms.` : interrupted ? 'Application test was interrupted.' : 'Application did not write a test result.',
      process: exitState,
    };
  }
  if (timedOut || interrupted || exitState?.error || (exitState?.code !== 0 && exitState?.code !== undefined)) {
    result.ok = false;
    result.process = exitState;
    if (!result.error) result.error = timedOut ? 'Application test timed out.' : interrupted ? 'Application test interrupted.' : 'Application process exited unsuccessfully.';
  }
  result.mode = mode;
  result.finished = true;
  if (result.ok) {
    try {
      await copyFile(config.exportFile, stableExport);
      successful = true;
    } catch (error) {
      result.ok = false;
      result.error = 'Could not retain the verified export: ' + String(error);
    }
  }
  if (!result.ok) process.exitCode = 1;
  await writeFile(stableResult, JSON.stringify(result, null, 2));
  await writeFile(resolve(root, `output/zotero-${mode}-log.txt`), startupLogs + '\n--- bounded final output ---\n' + logs);
  console.log(JSON.stringify(result, null, 2));
  await writeFile(config.latestFile, JSON.stringify({ ...descriptor, phase: result.ok ? 'finished' : 'failed', finished: true, ok: result.ok, resultFile: stableResult, exportFile: result.ok ? stableExport : config.exportFile, error: result.error }, null, 2));
} finally {
  clearTimeout(timer);
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
  await stopChild();
}
// Successful profiles contain only synthetic data. Keep failures for diagnosis.
if (successful) await rm(run, { recursive: true, maxRetries: 5, retryDelay: 500 });
