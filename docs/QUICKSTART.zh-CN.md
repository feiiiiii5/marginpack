# 第一次使用 MarginPack

[项目说明](../README.zh-CN.md) · [English guide](QUICKSTART.md) · [验证与兼容性记录](VALIDATION.md)

MarginPack 把一个已有的 Zotero HTML 网页快照及其批注，导出为独立阅读文件。插件面向 Zotero **10.0.x**；实际验证过的版本和系统见验证记录。它不负责保存在线网页，也不导出 PDF／EPUB 批注。

## 1. 安装发布的插件

1. 打开 [MarginPack Releases](https://github.com/feiiiiii5/marginpack/releases)，阅读版本的实验状态和兼容性说明。
2. 下载以 `.xpi` 结尾的版本附件。源码 ZIP 不是插件安装包。
3. 在 Zotero 中打开 **工具 → 插件（Tools → Plugins）**，把下载的 `.xpi` 拖进插件窗口，并按 Zotero 的安装提示操作。
4. 回到 Zotero 资料库主窗口，在工具菜单中找到 **Export annotated snapshot with MarginPack…**。

安装方式依据 Zotero 的[官方插件说明](https://www.zotero.org/support/plugins)。插件有较广的应用访问权限，请从可信来源安装。也可以先下载版本附件 `marginpack-demo.html`，用浏览器在本地体验，无需安装插件；其中的页面与批注均为原创合成示例。

## 2. 选中保存的快照

在资料库主窗口展开父条目的附件，选中**一个已经下载的 HTML 快照附件**。也可以选中仅包含一个 HTML 快照的父条目。如果父条目包含多个 HTML 快照，应直接选中要导出的那个附件。

网页**链接**保存网址，**快照**保存当时的页面副本，区别见 Zotero 的[官方说明](https://www.zotero.org/support/kb/links_vs_snapshots)。只有链接时，需要先用 Zotero 保存快照；文件尚未下载到这台电脑时，先在 Zotero 中下载。

插件读取所选快照已有的批注。可以先在 Zotero 快照阅读器中确认批注，再回到资料库选中附件导出。它不会从其他附件转移批注，也不会替你重新标注页面。

## 3. 另存为新的 HTML 文件

1. 点击 **工具 → Export annotated snapshot with MarginPack…**，或所选条目右键菜单中的同名操作。
2. 在系统保存窗口中选择一个**尚不存在、以 `.html` 结尾的新文件名**。保留 Zotero 原快照作为可编辑的原件。
3. 等待保存成功提示和批注数量。取消保存不会生成文件。选择已有文件时，即使系统让你确认替换，MarginPack 仍会拒绝覆盖；需要重新导出并选择新文件名。
4. 用 Chromium 或 Firefox 打开保存的 HTML，检查结果后再分享。

## 4. 核对结果并分享

侧栏为每条输入批注保留一条记录：

| 状态 | 含义 | 如何检查 |
| --- | --- | --- |
| **Located**（`matched`，已定位） | 支持的选择器成功定位；存在引文时，会核对引文与选中文本。 | 点击高亮或 **Jump to text** 查看上下文。没有引文的记录，其位置无法通过引文独立核验。 |
| **Unresolved**（未恢复） | 无法确认记录的位置或引文。 | 阅读卡片原因，并与 Zotero 原件对照。记录仍保留，插件不会猜测替代位置。 |
| **Unsupported**（不支持） | 批注类型或选择器不在支持范围内。 | 可用的文字和评论仍显示，但原始视觉表现可能缺失。 |

总数包含未恢复和不支持的记录。搜索与筛选只改变显示内容，**不会从文件中删除私人信息**。发送前检查原文、评论、标签、来源网址和文件名，并确认你有权分享其中的内容。

分享时发送这一个导出的 `.html` 文件即可。接收方应先下载，再用浏览器打开本地文件；邮件或网盘的预览界面可能无法运行阅读器。阅读不需要安装 Zotero 或注册账号。导出物不会自动请求网络；主动打开来源网址可能会联网。

阅读器是只读的。网页或 Zotero 批注后续变化不会自动反映在旧文件中，需要重新导出。原网页样式、脚本及不支持的媒体会被移除。尚未验证完整的浏览器打印或**另存为 PDF**；若尝试，请逐页检查内容是否齐全。

## 阅读操作

- 点击高亮可选中对应批注；同一区域有重叠批注时，重复点击会依次切换。
- 使用 **Search notes & quotes** 搜索框和状态筛选缩小侧栏范围。
- 按 **H** 显示／隐藏高亮，按 **[** 跳到上一条已定位批注，按 **]** 跳到下一条。在搜索框中输入时，这些快捷键不会触发。
- 使用 **Tab** 移动到控件，使用 **Enter** 激活获得焦点的按钮或原文链接。指向快照内章节的链接会在文件内跳转；外部链接先显示预览，再由你明确选择打开。按 **Escape** 或点击 **Close** 可将焦点返回原链接。
- 展开 **Troubleshooting summary** 可选中并手工复制版本、数量以及按序号记录的类型／状态。摘要不包含原文、来源信息、标识符或来源 hash，也不会发送任何内容。发布前仍请检查；它不会删改阅读文件中的私人信息。
- 展开 **Export details & limitations** 可查看导出器版本和内容范围。来源 SHA-256 用来标识原始输入，不证明内容真实、完整或可以公开传播。

## 常见问题

| 提示或现象 | 处理方式 |
| --- | --- |
| “Select one saved HTML snapshot…” | 在资料库主窗口选中一个附件，或仅含一个 HTML 快照的父条目。 |
| “This item has more than one HTML snapshot.” | 展开父条目，直接选中具体的 HTML 快照附件。 |
| “This item has no saved HTML snapshot.”／“This item is not a saved HTML snapshot.” | 选择已保存的 HTML 附件；网页链接、PDF 和 EPUB 不属于此类快照。 |
| “The snapshot file is not available…”／“The saved snapshot could not be read.” | 先通过 Zotero 打开或下载附件，确认本地文件可用，再重试。MarginPack 不负责下载。 |
| “The selected snapshot is empty…”／“The snapshot is not readable UTF-8 HTML.” | 当前输入不符合可读 UTF-8 快照范围。保留原件；不要覆盖或手工转码后假定旧批注位置仍然有效。 |
| “The snapshot changed while it was being read.” | 等下载或其他文件操作结束后重试。 |
| “The system save dialog failed.” | 本次未保存文件。从资料库主窗口重试；持续失败时，在反馈中提供版本与操作系统。 |
| “Choose a new filename…”／“That file already exists.” | 重新导出，选择不存在的新文件名。插件拒绝替换已有文件。 |
| “The export could not be saved.” | 检查目标位置的写入权限和剩余空间，换到可写文件夹并使用新文件名重试。 |
| 出现未恢复或不支持的卡片 | 阅读每张卡片的具体原因。支持的批注类型为高亮、下划线和文字便笺；PDF／EPUB 批注及绘图类型不在本版范围内。缺少的表现仍以原件为准。 |
| 打开后显示源码，或预览中没有阅读器 | 先下载文件，再用浏览器的“打开文件”操作打开。使用已验证的浏览器，不依赖附件预览。 |

仍有问题时，可提交[导出问题反馈](https://github.com/feiiiiii5/marginpack/issues/new/choose)。提供 MarginPack 与 Zotero 版本、操作系统、浏览器、复现步骤、原始错误提示和批注数量／状态原因；必要时使用自己编写的最小合成示例。不要公开资料库、导出文件、私人原文、评论、标签、网址、本地路径或凭据。如果来源指纹也可能暴露敏感材料，请一并省略来源 hash。另见[贡献说明](../CONTRIBUTING.md)和[安全反馈方式](../SECURITY.md)。
