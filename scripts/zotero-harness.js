/* Disposable integration-test plugin. Bundled only into the test profile. */
"use strict";

function startup() { void runChecks(); }
function install() {}
function shutdown() {}
function uninstall() {}

async function runChecks() {
  const config = JSON.parse(Services.prefs.getStringPref("marginpack.test.config"));
  const native = config.mode === "native";
  const result = { mode: config.mode, checks: [], phases: [], alerts: [], ok: false, finished: false };
  let controller, win, originalSelection;
  let selectionPatched = false;
  const check = (name, condition) => {
    result.checks.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(name);
  };
  const sameBytes = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
  async function progress(phase, extra = {}) {
    result.phase = phase;
    result.phases.push({ phase, at: new Date().toISOString() });
    const value = JSON.stringify({ ...config, phase, finished: false, checks: result.checks, alerts: result.alerts, ...extra }, null, 2);
    await IOUtils.writeUTF8(config.progressFile, value, { tmpPath: config.progressFile + ".tmp" });
    await IOUtils.writeUTF8(config.latestFile, value, { tmpPath: config.latestFile + ".tmp" });
    Zotero.debug("MARGINPACK_TEST " + phase);
  }
  try {
    await progress("initializing");
    await Zotero.initializationPromise;
    await Zotero.uiReadyPromise;
    win = Zotero.getMainWindow();
    check("main window exists", Boolean(win));
    result.zoteroVersion = Zotero.version;
    check("expected Zotero version", Zotero.version === config.expectedVersion);
    result.platform = Zotero.isWin ? "windows" : Zotero.isMac ? "macos" : "linux";
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID("marginpack@marginpack.local");
    check("built XPI installed and active", Boolean(addon?.isActive));
    result.addonVersion = addon?.version;
    check("expected built addon version", addon?.version === config.expectedAddonVersion);
    for (let attempt = 0; attempt < 100 && !win.document.getElementById("marginpack-tools-export"); attempt++) {
      await Zotero.Promise.delay(100);
    }
    check("production Tools menu registered", Boolean(win.document.getElementById("marginpack-tools-export")));
    check("production context menu registered", Boolean(win.document.getElementById("marginpack-item-export")));

    const sourceBefore = await IOUtils.read(config.sourceFile);
    const existingBefore = await IOUtils.read(config.existingFile);
    const parent = new Zotero.Item("webpage");
    parent.libraryID = Zotero.Libraries.userLibraryID;
    parent.setField("title", "Original synthetic study 中文 🦊");
    await parent.saveTx();
    const attachment = await Zotero.Attachments.importFromFile({ file: config.sourceFile, parentItemID: parent.id, contentType: "text/html" });
    attachment.setField("title", "Original synthetic study 中文 🦊");
    attachment.setField("url", "https://example.invalid/study");
    await attachment.saveTx();
    const attachmentPath = await attachment.getFilePathAsync();
    const attachmentBefore = await IOUtils.read(attachmentPath);
    const annotation = new Zotero.Item("annotation");
    annotation.libraryID = Zotero.Libraries.userLibraryID;
    annotation.parentID = attachment.id;
    annotation.annotationType = "highlight";
    annotation.annotationText = "Portable notes retain their original context.";
    annotation.annotationComment = "This is an original synthetic integration-test comment. 中文 🦊";
    annotation.annotationColor = "#ffd400";
    annotation.annotationSortIndex = "0000000";
    annotation.annotationPosition = JSON.stringify({ type: "CssSelector", value: "#evidence" });
    await annotation.saveTx();
    const annotationBefore = JSON.stringify(await Zotero.Annotations.toJSON(annotation));
    let exportedBytes;
    async function unchanged(phase) {
      check(phase + ": original source bytes unchanged", sameBytes(sourceBefore, await IOUtils.read(config.sourceFile)));
      check(phase + ": stored attachment bytes unchanged", sameBytes(attachmentBefore, await IOUtils.read(attachmentPath)));
      check(phase + ": annotation unchanged", annotationBefore === JSON.stringify(await Zotero.Annotations.toJSON(await Zotero.Items.getAsync(annotation.id))));
      check(phase + ": existing sentinel unchanged", sameBytes(existingBefore, await IOUtils.read(config.existingFile)));
      if (exportedBytes) check(phase + ": saved export unchanged", sameBytes(exportedBytes, await IOUtils.read(config.exportFile)));
    }

    // Selection is an explicit test seam. Native picker testing must not wait
    // on Zotero's unrelated collection-tree initialization in a fresh profile.
    if (native && win.ZoteroPane.getSelectedItems()[0]?.id === attachment.id) {
      result.selectionMode = "actual-zotero-ui-selection";
    } else {
      originalSelection = win.ZoteroPane.getSelectedItems;
      win.ZoteroPane.getSelectedItems = () => [attachment];
      selectionPatched = true;
      result.selectionMode = "selected-real-item-seam";
    }
    check("selected real HTML attachment", win.ZoteroPane.getSelectedItems()[0]?.id === attachment.id);

    // Load adapter and core from the installed XPI, so this tests the artifact
    // that users install. Only alert display and, in headless mode, the picker
    // are supplied as test seams. Native mode imports the real picker module.
    const rootURI = addon.getResourceURI().spec;
    const scope = { Zotero, Services, ChromeUtils, IOUtils };
    Services.scriptloader.loadSubScript(rootURI + "bootstrap.js", scope, "UTF-8");
    let pickerReturn = 0, pickerPath = config.exportFile;
    class TestPicker {
      modeSave = 1; returnOK = 0; returnCancel = 1; returnReplace = 2;
      get file() { return pickerPath; }
      init() {} appendFilter() {}
      async show() { return pickerReturn; }
    }
    controller = scope.MarginPackAddon.createController({
      zotero: Zotero,
      services: {
        scriptloader: Services.scriptloader,
        prompt: { alert(_window, _title, message) { result.alerts.push(String(message)); } },
      },
      chromeUtils: native ? ChromeUtils : { importESModule() { return { FilePicker: TestPicker }; } },
      ioUtils: IOUtils,
    });
    controller.start(rootURI);
    result.pickerMode = native ? "real-native-filepicker" : "deterministic-picker-seam";
    await progress("waiting-save-new", { expectedSavePath: config.exportFile, action: "Save the new export at expectedSavePath." });
    const exported = await controller.exportSelected(win);
    result.exportStatus = exported.status;
    result.report = exported.report;
    check("new Unicode destination saved through real IOUtils", exported.status === "saved" && await IOUtils.exists(config.exportFile));
    check("real serialized annotation located", exported.report?.total === 1 && exported.report?.matched === 1);
    exportedBytes = await IOUtils.read(config.exportFile);
    const exportedHTML = await IOUtils.readUTF8(config.exportFile);
    check("standalone viewer contains synthetic Unicode comment", exportedHTML.includes("original synthetic integration-test comment. 中文 🦊"));
    await unchanged("after save");
    const filesAfterSave = (await IOUtils.getChildren(config.exportDirectory)).sort();

    // Let the prior native sheet finish closing before presenting another.
    if (native) await Zotero.Promise.delay(1000);
    pickerReturn = 1;
    const alertsBeforeCancel = result.alerts.length;
    await progress("waiting-cancel", { action: "Cancel the real save dialog without saving a file." });
    const cancelled = await controller.exportSelected(win);
    check("save dialog cancellation is clean", cancelled.status === "cancelled" && result.alerts.length === alertsBeforeCancel);
    check("cancellation creates no extra file", JSON.stringify(filesAfterSave) === JSON.stringify((await IOUtils.getChildren(config.exportDirectory)).sort()));
    await unchanged("after cancel");

    if (native) await Zotero.Promise.delay(1000);
    pickerReturn = 2;
    pickerPath = config.existingFile;
    const alertsBeforeReplace = result.alerts.length;
    await progress("waiting-replace", { expectedSavePath: config.existingFile, action: "Select expectedSavePath and approve the operating system's replacement confirmation. MarginPack must then refuse replacement." });
    const replaced = await controller.exportSelected(win);
    // The refusal alert proves the actual native picker returned returnReplace;
    // simply cancelling this phase cannot pass the replacement check.
    check("confirmed native replacement refused", replaced.status === "cancelled" && result.alerts.slice(alertsBeforeReplace).some(message => message.includes("Choose a new filename")));
    check("replacement creates no extra file", JSON.stringify(filesAfterSave) === JSON.stringify((await IOUtils.getChildren(config.exportDirectory)).sort()));
    await unchanged("after replacement");

    if (!native) {
      pickerReturn = 0;
      await progress("checking-create-race");
      const raced = await controller.exportSelected(win);
      check("existing destination refused even after picker reports OK", raced.status === "error");
      await unchanged("after exclusive-create refusal");
    }
    controller.stop();
    controller = null;
    if (selectionPatched) {
      win.ZoteroPane.getSelectedItems = originalSelection;
      selectionPatched = false;
    }
    check("production menu remains after test controller cleanup", win.document.querySelectorAll("#marginpack-tools-export").length === 1);
    result.ok = true;
  } catch (error) {
    result.error = String(error);
    result.stack = error.stack;
  } finally {
    if (controller) controller.stop();
    if (selectionPatched && win) win.ZoteroPane.getSelectedItems = originalSelection;
    result.finished = true;
    await progress(result.ok ? "finished" : "failed", { finished: true, ok: result.ok, error: result.error });
    await IOUtils.writeUTF8(config.resultFile, JSON.stringify(result, null, 2));
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }
}
