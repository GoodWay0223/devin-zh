# 解压后从这里开始

## Windows：双击启动

下载 `Devin-Desktop-Zh-Windows-0.3.9.zip`，解压到长期保留的文件夹，进入 `devin-zh`，**双击 `Start-Windows.cmd`**。

1. 首次使用需要 [Node.js 22.13+（推荐 24 LTS）](https://nodejs.org/zh-cn/download)。安装一次即可；没有安装时入口会告诉你怎么做。
2. 首次启动会自动安装锁定的工具依赖，需要联网。之后常规汉化在本机完成。
3. 工具会寻找 Devin。没找到时，粘贴 `Devin.exe` 或安装文件夹的完整路径即可，不需要自己定位 `resources/app`。
4. 输入 `1` 或直接回车，生成 Agent / 聊天界面汉化。保存工作并完全退出 Devin，再在提示处回车应用。
5. 重新打开 Devin 检查界面。以后更新或恢复，仍双击这个文件。

| 菜单 | 用途 |
| --- | --- |
| 1 | 汉化本地 Agent / 聊天界面，不需要额外语言包 |
| 2 | 同时汉化编辑器菜单，需自己取得匹配的微软中文语言包 |
| 3 | 检查原版、已记录的汉化差异和 Agent 兼容性 |
| 4 | 恢复当前版本原版，先完全退出 Devin |
| 5 | 恢复上次中断操作，先完全退出 Devin |
| 6 | 更换安装目录 |

工具不会自动结束 Devin 进程。若正在运行或发现未知安装修改，会拒绝覆盖。完整语言包的取得和版本要求见 [客户端指南](docs/desktop.md)。此工具包不含 Devin 官方程序或微软语言包。

## macOS：双击预览入口

下载 `Devin-Desktop-Zh-macOS-Preview-0.3.9.zip`，解压后进入 `devin-zh`，**双击 `Start-macOS.command`**。同样先安装 Node.js 22.13+，支持 Apple Silicon / Intel 对应的 Node 安装。

**macOS 当前只提供检查和准备报告，不会直接修改 Devin.app，不能完成客户端汉化安装。** 正式应用功能需要实际 Mac 上验证签名、登录和启动。修改签名应用里的资源会破坏签名封印，详见 [Apple 签名规则](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)；工具不会自动重签或调整系统安全设置。

入口寻找 `/Applications/Devin.app` 和 `~/Applications/Devin.app`，也可以手动粘贴应用完整路径。这些是发现候选，不是对 Devin 包结构的保证；实际目标文件缺失或只有 `app.asar` 时停止。菜单 1/2 只在工具文件夹的 `cache/` 中生成备份和报告，菜单 3 只读检查。

若 Terminal 提示没有执行权限，在终端输入 `chmod u+x `（末尾留一个空格），把 `Start-macOS.command` 拖进去后回车，再双击。如果系统阻止运行下载文件，请按 macOS 显示的提示处理；不要关闭 Gatekeeper。发布 ZIP 保留入口的可执行标记。

需要立即使用中文界面时，macOS 浏览器可以使用[网页油猴脚本](web/README.md)。

## 更新与保留备份

升级汉化工具时，把新包解压到另一个目录，将旧目录的 `cache/` 和 `.devin-zh.local.json` 复制到新工具根目录，再使用新入口。原版备份是恢复依据，**不要删除旧工具文件夹里的 cache**。本机配置可能含语言包路径，移动语言包后需重新选择。

Windows 上 Devin 更新后，先确认官方新版正常启动，再运行菜单 1 或 2；工具按新构建重新检查和生成补丁。旧报告不跨版本使用。详细步骤见 [更新指南](UPDATE_GUIDE.md)。

本地 Agent 汉化可能触发“安装似乎损坏”通知；如何启用原生“此构建不再提示”选择见[客户端指南](docs/desktop.md)。工具保留官方校验值。
