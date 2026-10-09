# Devin 汉化项目协作

目标为可维护的简体中文界面补丁。当前安装入口、使用流程及实机验证版本见 README.md；更新后操作见 UPDATE_GUIDE.md。

- 保留词典中的既有未提交工作。翻译默认离线；在线机翻仅在用户明确要求时运行。
- `src/runtime.js` 通过 AST 证明 React/JSX runtime 来源；`src/analyze.js` 只返回已确认的界面位置或英文资源；`src/patch.js` 生成补丁。不要恢复固定 webpack ID 或全局字符串替换。
- 内部模式值、事件名、权限状态、URL、函数、提示词和用户内容不是翻译目标。显示译文与原始数据分离；未知结构保留原样。
- `src/compatibility.js` 和 `doctor` 是更新后的兼容检查入口。不能用旧原版、旧生成文件或手改报告绕过新安装指纹/工具版本校验。
- `src/install.js` 负责原版校验、不可变备份、事务写入和回滚。不要修改官方 product.checksums 或关闭完整性检查。
- 新增译文优先维护 `data/strings/z-reviewed.json` 或分用途的 `data/display.zh.json`。语言包需要与应用 VS Code major/minor 匹配。
- 修改后执行 `npm test`，检查实际版本的 `doctor` 和准备报告。应用前退出 Devin；新版本完成启动/模式菜单验收后才记录该版本实机兼容。
- Acorn 由 package-lock.json 固定。不要仅依赖未来可能被应用移除的内置依赖。
- 网页油猴的原始导出备份在 `web/upstream`；引擎/构建在 `web/runtime.js` 和 `web/build.js`。人工词典 `data/web-reviewed.zh.json` / `data/web-shortcuts.zh.json` / `data/web-settings.zh.json` 与客户端共用。不要编辑生成的脚本作为唯一维护入口；不把 DOM 翻译扩展到用户输入、聊天/记忆正文、代码和终端。不申请新权限或注入桌面跨源 iframe。
- 公开发布流程见 CONTRIBUTING.md；同步源码与根目录 `dist/` 的生成副本，保留上游原始字节及许可。`.devin-zh.local.json`、本机缓存、安装文件、语言包和账号资料不能入库；发布包只打包已审查的版本控制源码。
- 网页性能修改需检查 observer/入队/遍历入口、流式更新、重复挂载与队列突发；不得恢复满队列全 body 扫描。保护具体用户行/名称/内容，不用通用 sidebar wrapper、role=tree 或 data-session-id 整块拒绝布局；回归须包含导航、普通 UI 按钮、外链与用户内容共享父容器的场景。模拟和独立 DOM 指标不能冒充登录页效果或加载耗时/FPS。
