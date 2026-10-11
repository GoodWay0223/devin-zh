@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更高版本，推荐 Node.js 24 LTS。
  echo 官方下载：https://nodejs.org/zh-cn/download
  echo 安装后重新双击本文件。详细说明见 START_HERE.md。
  pause
  exit /b 1
)
node.exe scripts\launcher.js %*
set "DEVIN_ZH_LAUNCH_EXIT=%ERRORLEVEL%"
if not "%~1"=="" exit /b %DEVIN_ZH_LAUNCH_EXIT%
if not "%DEVIN_ZH_LAUNCH_EXIT%"=="0" pause
exit /b %DEVIN_ZH_LAUNCH_EXIT%
