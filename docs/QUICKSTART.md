# First export with MarginPack

[Project README](../README.md) · [中文指南](QUICKSTART.zh-CN.md) · [Validation and compatibility](VALIDATION.md)

MarginPack exports one existing Zotero HTML snapshot and its annotations into a standalone reader. It targets Zotero **10.0.x**; check the validation record for the exact versions and platforms exercised. It does not save live webpages or export PDF/EPUB annotations.

## 1. Install the released plugin

1. Open [MarginPack Releases](https://github.com/feiiiiii5/marginpack/releases) and read the release's experimental-status and compatibility notes.
2. Download the release attachment ending in `.xpi`. The source-code ZIP is not the plugin installer.
3. In Zotero, open **Tools → Plugins**, then drag the downloaded `.xpi` onto the Plugins window. Follow any installation prompt shown by Zotero.
4. Return to Zotero's main library window and look for **Tools → Export annotated snapshot with MarginPack…**.

This follows Zotero's [plugin installation instructions](https://www.zotero.org/support/plugins). Plugins have broad application access; install releases only from a source you trust. You can first try the release's `marginpack-demo.html` locally without installing the plugin. That demo contains original synthetic material.

## 2. Select the saved snapshot

In the main library window, expand the parent item's attachments and select **one downloaded HTML snapshot attachment**. Alternatively, select one parent item containing exactly one HTML snapshot. If the parent has several HTML snapshots, select the specific attachment instead.

A webpage **link** stores a URL; a **snapshot** stores the saved page. See Zotero's [links and snapshots explanation](https://www.zotero.org/support/kb/links_vs_snapshots). If you have only a link, save a snapshot using Zotero first. If its file is not on this computer, download it through Zotero before exporting.

MarginPack uses annotations already attached to the selected snapshot. Check them in Zotero's snapshot reader, then return to the library selection for export. It does not transfer annotations from another attachment or annotate a page for you.

## 3. Save a new HTML file

1. Choose **Tools → Export annotated snapshot with MarginPack…**, or the same action in the selected item's context menu.
2. In the system save window, choose a **new filename ending in `.html`**. Keep the original Zotero snapshot as your editable source.
3. Wait for the saved-file confirmation and annotation counts. Cancelling the save window saves nothing. Choosing an existing file is refused, even if the operating system asks you to confirm replacement; run the export again with a new filename.
4. Open the saved HTML in Chromium or Firefox and review the result before sharing.

## 4. Review and share

The sidebar keeps a record for every input annotation:

| Status | Meaning | What to review |
| --- | --- | --- |
| **Located** (`matched`) | A supported selector resolved. An available quote is checked against the selected text. | Select the highlight or **Jump to text** and inspect the context. A missing quote limits independent verification. |
| **Unresolved** | The recorded location or quote could not be verified. | Read the reason on its card and compare with Zotero. Its record remains visible; MarginPack does not guess a replacement location. |
| **Unsupported** | The annotation type or selector is outside the supported format. | Its available text and comment remain visible, but its original visual representation may be absent. |

The total includes unresolved and unsupported records. Searching and filtering change what you see; **they do not remove private content from the file**. Review the source text, comments, tags, source URLs and filename before sending it. Do not share material you lack permission to redistribute.

Send the single exported `.html` file. The recipient should download it, then open the local file in a browser; an email or cloud-storage preview may not run the reader. Reading needs no Zotero installation or account. The export makes no automatic network requests. Opening a source URL is an explicit action and may use the network.

The reader is read-only. It does not update when the original webpage or Zotero annotations change; create a new export to share later changes. Original page styling, scripts and unsupported media are omitted. Complete browser printing or **Save as PDF** has not been validated; inspect every page if you try it.

## Reader controls

- Click a highlight to select its annotation; repeated clicks on an overlap cycle through its annotations.
- Use **Search notes & quotes** and the status filter to narrow the sidebar.
- Press **H** to show or hide highlights, **[** for the previous located annotation, and **]** for the next. Shortcuts do not apply while typing in the search field.
- Use **Tab** to reach controls and **Enter** to activate a focused button or source-text link. Links to a section in the saved page stay inside it. External links first show a preview with an explicit open action; **Escape** or **Close** returns focus to the original link.
- Open **Troubleshooting summary** to select and manually copy the exporter version, counts and numbered type/status records. Source content, metadata, identifiers and the source hash are excluded. Nothing is sent. Review the summary before posting it; it does not redact the reading file itself.
- Open **Export details & limitations** for the exporter version and supported content boundary. The displayed source SHA-256 identifies the original input; it does not certify its truth, completeness or permission to share.

## Troubleshooting

| Message or symptom | Next step |
| --- | --- |
| “Select one saved HTML snapshot…” | Select one attachment, or one parent with exactly one HTML snapshot, in the main library window. |
| “This item has more than one HTML snapshot.” | Expand the parent and select the exact HTML attachment. |
| “This item has no saved HTML snapshot.” / “This item is not a saved HTML snapshot.” | Select a saved HTML attachment. A webpage link, PDF or EPUB is not an HTML snapshot. |
| “The snapshot file is not available…” / “The saved snapshot could not be read.” | Open or download the attachment through Zotero and confirm the local file is available, then retry. MarginPack does not download it. |
| “The selected snapshot is empty…” / “The snapshot is not readable UTF-8 HTML.” | This input is outside the supported readable UTF-8 snapshot boundary. Keep the original; do not overwrite or manually re-encode it expecting old annotation locations to remain valid. |
| “The snapshot changed while it was being read.” | Let the download or other file operation finish, then retry. |
| “The system save dialog failed.” | No file was saved. Retry from the main library window. If it persists, include your versions and operating system in a problem report. |
| “Choose a new filename…” / “That file already exists.” | Run export again and choose a filename that does not exist. MarginPack refuses replacement. |
| “The export could not be saved.” | Check destination permissions and available space; retry with a new filename in a writable folder. |
| Unresolved or unsupported cards | Read each card's reason. Supported annotation types are highlights, underlines and text notes; PDF/EPUB annotations and drawing types are outside this release. Keep the original for any missing representation. |
| File opens as source text, or a preview shows no reader | Download the file and use your browser's **Open File** action. Try a tested browser rather than the attachment preview. |

If a problem remains, open an [export problem report](https://github.com/feiiiiii5/marginpack/issues/new/choose). Include MarginPack and Zotero versions, operating system, browser, steps, exact error and annotation counts/status reasons. Use a small original synthetic example if needed. Do not post your library, exported file, private source text, comments, tags, URLs, local paths or credentials. Omit the source hash too if identifying the underlying material is sensitive. See [contribution guidance](../CONTRIBUTING.md) and [security reporting](../SECURITY.md).
