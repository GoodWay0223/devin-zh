# 汉化工具图标

采用作者选定的 A 款：Devin 标志结合右下角蓝色“中”字角标。图标用于识别社区汉化工具，项目不隶属于 Devin 官方。

- `devin-zh-master.png`：选定稿，由 imagegen 根据本机 Devin 图标参考生成。设计要求为白色圆角方块、保留 Devin 标志轮廓、右下角蓝色方形“中”字角标、常规粗体字形、透明外部背景。
- `devin-zh.png`：512px 展示图。
- `devin-zh-32.png` / `devin-zh-64.png`：油猴 `@icon` / `@icon64`，构建时内嵌到脚本。
- `devin-zh-128.png`：Windows 窗口图标素材。
- `devin-zh.ico`：Windows 多尺寸图标，包含 16、24、32、48、64、128、256px，供工具程序与快捷方式使用。
- `devin-zh.icns`：同款 macOS 图标素材。当前 macOS 仍为终端检查预览入口，此素材不会自动修改 Finder 或官方 Devin.app 的图标。

维护者更新母版后，可在安装了 Pillow 的 Python 环境中运行 `python scripts/export-icons.py`，然后重新构建油猴脚本并审查生成文件。Python/Pillow 仅用于维护图标，用户使用汉化工具不需要安装它们。格式导出保留选定稿的构图、颜色和字形。

Devin 名称和标志归其权利人所有，见 [第三方来源](../THIRD_PARTY_NOTICES.md)。GitHub 图标只用于项目地址链接，独立于本图标。
