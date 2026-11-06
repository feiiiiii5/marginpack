// Explicit, disposable application integration test. Never uses a default profile.
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

if (!process.env.ZOTERO_BIN) throw new Error('Set ZOTERO_BIN to a Zotero 10.0.x executable. No application is installed by this script.');
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(resolve(root, '.runtime'), { recursive: true });
const run = await mkdtemp(resolve(root, '.runtime/zotero-test-'));
const profile = resolve(run, 'profile'), data = resolve(run, 'data'), harness = resolve(run, 'harness');
for (const dir of [profile, data, harness, resolve(profile, 'extensions')]) await mkdir(dir, { recursive: true });
const resultFile = resolve(run, 'result.json');
const exportFile = resolve(run, 'export.html');
const sourceFile = resolve(run, 'source.html');
const source = '<!doctype html><html><head><title>Original synthetic study</title></head><body><h1>A saved reading</h1><p id="evidence">Portable notes retain their original context.</p><p>中文与 🦊 remain readable.</p></body></html>';
await writeFile(sourceFile, source);
await copyFile(resolve(root, `dist/marginpack-${pkg.version}.xpi`), resolve(profile, 'extensions/marginpack@marginpack.local.xpi'));
await writeFile(resolve(harness, 'manifest.json'), JSON.stringify({ manifest_version: 2, name: 'Disposable MarginPack test harness', version: '1.0', applications: { zotero: { id: 'marginpack-test@marginpack.local', update_url: 'https://example.invalid/disposable-updates.json', strict_min_version: '10.0', strict_max_version: '10.0.*' } } }));
const prefs = {
  'extensions.autoDisableScopes': 0, 'extensions.startupScanScopes': 15,
  'extensions.sideloadScopes': 15, 'extensions.logging.enabled': true,
  'extensions.zotero.useDataDir': true, 'extensions.zotero.dataDir': data,
  'extensions.zotero.firstRun2': false, 'extensions.zotero.firstRunGuidance': false,
  'extensions.zotero.automaticScraperUpdates': false,
  'extensions.zoteroMacWordIntegration.skipInstallation': true,
  'extensions.zoteroOpenOfficeIntegration.skipInstallation': true,
  'extensions.zotero.httpServer.enabled': false, 'app.update.enabled': false,
  'extensions.update.enabled': false, 'datareporting.healthreport.uploadEnabled': false,
  'toolkit.telemetry.enabled': false, 'extensions.zotero.debug.log': true,
  'marginpack.test.result': resultFile, 'marginpack.test.export': exportFile,
  'marginpack.test.source': sourceFile, 'marginpack.test.bootstrap': pathToFileURL(resolve(root, 'addon/bootstrap.js')).href,
  'marginpack.test.core': pathToFileURL(resolve(root, 'src')).href + '/'
};
await writeFile(resolve(profile, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
await writeFile(resolve(harness, 'bootstrap.js'), `
function startup() { void runChecks(); }
async function runChecks() {
 const result = { checks: [], ok: false };
 const check = (name, condition) => { result.checks.push({name,passed:!!condition}); if (!condition) throw new Error(name); };
 try {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  const win = Zotero.getMainWindow();
  check('main window exists', !!win);
  result.zoteroVersion = Zotero.version;
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID('marginpack@marginpack.local');
  check('built XPI installed and active', !!addon?.isActive);
  for (let i=0;i<50&&!win.document.getElementById('marginpack-tools-export');i++) await Zotero.Promise.delay(100);
  check('production Tools menu registered', !!win.document.getElementById('marginpack-tools-export'));
  check('production context menu registered', !!win.document.getElementById('marginpack-item-export'));
  const sourcePath=Services.prefs.getStringPref('marginpack.test.source');
  const before=await IOUtils.read(sourcePath);
  const parent=new Zotero.Item('webpage'); parent.libraryID=Zotero.Libraries.userLibraryID; parent.setField('title','Original synthetic study'); await parent.saveTx();
  const attachment=await Zotero.Attachments.importFromFile({file:sourcePath,parentItemID:parent.id,contentType:'text/html'});
  attachment.setField('title','Original synthetic study'); attachment.setField('url','https://example.invalid/study'); await attachment.saveTx();
  const attachmentBytes=await IOUtils.read(await attachment.getFilePathAsync());
  const annotation=new Zotero.Item('annotation'); annotation.libraryID=Zotero.Libraries.userLibraryID; annotation.parentID=attachment.id;
  annotation.annotationType='highlight'; annotation.annotationText='Portable notes retain their original context.';
  annotation.annotationComment='This is an original synthetic integration-test comment.'; annotation.annotationColor='#ffd400';
  annotation.annotationSortIndex='0000000'; annotation.annotationPosition=JSON.stringify({type:'CssSelector',value:'#evidence'});
  await annotation.saveTx();
  const aBefore=await Zotero.Annotations.toJSON(annotation);
  // In headless Zotero the collection tree does not receive UI focus.
  // Supply only the selection seam; all items, serialization and IO remain real.
  const originalSelection=win.ZoteroPane.getSelectedItems;
  win.ZoteroPane.getSelectedItems=()=>[attachment];
  const outputPath=Services.prefs.getStringPref('marginpack.test.export');
  class TestPicker { modeSave=1; returnOK=0; returnCancel=1; returnReplace=2; file=outputPath; init(){} appendFilter(){} async show(){return this.returnOK;} }
  const alerts=[];
  const scope={Zotero,Services,ChromeUtils,IOUtils};
  Services.scriptloader.loadSubScript(Services.prefs.getStringPref('marginpack.test.bootstrap'),scope,'UTF-8');
  const controller=scope.MarginPackAddon.createController({zotero:Zotero,services:{scriptloader:Services.scriptloader,prompt:{alert(...args){alerts.push(args[2]);}}},chromeUtils:{importESModule(){return {FilePicker:TestPicker};}},ioUtils:IOUtils});
  controller.start(Services.prefs.getStringPref('marginpack.test.core'));
  const exported=await controller.exportSelected(win);
  result.exportStatus=exported.status; result.report=exported.report; result.alerts=alerts;
  check('export saved through real IOUtils',exported.status==='saved'&&await IOUtils.exists(outputPath));
  check('real serialized annotation located',exported.report?.total===1&&exported.report?.matched===1);
  const exportedHTML=await IOUtils.readUTF8(outputPath);
  check('standalone viewer contains synthetic comment',exportedHTML.includes('original synthetic integration-test comment'));
  const again=await controller.exportSelected(win);
  check('existing output not overwritten',again.status==='error'&&(await IOUtils.readUTF8(outputPath))===exportedHTML);
  const after=await IOUtils.read(sourcePath);
  check('source file bytes unchanged',before.length===after.length&&before.every((v,i)=>v===after[i]));
  const attachmentAfter=await IOUtils.read(await attachment.getFilePathAsync());
  check('stored attachment bytes unchanged',attachmentBytes.length===attachmentAfter.length&&attachmentBytes.every((v,i)=>v===attachmentAfter[i]));
  const aAfter=await Zotero.Annotations.toJSON(await Zotero.Items.getAsync(annotation.id));
  check('source annotation unchanged',JSON.stringify(aBefore)===JSON.stringify(aAfter));
  controller.stop();
  win.ZoteroPane.getSelectedItems=originalSelection;
  check('production menu remains after test controller cleanup',win.document.querySelectorAll('#marginpack-tools-export').length===1);
  result.ok=true;
 } catch(error) {result.error=String(error); result.stack=error.stack;}
 finally {
  await IOUtils.writeUTF8(Services.prefs.getStringPref('marginpack.test.result'),JSON.stringify(result,null,2));
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
 }
}
function install(){} function shutdown(){} function uninstall(){}
`);
const harnessZip=spawnSync('python3',['-c','import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in p.iterdir(): z.write(f,f.name)\n',harness,resolve(profile,'extensions/marginpack-test@marginpack.local.xpi')],{stdio:'inherit'});
if(harnessZip.status!==0) throw new Error('Could not package disposable test harness');
const blocked = new Set(['SSH_AUTH_SOCK','GH_TOKEN','GITHUB_TOKEN','HTTPS_PROXY','HTTP_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.has(key)));
const child = spawn(process.env.ZOTERO_BIN, ['-no-remote', '-profile', profile, '-datadir', data, '-purgecaches', '-headless'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; let startupLogs = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  const text = chunk.toString();
  logs = (logs + text).slice(-16000); if(startupLogs.length<30000) startupLogs+=text;
  const useful=text.split('\n').filter(line=>/Calling bootstrap|plugin marginpack|applications.zotero|Extension is invalid|Error running bootstrap|MARGINPACK_TEST/.test(line));
  if(useful.length) process.stdout.write(useful.join('\n').slice(-2000)+'\n');
});
const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
try {
  await new Promise((done, reject) => { child.on('error', reject); child.on('exit', done); });
  let result;
  try { result = JSON.parse(await readFile(resultFile, 'utf8')); }
  catch { throw new Error('Application did not write a test result.\n' + startupLogs.slice(0,30000)); }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  else await copyFile(exportFile, resolve(root, 'output/zotero-integration-export.html')).catch(async () => { await mkdir(resolve(root, 'output'), {recursive:true}); await copyFile(exportFile,resolve(root,'output/zotero-integration-export.html')); });
} finally { clearTimeout(timer); if (child.exitCode===null) child.kill('SIGTERM'); }
// Successful disposable profiles contain only synthetic data and are removed.
if (!process.exitCode) await rm(run, {recursive:true});
