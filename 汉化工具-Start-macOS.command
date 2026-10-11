#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
# Finder's Terminal session may not load the shell profile used by Homebrew.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '请先安装 Node.js 22.13 或更高版本，推荐 Node.js 24 LTS。' \
    '官方下载：https://nodejs.org/zh-cn/download' \
    '安装后重新双击本文件。macOS 当前为仅检查/准备的预览版。'
  read -r -p '按回车关闭…' _devin_zh_reply
  exit 1
fi
node scripts/launcher.js "$@"
devin_zh_exit=$?
if [ "$#" -eq 0 ] && [ "$devin_zh_exit" -ne 0 ]; then
  read -r -p '按回车关闭…' _devin_zh_reply
fi
exit "$devin_zh_exit"
