# 贡献与发布

欢迎补充译文、反馈真实界面漏翻和适配新版客户端。提交前说明 Devin / VS Code / 工具版本、页面位置、英文原文和复现方式；证据先移除私有内容。

## 修改入口

网页补充维护 `data/web-reviewed.zh.json`、`data/web-shortcuts.zh.json`、`data/web-settings.zh.json`；这些词典也供客户端读取。导航/菜单用 `data/display.zh.json`，客户端专用词条用 `data/strings/z-reviewed.json`，按路径资源用 `data/i18n.zh.json`，编辑器补充用 `data/nls/`。

原始 `web/upstream/` 和 `data/web-dictionary.js` 保留来源，不在生成脚本中单独维护译文。客户端现有人工词典优先，因此个别短词在两端可能有不同译法；调整时核对语境。

能力说明及名称保护用 `data/model-descriptions.zh.json`；模型列表句式保持锚定，名字和版本不翻译。`data/settings-display.zh.json` 是客户端已证明的设置行/按钮使用的小词表，不把全量词典内联到动态展示出口。NLS 包里原样英文允许人工回退，真实官方译文保持优先。

只翻译已确认的界面展示位置。保留占位符、标签和链接；不改内部值、权限、ID、URL、回调、提示词、正文、编辑草稿和用户名称。无法证明的结构保留英文，不能以全局替换绕过识别器。

## 检查

```powershell
npm ci --ignore-scripts
npm test
npm run build:userscript
node web/build.js dist
npm run release:check
node web/serve-fixture.js
```

浏览器打开验证服务打印的地址，确认 DOM 检查通过。运行时代码变化后重启服务再验收。把更新后的源码、词典及 `dist/` 生成副本一起提交；CI 会比较生成结果，避免源码与下载脚本漂移。

客户端修改还要在目标构建执行 `doctor` 和 `prepare`，核对报告。只有退出客户端、实际应用并完成启动和模式菜单检查，才能记录为实机通过。没有客户端安装的 CI 只执行模拟回归，不能证明其他版本兼容。

## 公开发布

1. 只更新 `package.json` / `package-lock.json` 的统一发布版本。网页 `@version`、桌面窗口、下载包名及标签均从这一个版本产生，不另设网页版本；记录 `CHANGELOG.md` 和验证边界。
2. 执行检查、生成 `dist/`，检查 Git 暂存区和历史，提交源码。不要提交 `.devin-zh.local.json`、`.env`、`cache/`、安装文件、VSIX、日志或账号资料。
3. 在干净工作区运行 `npm run build:release`。工具包通过 `git archive HEAD` 生成，只包含版本控制的项目源码；`release-assets/` 不入库。
4. 推送源码，等待 Windows / macOS / Linux 的 Node 22/24 检查通过，创建与工具版本一致的 `vX.Y.Z` 标签并推送。Release 工作流发布网页 `.user.js`、Windows 双击 ZIP、macOS 检查预览 ZIP、构建报告和 `SHA256SUMS`。macOS 入口须保留 Git 可执行位，Windows `.cmd` 须在仓库及 ZIP 中保留 CRLF。
5. 核对实际 GitHub Release 的公开状态、下载内容及校验值。不要把工作流已启动当作发布完成。

发布工具包不重新分发 Devin 官方程序或微软语言包。升级工具时保留原有本机安装缓存，重新生成准备报告。

Windows 图形入口源码是 `scripts/launcher-windows.cs`，系统 .NET Framework 在本机缓存生成窗口；后台协议在 `scripts/gui-backend.js`，CLI `--progress` 发出真实步骤事件。语言包获取在 `scripts/language-pack.js`，只从微软获取翻译数据、严格匹配版本，不执行扩展。进度不能编造预计百分比；GUI 改动要做真实窗口及准备/退出/应用边界验收。`cache/gui/`、语言包和日志不得发布。

共享图标母版与导出格式在 `assets/`，维护方法见 [图标说明](assets/README.md)。Windows 生成程序的缓存指纹包含源码及 ICO；网页构建将 32/64px PNG 内嵌为脚本元数据。换图标后同时重新导出格式、构建 `dist/`，并检查真实 Windows 窗口。macOS 图标素材不代表 `.command` 具有原生图形窗口。
