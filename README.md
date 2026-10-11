# Devin 简体中文汉化

[![检查](https://github.com/GoodWay0223/devin-zh/actions/workflows/ci.yml/badge.svg)](https://github.com/GoodWay0223/devin-zh/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![下载](https://img.shields.io/github/v/release/GoodWay0223/devin-zh)](https://github.com/GoodWay0223/devin-zh/releases/latest)

让 Devin 网页端和 Windows Desktop 的本地 Agent 界面使用简体中文。提供油猴脚本、Windows 双击汉化工具与 macOS 检查预览入口；网页和客户端共用人工词典。

这是社区维护项目，与 Devin / Cognition 官方无隶属关系。

| 入口 | 当前版本 | 使用方式 |
| --- | --- | --- |
| **网页油猴脚本** | **1.0.13** | 在 Tampermonkey 安装单文件脚本，刷新 Devin 网页 |
| **Windows 客户端工具** | **0.4.0** | 双击 `Start-Windows.vbs`，按钮窗口、自动中文资源、步骤与下载进度 |
| **macOS 客户端预览** | **0.4.0** | 双击 `Start-macOS.command`，资源自动准备，暂不写入 `.app` |

**[下载最新发布版](https://github.com/GoodWay0223/devin-zh/releases/latest)** · **[解压后运行哪个文件](START_HERE.md)** · [网页使用与维护](web/README.md) · [客户端详细安装](docs/desktop.md) · [更新后重新汉化](UPDATE_GUIDE.md)

## 网页端：安装油猴脚本

适用于 `https://app.devin.ai/` 和 `https://app.beta.devin.ai/`。已在 Chrome 上检查，其他浏览器尚未实测。

1. 安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 **[Devin-Web-Zh.user.js](https://raw.githubusercontent.com/GoodWay0223/devin-zh/master/dist/Devin-Web-Zh.user.js)**，在油猴安装页确认安装。也可在 Releases 下载 `Devin-Web-Zh-1.0.13.user.js`，把全文粘贴到油猴的新脚本编辑器后保存。
3. 刷新 Devin 网页。若已有旧版汉化，先导出备份，在原脚本编辑器全选替换并保存；每个页面只启用一份汉化脚本。

覆盖导航、菜单、模式、快捷键、自定义、自动化、审查、安全、知识库及多项组织/个人设置。当前构建含 **1,582 条精确词条、104 条规则**；相较原版 1.0.7 新增 388 条词条并修订 14 条译文。

`Normal`、`Agent`、`Fusion`、`Ultra`、`Lite` 及模型名称保留英文；只汉化能力和模式的介绍、快速模式与套餐等操作文案。模型介绍中列举的名字和版本保留，已确认的句式可在模型更新后继续复用。

翻译在浏览器本地完成，脚本使用 `@grant none`，没有翻译服务请求。消息区域、已识别的会话行/空间卡片/用户文件树、侧栏用户名称和状态、代码、终端和输入草稿均受保护；PR 和自动化名称也不翻译。通用侧栏布局容器会继续遍历，固定导航、操作按钮和设置说明可以汉化。新页面或未知结构可能保留英文。

**1.0.11 存在侧栏排除过宽的回归，可能造成大量固定界面漏翻，不推荐使用。** 1.0.12 撤回整块通用侧栏及 `tree/session-id` 布局排除，恢复 1.0.10 使用的 RAF 调度，每批目标约 3 ms / 128 个节点。保留入队前保护、缓存、自身写入过滤和单实例清理；突发更新只合并局部 UI 子树，不重新扫描整页。独立验证中 20,000 次受保护文字更新及 500 个新增会话按钮不增加翻译规则检查或遍历；这不能等同于真实 Devin 页面的加载时间/FPS 对照测量。

**更新采用手动安装。** 保留原版的脚本名称及 namespace 以方便替换，关闭上游自动更新，避免覆盖本项目的修改。更新时从本仓库或 Releases 取得新脚本，替换、保存、刷新；停用脚本即可撤销网页汉化。

**1.0.13 针对动态侧栏减少重复处理**：属性更新只处理当前元素，移除的虚拟列表节点及时清队列，祖先和子节点的扫描合并；固定 Recent 分组标题可翻译，会话标题仍保持原文。模拟 500 个按钮、20 轮属性变化不再新增子树遍历。当前真实 Chrome 中 Recent 在两种排序下都为空，并出现登录令牌错误；未复现“切换排序立即恢复”，因此此优化不能视为已经解决会话列表的数据加载问题。已安装油猴版本尚无法核对，新脚本需手动替换后验收。

## 客户端：汉化本地 Agent 界面

**Windows 快速开始**：下载 `Devin-Desktop-Zh-Windows-0.4.0.zip`，解压进入 `devin-zh`，双击 **`Start-Windows.vbs`** 打开按钮窗口。旧 `.cmd` 也会打开同一窗口。默认【完整汉化】自动查找/下载匹配的编辑器中文资源，**不需要进 Devin 手动安装扩展或填写语言包路径**；依赖、安装定位及可信备份接续也自动处理。点【开始汉化】查看步骤进度，准备好后退出 Devin，再点【应用汉化】；恢复用【恢复原版】。首次需要 **Node.js 22.13+（推荐 24 LTS）**；窗口由 Windows 自带 .NET Framework 在本机生成。

**macOS**：下载 `Devin-Desktop-Zh-macOS-Preview-0.4.0.zip`，双击 **`Start-macOS.command`**。终端入口自动准备中文资源并显示步骤，**暂不能直接安装客户端汉化**。官方 `.app` 内资源修改会影响签名；尚无实际 Mac 上的签名、登录及启动验收。详情见 [双击入口说明](START_HERE.md)。

以下命令适用于想自行操作的 Windows 用户，需要正常工作的官方 Devin Desktop：

```powershell
git clone https://github.com/GoodWay0223/devin-zh.git
Set-Location devin-zh
npm ci --ignore-scripts

# 替换为自己机器上真实的 resources\app 目录，不是 Devin.exe
$env:DEVIN_APP = 'D:\Apps\Devin\resources\app'
node src/cli.js status
node src/cli.js doctor

# 仅本地 Agent / 聊天界面，不需要另外安装微软语言包
node src/cli.js prepare --scope=web
npm test
```

`doctor` 同时检查 Agent 结构和可选 NLS 语言包。若只有 NLS 包缺失或不匹配，可先使用 `--scope=web`；原版校验失败或未知安装修改必须先解决。准备命令会输出 `report.json` 路径，创建本机构建的原版备份，但不会覆盖客户端。

查看报告后，保存工作并**完全退出 Devin**，将刚生成的真实报告路径填入：

```powershell
$preparedReport = '刚生成的 report.json 的完整路径'
node src/cli.js apply --prepared="$preparedReport"
```

重新打开 Devin，检查会话、输入框及模式菜单。工具不会替你关闭正在运行的客户端；检测到对应进程时拒绝写入。

编辑器菜单需要与客户端内 **VS Code major/minor 匹配**的微软中文语言资源，Windows 按钮入口会自动取得。手动 CLI 用户也可设置 `DEVIN_ZH_PACK` 再 `prepare --scope=all`，详见[客户端指南](docs/desktop.md)。工具包不附带 Devin 程序、微软语言包或本机缓存。

### 完整性提示与恢复

本地 Agent 汉化会修改官方校验覆盖的两份界面脚本，因而可能出现 **“Devin 安装似乎损坏。请重新安装。”** 通知。工具保留官方校验值，通过 `status` 区分已验证补丁和未知修改，不关闭完整性检查。

希望先显示提示，再自己选择当前构建不再提醒时，完全退出 Devin 后运行 `node scripts/integrity-notice.js enable-choice`。它备份元数据，补上原生提示需要的说明链接，使【更多信息】和【不再显示】选择可用；不会替你点击或预设静音，检测代码和官方校验值不变。原生以构建 commit 判断有效范围。查看、撤销已有静音及私有备份说明见[客户端指南](docs/desktop.md)。

需要恢复时，完全退出 Devin，在同一项目目录执行：

```powershell
node src/cli.js restore   # 恢复当前构建的四个目标文件
node src/cli.js status
```

操作中断时先用 `node src/cli.js recover` 恢复写入前状态。保留本地 `cache/installations/`，其中有可信原版、状态和操作备份；不要把其他版本的旧补丁、旧报告或 `.bak-zh` 覆盖到新版安装。

## 更新后能否继续复用？

**词典和工具流程可以复用，客户端补丁必须按新构建重新生成。**

- **网页更新**：精确词典及动态监听继续工作；漏翻需要核对真实界面，补充词典并重新构建。跨域 iframe、远程电脑画面和 Shadow DOM 不自动翻译。
- **客户端更新**：先确认新版官方程序能启动，再 `doctor` → `prepare` → 检查报告和测试 → 退出 → 应用新报告 → 启动验收。新构建单独保存原版，旧工具版本的报告会被拒绝。
- **结构变化**：解析器无法确认 React、语言资源或展示位置时停止或保留英文。需要适配源码，不能依靠全局替换提高覆盖率。未来任意版本无需维护不在承诺范围内。

网页脚本与客户端共享导航/菜单和人工补充词典，但客户端本地 Agent 与内嵌云端网页属于不同来源；当前没有向客户端跨源网页注入油猴脚本。

## 验证记录

截至 2026-10-11：

| 检查 | 结果与边界 |
| --- | --- |
| 项目回归测试 | 122 项，新增语言包自动发现/下载/版本/ZIP/中断和压缩响应、GUI 完整准备/真实步骤/取消/Windows 编译检查；Windows 专用检查在其他系统跳过 |
| 网页 DOM 回归 | 当前源码在真实 Chrome 的独立验证页 72 项通过；20,000 次正文/会话更新不增加遍历或规则执行，不是 Devin 列表加载验收 |
| 登录态网页检查 | 本次巡查 Recent 在两种排序下均为空，控制台有登录令牌错误；1.0.13 尚未替换用户油猴后验收，不能声称 Recent 数据加载已恢复 |
| 客户端真实启动 | 工具 0.3.0 在 Devin Desktop 3.10.48 / VS Code 1.126.0 完成启动和关键本地界面验证 |
| 本次客户端工具 | 0.4.0 在真实 Windows 按钮窗口完成自动定位、完整资源取得与 5/5 步准备，未点击应用、未重写当前客户端；独立隔离本地包后从微软下载匹配版本成功。macOS 仍仅检查预览 |

检查通过、准备成功和实际应用是不同阶段。其他客户端版本及未打开的详情弹窗仍需验证。发布后的持续检查见 [GitHub Actions](https://github.com/GoodWay0223/devin-zh/actions)。

## 开发与维护

```powershell
npm ci --ignore-scripts
npm test
npm run build:userscript  # 输出到 web/dist/，附 SHA-256 报告
node web/serve-fixture.js # 打开打印的本地地址执行真实 DOM 回归
```

| 文件/目录 | 职责 |
| --- | --- |
| `data/display.zh.json` | 两端共用导航、模式与菜单显示词典 |
| `data/model-descriptions.zh.json` | 两端共用能力/模型说明、名称保护及锚定句式 |
| `data/settings-display.zh.json` | 只供已确认的客户端设置行/按钮显示出口使用 |
| `data/web-reviewed.zh.json`、`web-shortcuts.zh.json`、`web-settings.zh.json` | 网页人工补充，客户端也读取并检查 |
| `data/strings/`、`data/i18n.zh.json`、`data/nls/` | 客户端人工词条、按路径资源和框架补充 |
| `web/runtime.js`、`web/build.js` | 网页显示层引擎及单文件构建 |
| `src/analyze.js`、`runtime.js`、`patch.js` | 语法树识别、React 来源证明和客户端补丁 |
| `src/install.js`、`compatibility.js` | 原版验证、事务、回滚与版本兼容 |
| `dist/Devin-Web-Zh.user.js` | 可直接安装的发布副本，由源码生成 |

既有机翻词典仅作为离线草稿，常规构建/应用不调用在线机翻。贡献译文或适配新版本请看 [CONTRIBUTING.md](CONTRIBUTING.md)。发布脚本检查公开文件和生成结果，CI 比较生成脚本并验证三个系统的入口；标签发布生成网页脚本、Windows ZIP、macOS 预览 ZIP 及 `SHA256SUMS`。

## 来源与许可证

本项目采用 [MIT License](LICENSE)。网页初始词典及原始脚本来自 [KawaYiLab/Devin-Web-Chinese](https://github.com/KawaYiLab/Devin-Web-Chinese) 1.0.7，保留不可变副本及[原作者完整 MIT 许可](LICENSES/KawaYiLab-Devin-Web-Chinese-MIT.txt)。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

问题与漏翻可提交到 [Issues](https://github.com/GoodWay0223/devin-zh/issues)，附版本、界面位置、英文原文和复现步骤；日志和截图请先移除密钥、私有项目及会话内容。
