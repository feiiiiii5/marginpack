/* MarginPack's Zotero adapter. No library writes, downloads, or remote services. */
"use strict";

// Kept separate from bootstrap globals so the adapter can be exercised with a
// synthetic Zotero API in tests. This is not a WebExtension background script.
var MarginPackAddon = (() => {
  const LABEL = "Export annotated snapshot with MarginPack…";
  const PICKER_MODULE = "chrome://zotero/content/modules/filePicker.mjs";
  const MENU_IDS = ["marginpack-tools-export", "marginpack-item-export"];

  class ExportError extends Error {}

  function isHTMLAttachment(item) {
    return Boolean(item?.isAttachment?.() && item.isFileAttachment?.()
      && item.attachmentContentType === "text/html");
  }

  async function selectSnapshot(zotero, selected) {
    if (!Array.isArray(selected) || selected.length !== 1) {
      throw new ExportError("Select one saved HTML snapshot, or one parent item containing exactly one HTML snapshot.");
    }
    const item = selected[0];
    if (isHTMLAttachment(item)) return item;
    if (!item?.isRegularItem?.()) {
      throw new ExportError("This item is not a saved HTML snapshot. Select its HTML attachment in the library.");
    }
    const attachments = await zotero.Items.getAsync(item.getAttachments());
    const snapshots = attachments.filter(isHTMLAttachment);
    if (snapshots.length === 0) {
      throw new ExportError("This item has no saved HTML snapshot. Save a webpage snapshot in Zotero first; MarginPack does not download pages.");
    }
    if (snapshots.length > 1) {
      throw new ExportError("This item has more than one HTML snapshot. Select the exact HTML attachment to export.");
    }
    return snapshots[0];
  }

  function safeSourceURL(value, URLClass) {
    try {
      const url = new URLClass(value);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      url.username = "";
      url.password = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function safeTitle(value) {
    const title = String(value || "").trim();
    // Attachment filenames can be edited into absolute paths. Do not export
    // filesystem locations as document metadata.
    if (/^(?:file:|[a-z]:[\\/]|[\\/]|~[\\/])/i.test(title)) return "Saved webpage";
    return title || "Saved webpage";
  }

  async function readSnapshot(zotero, attachment, URLClass, ioUtils, TextDecoderClass) {
    const path = await attachment.getFilePathAsync();
    if (!path) {
      throw new ExportError("The snapshot file is not available on this computer. Download it in Zotero, then try again.");
    }
    let html;
    try {
      html = await zotero.File.getContentsAsync(path, "UTF-8");
    } catch (_) {
      throw new ExportError("The saved snapshot could not be read. Check that its local HTML file is available.");
    }
    if (typeof html !== "string" || !html.trim()) {
      throw new ExportError("The selected snapshot is empty or could not be read as HTML.");
    }

    let exactHTML;
    try {
      // Zotero's text reader strips the first UTF-8 BOM and replaces invalid
      // bytes. Preserve valid bytes on a UTF-8 round trip so the core's hash is
      // the original file hash, and reject encodings we cannot preserve.
      const bytes = await ioUtils.read(path);
      exactHTML = new TextDecoderClass("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (_) {
      throw new ExportError("The snapshot is not readable UTF-8 HTML. MarginPack needs a UTF-8 snapshot to preserve its source hash; no export was saved.");
    }
    if (exactHTML.replace(/^\uFEFF/, "") !== html) {
      throw new ExportError("The snapshot changed while it was being read. Try exporting it again.");
    }
    html = exactHTML;

    const annotations = [];
    for (const item of attachment.getAnnotations()) {
      let json;
      try {
        json = await zotero.Annotations.toJSON(item);
      } catch (_) {
        // Never silently drop an annotation and export an incomplete count.
        throw new ExportError("An annotation could not be read. No export was saved; the original snapshot and annotations are unchanged.");
      }
      if (!json || typeof json !== "object") {
        throw new ExportError("An annotation returned invalid data. No export was saved.");
      }
      annotations.push({
        // Export-local IDs avoid exposing library IDs and item keys.
        id: `annotation-${annotations.length + 1}`,
        type: json.type,
        color: json.color,
        position: json.position,
        text: json.text,
        comment: json.comment,
        tags: json.tags
      });
    }
    let savedAt = "";
    const dateAdded = attachment.getField("dateAdded");
    if (dateAdded) {
      savedAt = zotero.Date.sqlToISO8601(dateAdded);
    }
    return {
      html,
      annotations,
      metadata: {
        title: safeTitle(attachment.getField("title")),
        url: safeSourceURL(attachment.getField("url"), URLClass),
        savedAt
      }
    };
  }

  function createController({ zotero, services, chromeUtils, ioUtils }) {
    const windows = new Map();
    let rootURI = "";
    let active = false;

    function alert(window, message) {
      services.prompt.alert(window, "MarginPack", message);
    }

    function isCurrent(window, state) {
      return active && !window.closed && windows.get(window) === state;
    }

    function updateMenus(state) {
      for (const menu of state.menus) {
        menu.disabled = state.busy;
        menu.setAttribute("label", state.busy ? "MarginPack is exporting…" : LABEL);
      }
    }

    function loadCore(window, state) {
      if (state.core) return state.core;
      state.previousCore = Object.getOwnPropertyDescriptor(window, "MarginPack");
      services.scriptloader.loadSubScript(rootURI + "marginpack.js", window, "UTF-8");
      state.core = window.MarginPack;
      if (typeof state.core?.exportSnapshot !== "function") {
        throw new ExportError("MarginPack's exporter could not be loaded. Reinstall the built MarginPack add-on.");
      }
      return state.core;
    }

    async function exportSelected(window) {
      const state = windows.get(window);
      if (!state || !isCurrent(window, state)) return { status: "cancelled" };
      if (state.busy) return { status: "busy" };
      state.busy = true;
      updateMenus(state);
      try {
        const selected = window.ZoteroPane?.getSelectedItems();
        const attachment = await selectSnapshot(zotero, selected);
        if (!isCurrent(window, state)) return { status: "cancelled" };
        const input = await readSnapshot(zotero, attachment, window.URL, ioUtils, window.TextDecoder);
        if (!isCurrent(window, state)) return { status: "cancelled" };
        const core = loadCore(window, state);
        const output = await core.exportSnapshot(input);
        if (!isCurrent(window, state)) return { status: "cancelled" };
        if (typeof output?.html !== "string" || !output.html) {
          throw new ExportError("MarginPack could not create the export. No file was saved.");
        }

        const { FilePicker } = chromeUtils.importESModule(PICKER_MODULE);
        const picker = new FilePicker();
        picker.init(window, "Save MarginPack export as a new HTML file", picker.modeSave);
        picker.appendFilter("HTML document", "*.html");
        picker.defaultExtension = "html";
        picker.defaultString = "annotated-snapshot-marginpack.html";
        const result = await picker.show();
        if (!isCurrent(window, state) || result === picker.returnCancel) {
          return { status: "cancelled" };
        }
        if (result === picker.returnReplace) {
          alert(window, "Choose a new filename for your export. MarginPack never replaces an existing file, so your saved snapshots stay unchanged.");
          return { status: "cancelled" };
        }
        if (result !== picker.returnOK || typeof picker.file !== "string" || !picker.file) {
          throw new ExportError("No destination file was selected. Nothing was saved.");
        }
        try {
          // Exclusive creation also protects existing aliases and files created
          // after the dialog. No sibling temporary file or report is written.
          await ioUtils.writeUTF8(picker.file, output.html, { mode: "create" });
        } catch (error) {
          if (error?.name === "NoModificationAllowedError" || error?.name === "AlreadyExistsError") {
            throw new ExportError("That file already exists. Run the export again and choose a new filename.");
          }
          throw new ExportError("The export could not be saved. Check the destination's permissions and free space, then try a new filename.");
        }
        if (isCurrent(window, state)) {
          const report = output.report;
          const summary = report && Number.isInteger(report.total)
            ? `\n\n${report.total} annotations: ${report.matched} matched, ${report.unresolved} unresolved, ${report.unsupported} unsupported. Review the status of each annotation in the exported file.`
            : " Review annotation statuses in the exported file.";
          alert(window, "Your standalone HTML export is saved. Open it in a browser." + summary);
        }
        return { status: "saved", report: output.report };
      } catch (error) {
        if (isCurrent(window, state)) {
          alert(window, error instanceof ExportError
            ? error.message
            : "MarginPack could not finish this export. No Zotero items or annotations were edited. Check the selected snapshot and try again.");
        }
        return { status: "error" };
      } finally {
        state.busy = false;
        if (isCurrent(window, state)) updateMenus(state);
      }
    }

    function addWindow(window) {
      if (!active || window.closed || windows.has(window)) return;
      const document = window.document;
      const tools = document.getElementById("menu_ToolsPopup");
      if (!tools) return;
      const state = { menus: [], listeners: [], busy: false, core: null, previousCore: undefined };
      windows.set(window, state);
      for (const [index, popup] of [tools, document.getElementById("zotero-itemmenu")].entries()) {
        if (!popup) continue;
        const menu = document.createXULElement("menuitem");
        menu.id = MENU_IDS[index];
        menu.setAttribute("label", LABEL);
        const command = () => { void exportSelected(window); };
        menu.addEventListener("command", command);
        popup.appendChild(menu);
        state.menus.push(menu);
        state.listeners.push([menu, "command", command]);
        if (index === 1) {
          const show = event => {
            if (event.target !== popup) return;
            menu.hidden = false;
            updateMenus(state);
          };
          popup.addEventListener("popupshowing", show);
          state.listeners.push([popup, "popupshowing", show]);
        }
      }
    }

    function removeWindow(window) {
      const state = windows.get(window);
      if (!state) return;
      windows.delete(window);
      for (const [target, event, listener] of state.listeners) {
        target.removeEventListener(event, listener);
      }
      for (const menu of state.menus) menu.remove();
      if (state.core && window.MarginPack === state.core) {
        if (state.previousCore) Object.defineProperty(window, "MarginPack", state.previousCore);
        else delete window.MarginPack;
      }
      state.menus.length = 0;
      state.listeners.length = 0;
      state.core = null;
      state.previousCore = undefined;
    }

    return {
      start(uri) {
        if (active) return;
        rootURI = uri;
        active = true;
        for (const window of zotero.getMainWindows()) addWindow(window);
      },
      stop() {
        active = false;
        for (const window of windows.keys()) removeWindow(window);
        rootURI = "";
      },
      addWindow,
      removeWindow,
      exportSelected
    };
  }

  return { createController, selectSnapshot, readSnapshot, isHTMLAttachment };
})();

var marginPackController = null;

function install() {}
function uninstall() {}

function startup({ rootURI }) {
  marginPackController = MarginPackAddon.createController({
    zotero: Zotero,
    services: Services,
    chromeUtils: ChromeUtils,
    ioUtils: IOUtils
  });
  marginPackController.start(rootURI);
}

function onMainWindowLoad({ window }) {
  marginPackController?.addWindow(window);
}

function onMainWindowUnload({ window }) {
  marginPackController?.removeWindow(window);
}

function shutdown() {
  marginPackController?.stop();
  marginPackController = null;
}
