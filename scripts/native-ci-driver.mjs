// Operate only the disposable native dialogs on a GitHub-hosted CI runner.
// Local application verification uses the user's approved computer-use surface.
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.GITHUB_ACTIONS !== 'true' || !['linux', 'win32'].includes(process.platform)) {
  throw new Error('Native CI driver runs only on Windows/Linux GitHub Actions. Use the manual native harness locally.');
}
if (!process.env.ZOTERO_BIN) throw new Error('Set up the pinned official Zotero executable first.');
const root = fileURLToPath(new URL('..', import.meta.url));
const latest = resolve(root, '.runtime/zotero-native-latest.json');
const evidencePath = resolve(root, 'output/native-driver.json');
const evidence = { platform: process.platform, operations: [], ok: false };
await mkdir(resolve(root, 'output'), { recursive: true });
await rm(latest, { force: true });
const pause = (ms) => new Promise(done => setTimeout(done, ms));

function command(program, args, { input, timeout = 90_000 } = {}) {
  return new Promise((done, reject) => {
    const processChild = spawn(program, args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    processChild.stdout.on('data', chunk => { output = (output + chunk).slice(-24_000); });
    processChild.stderr.on('data', chunk => { errors = (errors + chunk).slice(-24_000); });
    const timer = setTimeout(() => { processChild.kill(); reject(new Error(program + ' exceeded its time limit')); }, timeout);
    processChild.on('error', error => { clearTimeout(timer); reject(error); });
    processChild.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) done(output);
      else reject(new Error(program + ' failed (' + code + '): ' + errors + output));
    });
    processChild.stdin.end(input);
  });
}

const saveTitle = 'Save MarginPack export as a new HTML file';
async function gtkDialog() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const ids = (await command('xdotool', ['search', '--onlyvisible', '--name', '^' + saveTitle + '$'], { timeout: 5000 })).trim().split('\n');
      if (ids[0]) return ids[ids.length - 1];
    } catch (_) { /* The app has not displayed its native picker yet. */ }
    await pause(250);
  }
  throw new Error('GTK save dialog did not become visible.');
}
async function gtkAction(action, path) {
  const id = await gtkDialog();
  await command('xdotool', ['windowfocus', '--sync', id]);
  await pause(300);
  if (action === 'cancel') {
    await command('xdotool', ['key', '--clearmodifiers', 'Escape']);
    return { window: saveTitle, action };
  }
  const clipboardOwner = text => {
    const owner = spawn('xclip', ['-selection', 'clipboard', '-in', '-loops', '0', '-quiet', '-target', 'UTF8_STRING'], {stdio:['pipe','ignore','ignore']});
    const ended = new Promise(done => {owner.on('exit',done); owner.on('error',done);});
    owner.stdin.end(text);
    return {owner, ended};
  };
  let copied = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    await command('xdotool', ['key', '--clearmodifiers', 'ctrl+l']);
    await pause(250);
    await command('xdotool', ['key', '--clearmodifiers', 'ctrl+a']);
    await pause(100);
    let clipboard = clipboardOwner(path);
    try {
      await pause(200);
      await command('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      await pause(500);
    } finally {clipboard.owner.kill(); await Promise.race([clipboard.ended,pause(1000)]);}
    // A sentinel ensures a failed Copy cannot merely read our pasted value
    // back from the clipboard. Read the real focused native entry before Save.
    clipboard = clipboardOwner('marginpack-native-copy-not-completed');
    try {
      await pause(150);
      await command('xdotool', ['key', '--clearmodifiers', 'ctrl+a']);
      await pause(150);
      await command('xdotool', ['key', '--clearmodifiers', 'ctrl+c']);
      await pause(300);
      copied = await command('xclip', ['-selection','clipboard','-out','-target','UTF8_STRING'], {timeout:5000});
    } finally {clipboard.owner.kill(); await Promise.race([clipboard.ended,pause(1000)]);}
    if (copied === path) break;
  }
  if (copied !== path) throw new Error('GTK native filename entry did not contain the exact requested path: '+JSON.stringify(copied));
  await command('xdotool', ['key', '--clearmodifiers', 'Return']);
  await pause(400);
  // GTK's location entry may first accept the path; the save accelerator then
  // activates the actual Save button if the picker has not closed already.
  try {
    await command('xdotool', ['getwindowname', id], { timeout: 5000 });
    await command('xdotool', ['key', '--clearmodifiers', 'alt+s']);
  } catch (_) { /* The initial Return already closed the native picker. */ }
  if (action === 'replace') {
    await pause(500);
    // GTK gives the replacement confirmation modal focus. The harness accepts
    // this phase only if the native API actually reports returnReplace.
    await command('xdotool', ['key', '--clearmodifiers', 'alt+r']);

  }
  return { window: saveTitle, action, pathSuppliedThrough: 'X11 clipboard' };
}

const powershell = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class NativeDialogFocus {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
'@
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $env:MARGINPACK_NATIVE_ACTION | ConvertFrom-Json
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Save MarginPack export as a new HTML file')
$deadline=(Get-Date).AddSeconds(60); $dialog=$null
while((Get-Date)-lt $deadline){
 $dialog=$root.FindFirst([System.Windows.Automation.TreeScope]::Children,$condition)
 if(-not $dialog){$dialog=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)}
 if($dialog){break}; Start-Sleep -Milliseconds 250
}
if(-not $dialog){throw 'Native Windows save dialog was not visible'}
$dialogProcess=$dialog.Current.ProcessId
[void][NativeDialogFocus]::SetForegroundWindow([IntPtr]$dialog.Current.NativeWindowHandle)
if($config.action -eq 'cancel'){
 [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
 Write-Output 'Cancelled the real Windows save dialog'; exit 0
}
$filename=$null; $deadline=(Get-Date).AddSeconds(30)
$hostCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'FileNameControlHost')
$idCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1001')
while((Get-Date)-lt $deadline){
 $hostControl=$dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$hostCondition)
 if($hostControl){$filename=$hostControl.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$idCondition)}
 if($filename){break}; Start-Sleep -Milliseconds 250
}
if(-not $filename){throw 'Native FileNameControlHost child 1001 was not found'}
$copied=''
for($attempt=0;$attempt -lt 2;$attempt++){
 try{$filename.SetFocus()}catch{}
 [System.Windows.Forms.SendKeys]::SendWait('%n')
 Start-Sleep -Milliseconds 200
 [System.Windows.Forms.SendKeys]::SendWait('^a')
 [System.Windows.Forms.Clipboard]::SetText([string]$config.path)
 [System.Windows.Forms.SendKeys]::SendWait('^v')
 Start-Sleep -Milliseconds 300
 [System.Windows.Forms.Clipboard]::SetText('marginpack-native-copy-not-completed')
 [System.Windows.Forms.SendKeys]::SendWait('^a')
 [System.Windows.Forms.SendKeys]::SendWait('^c')
 Start-Sleep -Milliseconds 250
 $copied=[System.Windows.Forms.Clipboard]::GetText()
 if($copied -eq [string]$config.path){break}
}
if($copied -ne [string]$config.path){throw ('Native Windows filename entry did not match requested path: '+$copied)}
[System.Windows.Forms.SendKeys]::SendWait('%s')
if($config.action -eq 'replace'){
 $deadline=(Get-Date).AddSeconds(30); $yes=$null; $confirmation=$null; $seen=@()
 while((Get-Date)-lt $deadline){
  $windows=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  foreach($window in $windows){
   $caption=$window.Current.Name
   if($window.Current.ProcessId -ne $dialogProcess -and $caption -notmatch 'Confirm.*Save|Save.*As|MarginPack'){continue}
   $seen += ($window.Current.ProcessId.ToString()+':'+$caption)
   $buttons=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
   foreach($button in $buttons){if($button.Current.Name.Trim().Replace('&','').Replace('_','') -match '^(Yes|Replace)(\b|$)' -or ($caption -match 'Confirm' -and $button.Current.AutomationId -eq '6')){ $yes=$button; $confirmation=$window; break }}
   if($yes){break}
  }
  if($yes){break}; Start-Sleep -Milliseconds 250
 }
 if(-not $yes){throw ('Windows replacement confirmation did not appear; candidate windows: '+(($seen|Select-Object -Unique)-join '; '))}
 [void][NativeDialogFocus]::SetForegroundWindow([IntPtr]$confirmation.Current.NativeWindowHandle)
 $invoke=$null
 if($yes.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){$invoke.Invoke()}
 elseif($yes.Current.Name -match 'Yes'){[System.Windows.Forms.SendKeys]::SendWait('%y')}
 else{[System.Windows.Forms.SendKeys]::SendWait('%r')}

}
Write-Output ('Operated real Windows save dialog: '+$config.action)
`;
async function windowsAction(action, path) {
  const config = resolve(root, '.runtime/native-action.json');
  await writeFile(config, JSON.stringify({ action, path }), 'utf8');
  const previous = process.env.MARGINPACK_NATIVE_ACTION;
  process.env.MARGINPACK_NATIVE_ACTION = config;
  try {
    const encoded = Buffer.from(powershell, 'utf16le').toString('base64');
    const output = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded]);
    return { window: saveTitle, action, pathSuppliedThrough: 'Windows native filename control', output: output.trim() };
  } finally {
    if (previous === undefined) delete process.env.MARGINPACK_NATIVE_ACTION;
    else process.env.MARGINPACK_NATIVE_ACTION = previous;
  }
}

const child = spawn(process.execPath, [resolve(root, 'scripts/test-zotero.mjs')], {
  cwd: root, env: { ...process.env, ZOTERO_NATIVE: '1', ZOTERO_TEST_TIMEOUT_MS: '480000' }, stdio: 'inherit',
});
let childDone = false, exitCode;
const exited = new Promise(done => {
  child.on('exit', code => { childDone = true; exitCode = code; done(); });
  child.on('error', error => { childDone = true; exitCode = 1; evidence.error = String(error); done(); });
});
const handled = new Set();
try {
  const deadline = Date.now() + 490_000;
  while (!childDone && Date.now() < deadline) {
    let current;
    try { current = JSON.parse(await readFile(latest, 'utf8')); } catch (_) {}
    if (current && !handled.has(current.phase) && /^waiting-(save-new|cancel|replace)$/.test(current.phase)) {
      handled.add(current.phase);
      const action = current.phase === 'waiting-cancel' ? 'cancel' : current.phase === 'waiting-replace' ? 'replace' : 'save';
      const operation = process.platform === 'win32'
        ? await windowsAction(action, current.expectedSavePath)
        : await gtkAction(action, current.expectedSavePath);
      evidence.operations.push({ phase: current.phase, ...operation });
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    }
    await pause(250);
  }
  if (!childDone) throw new Error('Native application driver exceeded its bounded run.');
  const result = JSON.parse(await readFile(resolve(root, 'output/zotero-native-result.json'), 'utf8'));
  if (exitCode !== 0 || !result.ok || handled.size !== 3) throw new Error('Native application checks did not pass all save/cancel/replacement phases.');
  evidence.ok = true;
  evidence.applicationChecksPassed = result.checks.filter(check => check.passed).length;
} catch (error) {
  evidence.error = String(error);
  process.exitCode = 1;
} finally {
  if (!childDone) {
    if (process.platform === 'win32') await command('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 20000 }).catch(() => {});
    else child.kill('SIGTERM');
    await Promise.race([exited, pause(20000)]);
    if (!childDone) child.kill('SIGKILL');
  }
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
