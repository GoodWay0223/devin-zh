# Devin Desktop 汉化补丁 (devin-desktop-zh)

给 **Devin Desktop**(原 Windsurf)桌面端打简体中文补丁。零依赖, 只需要 Node.js。

## 它汉化什么

| 层 | 文件 | 方式 | 来源 |
|---|---|---|---|
| Agent/聊天面板里的 Web 应用文案 (i18next 资源, 约 1.2 万条) | `out/vs/workbench/windsurf-chat-client/index.js` | 按 key 路径替换 `JSON.parse('{...}')` 资源块 | 词典 + 机翻草稿 + 人工校对 |
| Agent 窗口里硬编码的按钮/提示/工具调用标签 | `out/vs/sessions/sessions.desktop.main.js`、上面的 chat-client | 在 `children/label/title/placeholder/...` 等"给人看的属性"里做精确字符串替换 | 同上 |
| VS Code 原生界面 (菜单、设置、面板、命令, 约 2 万条) | `out/nls.messages.js/.json` | 用官方 `zh-hans` 语言包按 `nls.keys.json` 重建 | 微软官方翻译 |

不会改动任何代码逻辑, 只替换展示用文本。所有被改的文件都先备份为 `*.bak-zh`。

## 用法

```bash
cd devin-zh
node src/cli.js apply     # 汉化 (幂等, 可重复执行); 然后完全退出并重开 Devin Desktop
node src/cli.js restore   # 还原成原版
node src/cli.js status    # 查看翻译覆盖率 / 当前是否已汉化
```

环境变量 `DEVIN_APP` 可指定安装目录 (默认 `D:/AI/Devin/resources/app`)。

**Devin 更新后**界面会变回英文 (文件被覆盖), 重新运行 `apply` 即可。补丁会自动识别"这是新版原文件", 刷新备份。

### 首次准备 (官方语言包)

VS Code 原生部分需要微软的简体中文语言包翻译数据, 放在 `cache/zh/` (已 gitignore):

```bash
mkdir -p cache && cd cache
curl -L -o zh.vsix "https://open-vsx.org/api/MS-CEINTL/vscode-language-pack-zh-hans/<与 Devin 的 VS Code 版本一致>/file/MS-CEINTL.vscode-language-pack-zh-hans-<版本>.vsix"
unzip zh.vsix -d zh
```

Devin 的 VS Code 版本见 `resources/app/package.json` 的 `version` (当前 1.126.0)。

## 目录

```
src/cli.js        命令入口 (apply / restore / status / translate / translate-strings / strings / prune)
src/rules.js      规则翻译: 工具调用标签 "Listing automations" 等 动词+名词 句式
src/blocks.js     判断 i18n 资源块是否英文 (文件内还有 es/pt/ja 块)
src/dump.js       导出某命名空间下未翻译条目, 便于人工翻译
src/check.js      校验译文占位符/标签是否与原文一致
src/core.js       备份/标记、i18n 资源块解析、词典装载、语法校验
src/nls.js        VS Code nls.messages 汉化
src/mt.js         机翻 (Google gtx, 经 curl) + 占位符保护 + 术语表
data/web-dictionary.js   KawaYiLab/Devin-Web-Chinese 词典 (MIT), 精校的网页端词条
data/glossary.json       术语表 (机翻前强制替换, 保证全局统一)
data/strings/*.json     人工: 整句英文 -> 中文 (分文件存放, 与 strings.json 合并)
data/strings.json        人工: 整句英文 -> 中文 (最高优先级之一, 同时作用于 i18n 与硬编码文本)
data/i18n.zh.json        人工: 按 key 路径精校  { "路径": { "英文原文": "中文" } }
data/i18n.mt.json        机翻草稿 (i18n 资源), 可随时重新生成
data/strings.mt.json     机翻草稿 (硬编码文本)
data/nls.json            人工: VS Code 原生文案 **强制**覆盖  { "英文原文": "中文" }
data/nls/*.json          人工: 官方语言包没有覆盖到的 Devin 专有文案  { "英文原文": "中文" }
```

### 翻译优先级

- i18n 资源: `i18n.zh.json[路径]` > `strings.json` > `web-dictionary.js` > `i18n.mt.json[路径]`
- 硬编码文本: `strings.json` > `web-dictionary.js` > `strings.mt.json`
- VS Code 原生: `nls.json` > 官方语言包

## 维护流程

1. 发现还是英文 / 译错的地方 -> 在 `data/strings.json` 加一条 `"English": "中文"` (整句精确匹配, 最省事); 同一英文在不同位置要不同译法时, 用 `i18n.zh.json` 按路径写。
2. `node src/cli.js apply` -> 重启 Devin 验证。
3. Devin 更新后: `apply`; 再 `node src/cli.js status` / `strings` 看有没有新增的未翻译条目; 需要时 `translate` / `translate-strings` 补机翻草稿 (有限流, 会自动退避等待), 再人工校对。

## 注意

- 补丁修改了安装目录里的文件, 可能出现"安装似乎已损坏"提示, 可忽略。
- 机翻只是草稿 (已做 `{{变量}}`、`<0>标签</0>`、专有名词保护与校验, 校验失败的保持英文)。
- 词典来源: [KawaYiLab/Devin-Web-Chinese](https://github.com/KawaYiLab/Devin-Web-Chinese) (MIT)。
