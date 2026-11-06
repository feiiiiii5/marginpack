/* Disposable integration-test plugin. Bundled only into the test profile. */
"use strict";

function startup() { void runChecks(); }
function install() {}
function shutdown() {}
function uninstall() {}

async function runChecks() {
  const config = JSON.parse(Services.prefs.getStringPref("marginpack.test.config"));
  const productionMenu = config.productionMenu === true;
  const native = config.mode === "native" || productionMenu;
  const result = { mode: config.mode, checks: [], phases: [], alerts: [], ok: false, finished: false };
  let controller, win, originalSelection;
  let selectionPatched = false;
  const check = (name, condition) => {
    result.checks.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(name);
  };
  const sameBytes = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
  async function bounded(promise, label, timeout = 45000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(label + " exceeded " + timeout + " ms")), timeout); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function waitFor(getValue, label, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = getValue();
      if (value) return value;
      await Zotero.Promise.delay(100);
    }
    throw new Error(label + " did not become ready within " + timeout + " ms");
  }
  async function progress(phase, extra = {}) {
    result.phase = phase;
    result.phases.push({ phase, at: new Date().toISOString() });
    const value = JSON.stringify({ ...config, applicationPID: Services.appinfo.processID, phase, finished: false, checks: result.checks, alerts: result.alerts, ...extra }, null, 2);
    await IOUtils.writeUTF8(config.progressFile, value, { tmpPath: config.progressFile + ".tmp" });
    await IOUtils.writeUTF8(config.latestFile, value, { tmpPath: config.latestFile + ".tmp" });
    Zotero.debug("MARGINPACK_TEST " + phase);
  }
  try {
    await progress("initializing");
    await Zotero.initializationPromise;
    await Zotero.uiReadyPromise;
    if (native) await Zotero.Promise.delay(3000);
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
    await progress("opening-synthetic-snapshot-reader");
    const reader = await bounded(Zotero.Reader.open(attachment.id), "Opening the synthetic snapshot reader");
    check("real Zotero snapshot reader opened", Boolean(reader) && reader.type === "snapshot");
    await bounded(reader._initPromise, "Snapshot reader bootstrap");
    await bounded(reader._internalReader.initializedPromise, "Snapshot reader initialization");
    const view = await waitFor(() => reader._internalReader._primaryView, "Snapshot primary view");
    await bounded(view.initializedPromise, "Snapshot document initialization");
    const readerDocument = view._iframeDocument;
    check("reader exposes original synthetic content", Boolean(readerDocument?.getElementById("evidence")));
    check("installed reader range serializer exists", typeof view.getAnnotationFromRange === "function");
    const highlightRange = readerDocument.createRange();
    highlightRange.selectNodeContents(readerDocument.getElementById("evidence"));
    const underlineRange = readerDocument.createRange();
    underlineRange.setStart(readerDocument.getElementById("first-paragraph").firstChild, "Before ".length);
    underlineRange.setEnd(readerDocument.getElementById("second-paragraph").firstChild, "Beta".length);
    const annotations = [];
    result.annotationGeneration = "installed-snapshot-reader-range-api";
    result.readerDerivedAnnotations = [];
    for (const [index, type, range, color] of [[0, "highlight", highlightRange, "#ffd400"], [1, "underline", underlineRange, "#2ea8e5"]]) {
      // Call the application's own range serializer. Only fixture comments and
      // persistence keys are supplied here; quote, selector and sort index all
      // come from the installed reader. This does not simulate pointer input.
      const generated = JSON.parse(JSON.stringify(view.getAnnotationFromRange(range, type, color)));
      check(type + ": reader generated a quote and selector", generated?.type === type && typeof generated.text === "string" && Boolean(generated.position));
      check(type + ": reader quote contains a rendered line break", /\n/.test(generated.text));
      if (type === "highlight") check("reader quote preserves synthetic CJK and emoji", generated.text.includes("中文 🦊"));
      result.readerDerivedAnnotations.push({ type, text: generated.text, position: generated.position, sortIndex: generated.sortIndex });
      generated.key = index === 0 ? "MPTESTAA" : "MPTESTBB";
      generated.comment = "This is an original synthetic integration-test comment. 中文 🦊 (" + type + ")";
      generated.pageLabel = "";
      annotations.push(await Zotero.Annotations.saveFromJSON(attachment, generated));
    }
    const annotationsBefore = await Promise.all(annotations.map(async annotation => JSON.stringify(await Zotero.Annotations.toJSON(annotation))));
    check("both reader-derived annotations persisted", attachment.getAnnotations().length === annotations.length && annotations.length === 2);
    let exportedBytes;
    async function unchanged(phase) {
      check(phase + ": original source bytes unchanged", sameBytes(sourceBefore, await IOUtils.read(config.sourceFile)));
      check(phase + ": stored attachment bytes unchanged", sameBytes(attachmentBefore, await IOUtils.read(attachmentPath)));
      for (let index = 0; index < annotations.length; index++) {
        check(phase + ": " + annotations[index].annotationType + " annotation unchanged", annotationsBefore[index] === JSON.stringify(await Zotero.Annotations.toJSON(await Zotero.Items.getAsync(annotations[index].id))));
      }
      check(phase + ": existing sentinel unchanged", sameBytes(existingBefore, await IOUtils.read(config.existingFile)));
      if (exportedBytes) check(phase + ": saved export unchanged", sameBytes(exportedBytes, await IOUtils.read(config.exportFile)));
    }

    if (!native || productionMenu) {
      await progress("selecting-synthetic-library-attachment");
      await waitFor(() => win.ZoteroPane.collectionsView && win.ZoteroPane.itemsView, "Library item views");
      await bounded(win.ZoteroPane.selectItem(attachment.id, { inLibraryRoot: true, noWindowRestore: true }), "Selecting the actual library attachment");
      await waitFor(() => win.ZoteroPane.getSelectedItems().length === 1 && win.ZoteroPane.getSelectedItems()[0]?.id === attachment.id, "Actual library attachment selection");
      result.selectionMode = "actual-zotero-library-selection";
    } else {
      // Native mode isolates save-dialog behavior from collection-tree state.
      // Real item-tree selection is mandatory in the separate headless check.
      originalSelection = win.ZoteroPane.getSelectedItems;
      win.ZoteroPane.getSelectedItems = () => [attachment];
      selectionPatched = true;
      result.selectionMode = "selected-real-item-seam";
    }
    check("selected real HTML attachment", win.ZoteroPane.getSelectedItems()[0]?.id === attachment.id);

    if (productionMenu) {
      // No controller is loaded or created here. The user/approved computer-use
      // surface invokes the menu registered by the installed add-on's startup,
      // operates the real save picker and dismisses its real success alert.
      result.controllerMode = "production-startup-menu";
      result.pickerMode = "real-native-filepicker";
      result.alertsMode = "actual-application-alerts";
      const menu = win.document.getElementById("marginpack-tools-export");
      check("one enabled production Tools action available", win.document.querySelectorAll("#marginpack-tools-export").length === 1 && !menu.disabled);
      await progress("waiting-production-menu", {
        expectedSavePath: config.exportFile,
        action: "Choose Tools > Export annotated snapshot with MarginPack, save at expectedSavePath, and dismiss the real success alert.",
      });
      let observedBusy = false, saved = false;
      const deadline = Date.now() + 240000;
      while (Date.now() < deadline) {
        observedBusy ||= menu.disabled;
        if (await IOUtils.exists(config.exportFile) && !menu.disabled) { saved = true; break; }
        await Zotero.Promise.delay(200);
      }
      check("production menu was busy during real export", observedBusy);
      check("production menu completed after saving and alert dismissal", saved);
      exportedBytes = await IOUtils.read(config.exportFile);
      const exportedHTML = await IOUtils.readUTF8(config.exportFile);
      const document = new win.DOMParser().parseFromString(exportedHTML, "text/html");
      const state = JSON.parse(document.getElementById("marginpack-data")?.textContent || "null");
      check("production export contains expected viewer version", state?.version === config.expectedAddonVersion);
      check("production export locates both reader-generated annotations", state?.report?.total === annotations.length && state.report.matched === annotations.length && state.report.unresolved === 0);
      check("production export preserves both Unicode comments", state?.items?.length === annotations.length && state.items.every(item => typeof item.comment === "string" && item.comment.includes("original synthetic integration-test comment. 中文 🦊")));
      result.exportStatus = "saved";
      result.report = state.report;
      await unchanged("after production menu save");
      check("production menu is enabled after completion", !menu.disabled);
      result.ok = true;
      return;
    }

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
      ioUtils: {
        read: (...args) => IOUtils.read(...args),
        writeUTF8: (...args) => {
          (result.destinationWriteAttempts ||= []).push(args[0]);
          return IOUtils.writeUTF8(...args);
        },
      },
    });
    controller.start(rootURI);
    result.controllerMode = "separate-controller-loaded-from-installed-xpi";
    result.pickerMode = native ? "real-native-filepicker" : "deterministic-picker-seam";
    await progress("waiting-save-new", { expectedSavePath: config.exportFile, action: "Save the new export at expectedSavePath." });
    const exported = await controller.exportSelected(win);
    result.exportStatus = exported.status;
    result.report = exported.report;
    check("new Unicode destination saved through real IOUtils", exported.status === "saved" && await IOUtils.exists(config.exportFile));
    check("both reader-generated annotations located", exported.report?.total === annotations.length && exported.report?.matched === annotations.length);
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
