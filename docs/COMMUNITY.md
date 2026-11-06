# Community announcement material

**Historical drafts only.** Development and promotion were discontinued on 2026-11-06. Do not post the text below or resume channel setup. No Zotero Forums or X announcement was published. See the [project decision](CLOSEOUT.md).

The text below describes the released product and its limits. Check the latest release and search the target community for an existing MarginPack thread before posting. Keep one relevant announcement thread and follow replies there; do not repeat advertisements in old feature-request threads or solicit stars through unsolicited messages. Follow each community’s current contribution and AI-assistance rules.

## Zotero Forums

Suggested title: **MarginPack: take existing webpage annotations with the saved page**

MarginPack is an experimental, MIT-licensed add-on that exports a downloaded Zotero HTML snapshot and its existing annotations into one offline HTML reader. The recipient can read the saved page, click a highlight and see its comment without installing Zotero or using a hosted service.

The export keeps a record for every annotation, including unresolved and unsupported ones. It uses the selected snapshot’s application APIs, checks recorded text positions and available quotes, and does not modify the source items or replace existing destination files. Sidebar search and filters change visibility; they do not remove private content from the file.

Version 0.1.2 improves quotations across line breaks and paragraphs, offline section/footnote links, language and reading direction, keyboard focus and suggested filenames. It also includes a manually copyable troubleshooting summary that excludes source content and identifiers.

- [Download the XPI or the original synthetic no-install demo](https://github.com/feiiiiii5/marginpack/releases/tag/v0.1.2)
- [First export and troubleshooting](https://github.com/feiiiiii5/marginpack/blob/main/docs/QUICKSTART.md)
- [Exact validation environments and remaining test seams](https://github.com/feiiiiii5/marginpack/blob/main/docs/VALIDATION.md)

The current target is Zotero 10.0.x, with actual application checks pinned to 10.0.7. It supports single-file UTF-8 HTML snapshots. PDF/EPUB, original page scripts/CSS, live resource fetching, export editing/import and complete printing are outside this release. Review source text, comments, tags and URLs before sharing an export.

This is an independent third-party project, unaffiliated with Zotero or SingleFile, built with AI coding assistance. Reproducible feedback is welcome through [GitHub issues](https://github.com/feiiiiii5/marginpack/issues/new/choose); please use original synthetic examples instead of private library content.

## Short Chinese social post

Copyable text (under 280 weighted characters, allowing a shortened URL):

```text
MarginPack：把 Zotero 已有网页批注和快照一起导出成离线 HTML，接收方用浏览器查看原文与评论。

实验版，仅支持 UTF-8 HTML 快照。MIT 开源，AI 辅助开发。

https://github.com/feiiiiii5/marginpack
```

## Channel checks recorded 2026-11-06

Zotero’s [plugin page](https://www.zotero.org/support/plugins) points to its forums for announcements. The [forum guidelines](https://www.zotero.org/support/forum_guidelines) ask participants to avoid redundant threads and follow up on replies. A forum announcement needs an authenticated account; no announcement was submitted while logged out.

X’s [automation rules](https://help.x.com/en/rules-and-policies/x-automation) prohibit non-API website automation. Without an approved API connection, publish the short post manually rather than automating the website. No X post was sent.
