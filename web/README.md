# Devin 网页油猴汉化

统一发布版本 **1.0.15**，网页脚本与桌面工具同号，均由 `package.json.version` 生成。网页功能沿用 1.0.13，本次更新桌面署名/图标/入口。基于 KawaYiLab / Devin-Web-Chinese 1.0.7（MIT），不可变原始副本在 `upstream/Devin-Web-Chinese-1.0.7.user.js`，完整许可在根目录 `LICENSES/`。原始文件 SHA-256 为 `6e050815196d41a7b0f77db7c95b3fb8748490331763a1e14b3b648dc280bbe2`。构建前核对原始文件；不执行该旧脚本。

## 首次安装

启用 [Tampermonkey](https://www.tampermonkey.net/) 后，打开[可安装的脚本](https://raw.githubusercontent.com/GoodWay0223/devin-zh/master/dist/Devin-Web-Zh.user.js)确认安装；也可以下载 [Release](https://github.com/GoodWay0223/devin-zh/releases/latest) 的 `.user.js`，将全文粘贴到新脚本编辑器并保存，然后刷新 Devin。首次安装不需要 Node.js。

## 更新现有油猴脚本

1. 保留原版导出文件，用于恢复。进入油猴管理面板，打开现有“Devin 网页端汉化”。
2. 下载发布版脚本，或在项目根目录构建后打开 `web/dist/Devin-Web-Zh.user.js`，复制全部内容；在原脚本编辑器中全选、替换，再按 Ctrl+S 保存。
3. 确认脚本版本显示 1.0.15，刷新 Devin 网页。每个页面只启用一份汉化脚本，避免同时运行旧版和新版。保留旧版导出备份，可随时恢复。1.0.11 有侧栏排除回归，不推荐使用。
4. 若发现问题，将原版备份内容全选替换回原脚本，保存并刷新，即可恢复。也可暂时关闭该脚本。

保留原来的 `@name/@namespace` 以维护同一脚本。保留 `@grant none`，限定到 `app.devin.ai` 与 `app.beta.devin.ai`，不申请新权限，不请求翻译服务，不读取账户凭据，不发送页面或聊天内容。运行时代码只修改显示文字及 `placeholder/title/aria-label/alt/data-placeholder`，不改变输入值、URL、ID、开关状态或按钮回调。

## 1.0.13 动态侧栏优化

属性变化只处理当前元素，不再重新遍历整棵子树；后到的祖先任务合并已有子节点任务；虚拟列表移除的节点及时释放待办。固定 Recent 分组标签可翻译，用户会话名称、内容、状态仍保持原样。新增 4 项回归在旧代码失败，新代码通过；模拟 500 个按钮的 20 轮属性更新，额外子树遍历从 20 次降为 0 次。

用户报告 Recent 排序首次加载卡住、切换排序恢复。当前真实 Chrome 检查中 Recent 两种排序都为空，且存在登录令牌错误，未复现这一加载现象；因此此次只确认降低重复处理，不能宣称数据加载已修复。浏览器安全策略不允许打开 `chrome-extension:` 管理页，尚未核对或替换用户实际安装的油猴脚本；请按上方步骤手动更新后验收。

## 1.0.12 恢复界面翻译并保护用户内容

1.0.11 将通用 `sidebar-content-wrapper/content` 按整棵子树排除，混入普通按钮或外链就会阻止固定菜单汉化；通用 `role=tree` 和 `data-session-id` 也被当成用户区域。用户反馈效果退步，现已将该版本标记为预发布。

1.0.12 撤回这些通用布局排除，继续遍历共享侧栏，只保护具体的会话行、空间卡片、明确文件/项目树、未知项目按钮/侧栏名称及会话状态。已确认导航链接、固定动作、设置说明可以翻译。整个消息区域（包含其内部按钮）和编辑草稿不进入翻译队列。

MutationObserver 仅过滤及排队，不对每条流式记录执行正则。自身写入用 WeakMap 忽略，重复文案最多缓存 1,024 项；突发更新只合并局部子树，取消队列满时退回整页扫描。恢复 1.0.10 使用的 requestAnimationFrame 调度，缺少该 API 时使用 16 ms 定时器；每批目标为约 3 ms / 128 个节点。一次原始 DOM 调用可能超过预算，这不是硬实时保证。重复挂载会停止旧观察器，只有一个引擎工作。

独立浏览器验证中，20,000 次会话/正文文字更新和 500 个新增会话按钮没有增加翻译规则测试、遍历或调度，整页扫描仍只有初始化的一次。用户确认 1.0.10 正常加载、只有轻微变慢；本次优化尚未在其登录页做安装后的加载时间/FPS A/B 对照，不能声称已经测得具体提速。

本地版本设置 `@downloadURL none` / `@updateURL none`，由项目手动维护，避免上游自动更新覆盖本地修改。`@downloadURL none` 的含义见 [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php?locale=zh_CN)。如将来要恢复上游自动更新，先合并本地修改并重新验证，不要直接换回旧脚本头。

## 共用词典及复用流程

- `data/web-dictionary.js`：1194 条原有精确词条与 91 条规则，保留原样。
- `data/display.zh.json`：共用客户端导航/菜单词条。
- `data/web-reviewed.zh.json`：本次从实机网页和截图核对的新增及修订文案。
- `data/web-shortcuts.zh.json`：实际键盘快捷键页的 60 条文案。
- `data/web-settings.zh.json`：组织及个人设置页的增量文案，含智能体、SSH、PR 权限、审查排除规则、语言及迁移提示。
- `data/web-regex.zh.json`：11 条锚定的相对时间/工作时长规则。
- `data/model-descriptions.zh.json`：两端共享的能力小字说明、名称保护及 2 条模型列表句式；模型列表的捕获内容保留原文。
- `web/runtime.js`：网页 DOM 引擎，动态属性监听、分批处理、保护内容；构建时序列化进单文件。
- `src/core.js`：客户端也读取三份人工新增词典，仍需经过客户端结构/占位符检查。

在项目根目录运行：

```powershell
npm test
npm run build:userscript
node web/serve-fixture.js
```

`build:userscript` 离线生成脚本和带 SHA-256 的报告，不修改安装中的 Devin，也不修改 Chrome/油猴存储。`serve-fixture.js` 输出本地地址，使用浏览器打开执行实际 DOM 回归；修改运行时代码后要重启该验证服务并重新加载页面。

Devin 网页更新后，已有精确词条及动态监听继续复用。新文案维护到人工词典、执行检查并重新生成；未知内容保持原文。没有承诺任意未来页面无需适配。

客户端更新仍按根目录 `UPDATE_GUIDE.md`：新版本原版验证 → doctor → prepare → 测试 → 退出客户端 → apply → 启动检查。本轮只生成客户端 Web 准备结果，没有把新词典重新写入正在运行的客户端。网页脚本不会自动安装进桌面客户端的跨源 iframe；没有修改主进程、预加载脚本、沙箱、认证或官方完整性校验。

## 实际验证及覆盖边界

已用用户登录的 Chrome 核对：首页、会话工具栏、桌面云端设置 Local Settings/Sharing、偏好设置、键盘快捷键、自定义 Plugins/Hooks/Memory、自动化、Wiki、Review、安全 Scans/Profiles，以及侧栏 Properties 菜单。只打开/读取页面及菜单，没有发消息、运行扫描、创建资源、改隐私开关或保存账户设置。Models 页当前没有加载出可用列表，未宣称已检查其所有内容。详情弹窗及未来新页面不属于全覆盖承诺。

独立浏览器验证页执行 72 项实际 DOM 检查，包括动态文本/属性、新节点、1200 个动态按钮、输入/Slate 草稿、快捷键、正文/代码/终端、会话及 PR 标题、未知普通值、文件标签、按钮事件与开关状态；新增混合共享侧栏的导航/按钮/说明恢复翻译、用户名保护、通用 tree/session-id 布局标记和流式开销检查。项目测试共 77 项通过；生成脚本语法检查通过。**这不是新版已安装后的 Devin 页面验收**。

1.0.9 另外使用登录 Chrome 只读核对组织首页、General、Devin、Review、DeepWiki、Schedules、Connections、Desktop、Environment、Knowledge、Playbooks，以及个人 Preferences。修复设置侧栏链接与可见标签互为相邻元素导致的漏翻；只接受单一已识别界面链接的行，不把所有侧栏内容当作固定界面。单词选项在 `combobox` 中可翻译，隐藏输入的原始值保持不变。语言名称在真实 `label` 结构中翻译；键名 Enter/Ctrl、品牌和文件模式保持原样。Profiles/Create profile 改用“配置方案”，避免共用文案被限定为扫描配置。详情弹窗、未打开的子页及未确认单位文本仍可能保留英文。

按用户追加要求，又从 `https://app.devin.ai/` 起巡查首页 Agent/Ask 和配置/智能体/帮助入口、自动化与元数据筛选、安全扫描筛选及安全自动化空状态、PR 列表操作菜单、Wiki 列表筛选、自定义 Plugins/Skills/MCPs/Hooks/Rules/Memory。新增对应说明、搜索及空状态文案；只打开菜单和页面，未执行生成、扫描、PR 操作、创建/安装资源或账户保存。首页输入框本身 `translate="no"`，仅对带有真实 Devin/Slate 标记的不可编辑占位元素放行，草稿、代码和未知禁翻结构仍保持原文。PR 链接内仅放行已确认的“More actions”按钮描述属性；标题与链接不变。自动化详情链接里的用户自定义名称也受保护。

1.0.10 按名称保留约定，两端的 `Normal`、`Agent`、`Fusion`、`Ultra`、`Lite` 及模型名保持英文，只翻译介绍与操作说明；模型名称保护优先于旧机翻草稿。截图中的 Fusion 介绍和 Normal 模型列表介绍已加入人工词典，快速模式与 ChatGPT 套餐文案也已补翻。Chrome 本轮连接异常，因此这一版根据截图、客户端源文案和独立浏览器验证页检查，未宣称安装后巡查。`Bug` 在客户端保留 Bug、网页审查设置为“缺陷”。

跨域 iframe、远程电脑画面、Shadow DOM 不自动遍历。`.prose-main` 等正文、消息区域、已识别的用户会话/空间/文件内容、编辑器、代码、终端、记忆文件内容、链接内会话/PR/自动化标题和未知侧栏名称受保护。通用布局不作为整体排除证据。无法确认的名字或结构保留英文，后续以真实 DOM 证据补充范围，不改业务数据。

`Stage quote caption` / `New review chat mention` 等快捷键描述采用保守直译，具体交互未触发验证。品牌和模型名称保持原文。
