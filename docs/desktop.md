# Devin Desktop 客户端汉化

这份指南用于 Windows 上的 Devin Desktop：为本地 Agent 界面、聊天面板和编辑器框架生成简体中文补丁。工具先核对原版、生成报告，再在退出客户端后写入；原版及每次操作前的备份保存在本地，支持恢复。

浏览器中的 Devin 网页请使用[油猴脚本指南](../web/README.md)。客户端中加载的云端网页与本地 Agent 界面是不同来源，目前不会通过修改客户端来给跨源网页注入脚本。

## 当前验证范围

| 项目 | 已确认的范围 |
| --- | --- |
| 操作系统 | Windows |
| 客户端构建 | Devin Desktop 3.10.48 / VS Code 1.126.0 |
| 已应用并启动验收的补丁 | 工具 0.3.0，已核对客户端启动及本地界面 |
| 本次发布的工具 | 0.3.8，支持恢复首次提示并让用户选择是否不再提醒，汉化补丁逻辑未变；用户确认桌面汉化正常 |
| 其他客户端版本 | 需要重新执行兼容检查及启动验收，没有通用兼容承诺 |

词典可以复用，生成的安装补丁必须对应当前客户端构建。更新 Devin 后不能直接复制旧补丁或旧报告。

0.3.4 补齐设置行/按钮的 71 条显示词典，并在已证明的能力菜单出口翻译动态小字介绍。`Normal`、`Agent`、`Fusion`、`Ultra`、`Lite` 和模型名保持英文，内部模式值与回调不变。NLS 语言包原样英文不会再挡住已审校的人工补翻。

## 1. 获取工具并指定安装目录

需要 Node.js 22.13 或更新版本（推荐 24），以及能够正常启动的官方 Devin Desktop。可以下载 [Release](https://github.com/GoodWay0223/devin-zh/releases/latest) 中的客户端工具 ZIP 并解压到长期保留的目录，进入其中的 `devin-zh` 文件夹，执行 `npm ci --ignore-scripts`。也可以使用 Git 克隆，打开 PowerShell：

```powershell
git clone https://github.com/GoodWay0223/devin-zh.git
Set-Location devin-zh
npm ci --ignore-scripts
```

设置 `DEVIN_APP` 为自己机器上真实的 `resources\app` 目录。以下路径仅为示例，请替换后运行；不要填 `Devin.exe` 文件本身。

```powershell
$env:DEVIN_APP = 'D:\Apps\Devin\resources\app'
Test-Path -LiteralPath "$env:DEVIN_APP\product.json"
```

检查应返回 `True`，该目录还应有 `package.json` 和 `out`。环境变量只在当前 PowerShell 会话中生效；换终端后需要重新设置。未指定时默认查找当前用户的 `%LOCALAPPDATA%\Programs\Devin\resources\app`，自定义安装应明确指定。

如需保留本机路径，可在项目根目录创建 `.devin-zh.local.json`：`{"appRoot":"D:/Apps/Devin/resources/app"}`，替换为真实绝对路径。该文件被 Git 忽略；`DEVIN_APP` 的优先级更高。

仓库和发布包不包含 Devin 安装文件、你的本机备份或微软语言包。依赖通过锁文件安装；常规准备、应用和恢复过程在本机完成，不需要运行在线机翻命令。

## 2. 先执行只读检查

```powershell
node src/cli.js status
node src/cli.js doctor
```

`status` 区分官方原版、工具记录且经过验证的汉化文件，以及未知或缺失的文件。`doctor` 检查安装完整性、Agent 界面结构和编辑器语言包，两个命令都不会修改安装文件，可以在客户端运行时使用。

首次使用必须能够验证当前构建的官方原版。已有其他汉化、手工修改、来源不明的 `.bak-zh`，或者缺少可信原版时，工具会停止，不会把修改过的文件当作原版备份。先通过同版本官方安装包恢复客户端，并确认原版能正常启动。

如果 `doctor` **只有 NLS 语言包缺失或版本不匹配**，可以先进行下面的 Agent 界面汉化。发现未知文件、原版校验失败或 Agent 结构不兼容时，应先解决相应问题。

## 3. 生成补丁，暂不写入客户端

只汉化本地 Agent 界面和聊天面板：

```powershell
node src/cli.js prepare --scope=web
```

这里的 `web` 指客户端内的两份本地界面脚本，不是浏览器油猴脚本；这一范围不需要 NLS 语言包。准备过程验证原版、创建不可变备份，并将生成文件和 `report.json` 写入项目的 `cache`，**不会覆盖客户端安装文件**。

检查命令打印的报告路径及报告内容：

- 安装构建、工具版本和目标文件是否符合预期。
- 翻译数量、结构兼容结果及被拒绝的译文是否合理。
- 不支持的结构和不符合占位符、标签契约的译文应保留原样。

运行项目检查：

```powershell
npm test
```

### 可选：同时汉化编辑器框架

编辑器菜单及框架使用 NLS 资源。另行取得微软的[适用于 VS Code 的中文（简体）语言包](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)，其版本的 **major/minor 必须与客户端内 VS Code 版本一致**，而不是与 Devin Desktop 版本号一致。例如，内置 VS Code 为 `1.126.0` 时，需要 `1.126.x` 的语言包。

将 VSIX 解压到本地目录，保留完整的 `extension` 结构，尤其是 `extension/package.json` 和 `extension/translations/main.i18n.json`。设置语言包路径后重新检查：

```powershell
$env:DEVIN_ZH_PACK = 'D:\LanguagePacks\zh-hans\extension\translations\main.i18n.json'
node src/cli.js doctor
node src/cli.js prepare --scope=all
```

请把示例替换为实际解压路径。工具同时核对应用和语言包的版本元数据、NLS 的 JS/JSON/keys 对应关系；只复制 `main.i18n.json` 不够。默认的 `prepare` 相当于 `--scope=all`，包含 Agent 界面和 NLS；`--scope=nls` 只准备编辑器框架资源。

无法取得匹配语言包时，可继续使用已通过检查的 `--scope=web` 范围，保留框架部分的原有语言。

## 4. 完全退出后应用准备报告

保存正在进行的工作，关闭 Devin Desktop 的所有窗口，并确认客户端已完全退出。只最小化窗口不够；工具发现对应安装目录的 Devin 进程仍在运行时会拒绝写入。

把刚刚打印的报告完整路径填入下面的命令：

```powershell
$preparedReport = 'D:\Projects\devin-zh\cache\plans\当前安装标识\web-当前摘要\report.json'
node src/cli.js apply --prepared="$preparedReport"
```

该路径只是格式示例，不是可直接使用的报告。应用时会再次核对安装标识、工具版本、原版和生成文件的哈希；应用或工具更新后，旧报告可能被拒绝，此时重新 `prepare`，不要手改报告绕过检查。

写入会保存操作前备份并验证结果，发生错误时尝试回滚。重新打开 Devin，检查启动、会话列表、聊天输入框和模式菜单，再执行：

```powershell
node src/cli.js status
```

准备和自动化检查通过不能替代这一轮实机启动及界面验收。

## “Devin 安装似乎损坏。请重新安装。”

Agent 界面补丁会改变官方完整性检查覆盖的脚本，因此即使文件是工具生成并验证过的补丁，客户端仍可能弹出这条通知。项目保留官方 `product.checksums`，不会伪造校验值或关闭完整性检查。

用 `status` 判断差异来源：如果只有已记录、经过验证的补丁差异，这条提示本身不能证明安装损坏；如果出现未知或缺失的文件，应继续排查。需要恢复官方原版时使用下面的 `restore`。

### 首次提示，由用户选择当前构建不再提醒

Devin 内置 `integrityService` 显示偏好：`dontShowPrompt: true` 仅在 `commit` 与当前构建一致时生效。完整性计算和日志仍会执行，`isPure` 仍会如实反映修改。当前 3.10.48 原始元数据缺少 `checksumFailMoreInfoUrl`，因此采用没有选择按钮的通知分支。

使用 **Node.js 22.13+ 或 24+**。先保存工作并完全退出 Devin，在本项目目录、已指定正确 `DEVIN_APP` 的 PowerShell 中执行：

```powershell
node scripts/integrity-notice.js status # 只读查看是否已对当前构建静音
node scripts/integrity-notice.js enable-choice # 备份后启用原生选择按钮
```

工具先核对已验证补丁和全部官方校验项，拒绝未知安装修改/缺失及未确认的原生机制。`enable-choice` 只为 `product.json` 补上本站客户端指南的 HTTPS 说明链接，不更改 commit、checksums、校验代码或汉化文件；已有非空说明链接保留原样。采用先写完整临时文件再替换的方式，发现期间元数据变化时拒绝覆盖。

下次打开仍显示原有警告，可选择【更多信息】和【不再显示】。后者是原生次要动作，可能位于通知的更多操作菜单中；点选后才记录当前 commit 的不再提示偏好。只关闭通知而不点选时，后续启动仍可能提醒。原生按 commit 识别构建，不是按 Devin 版本号字符串判断。

官方更新可能还原这项说明链接。更新汉化后如缺少选择，可先检查新版安装，再完全退出并重新运行 `enable-choice`。它不会清空你已点击的“不再显示”偏好。

### 0.3.7 曾直接静音时，恢复初次提示

`mute` 是直接设置不再提示的可选命令，不是 `enable-choice` 的默认行为。若之前使用过 `mute`，其打印的 `restore.json` 保存在 `cache/notice-preferences/`，可撤销后恢复首次提示。该目录可能含私有数据库备份，**不要公开上传**。

如要撤销，完全退出 Devin，把命令打印的真实恢复记录路径填入：

```powershell
node scripts/integrity-notice.js undo '刚打印的 restore.json 完整路径'
```

撤销只恢复这次显示偏好，保留期间对其他设置的更改；发现该偏好后来已被修改时停止。默认 Windows 用户目录为 `%APPDATA%\Devin`，自定义 user-data-dir 不适用此默认路径。

2026-10-10 本机已撤销直接静音并补说明链接。product.json 仅此字段变化，其他构建信息/校验表以及五份检查/汉化文件哈希不变；隔离运行原生通知方法验证两项动作及按当前 commit 存储选择，尚未在启动窗口实机验收。

## 恢复与中断处理

完全退出 Devin，仍在原项目目录、仍设置了正确 `DEVIN_APP` 的终端中执行：

```powershell
node src/cli.js restore
node src/cli.js status
```

`restore` 从当前构建的可信原版恢复四个目标文件，并保留恢复前备份。它不是整套软件重装，也不会清理你的账号、会话或其他用户数据；遇到未知修改时会停止。

如果操作被断电、终端关闭等情况中断，工具提示存在未完成的写入日志，先退出客户端并执行：

```powershell
node src/cli.js recover
node src/cli.js status
```

`recover` 按操作日志恢复到那次写入之前的状态，该状态也可能是上一次汉化版本。想恢复官方原版时，再运行 `restore`。恢复过程只接受日志记录的前后状态，遇到中断后出现的其他修改会停止。

**保留整个项目的 `cache/installations/`。** 其中有按构建保存的可信原版、应用状态、操作日志和每次操作前备份；不要删除、手动覆盖或混用其他机器的缓存。升级工具时也应保留这份本地缓存。

## Devin 更新后

1. 完成官方更新，先确认原版客户端能够启动。
2. 重新设置当前安装目录；需要 NLS 时，取得与新版 VS Code major/minor 匹配的语言包。
3. 运行 `status` 和 `doctor`，根据兼容结果重新 `prepare` 并检查新报告。
4. 运行 `npm test`，完全退出 Devin，再应用**新报告**。
5. 打开新版客户端进行启动和关键界面验收。

详细处理方式见[更新指南](../UPDATE_GUIDE.md)。对于新结构，维护识别器后再适配；不要以全局替换、复制旧生成文件或关闭完整性校验来解决兼容问题。

## 反馈问题

向 [GitHub Issues](https://github.com/GoodWay0223/devin-zh/issues) 提供工具版本、Devin Desktop / VS Code 版本、复现步骤，以及 `doctor` / `status` 的相关结果。提交日志前删除本机用户名、完整私有路径、项目内容和任何密钥；不要公开上传安装备份或整个 `cache`。
