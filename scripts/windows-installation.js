'use strict';
const cp = require('node:child_process');

// Read Windows installation records only. Never launch shortcuts or uninstallers.
const DISCOVER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$hints = [System.Collections.Generic.List[object]]::new()
function Add-Hint($kind, $value) { if ($value -is [string] -and $value.Trim()) { $hints.Add(@{kind=$kind;path=$value}) } }
try { Get-CimInstance Win32_Process -Filter "Name='Devin.exe'" | ForEach-Object { Add-Hint 'process' $_.ExecutablePath } } catch {}
$uninstallRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^Devin(?:\s|$)' } | ForEach-Object {
  Add-Hint 'registry' $_.InstallLocation
  Add-Hint 'icon' $_.DisplayIcon
}
foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Devin.exe', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\Devin.exe')) {
  if (Test-Path -LiteralPath $key) { Add-Hint 'app-path' (Get-Item -LiteralPath $key).GetValue('') }
}
try {
  $shell = New-Object -ComObject WScript.Shell
  $folders = @('Desktop','CommonDesktopDirectory','Programs','CommonPrograms') | ForEach-Object { [Environment]::GetFolderPath($_) } | Select-Object -Unique
  foreach ($folder in $folders) {
    if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { continue }
    Get-ChildItem -LiteralPath $folder -Filter '*Devin*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      $link = $shell.CreateShortcut($_.FullName)
      if ([IO.Path]::GetFileName($link.TargetPath) -ieq 'Devin.exe') { Add-Hint 'shortcut' $link.TargetPath }
      if ([IO.Path]::GetFileName($link.TargetPath) -ieq 'Start-Windows.cmd') { Add-Hint 'tool' $link.WorkingDirectory }
    }
  }
} catch {}
try { Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { Add-Hint 'drive' ($_.DeviceID + '\') } } catch {}
ConvertTo-Json -InputObject @($hints.ToArray()) -Depth 3 -Compress
`;

function readWindowsHints({execute = cp.execFileSync} = {}) {
  try {
    const output = execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',DISCOVER],
      {encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:1024*1024});
    const hints = JSON.parse(output.replace(/^\uFEFF/,''));
    return Array.isArray(hints) ? hints.filter(hint => hint && typeof hint.path === 'string' && typeof hint.kind === 'string') : [];
  } catch {return [];}
}
function executableFromIcon(value) {
  // DisplayIcon may quote the path and end in an icon resource index.
  return value.replace(/,\s*-?\d+\s*$/,'').trim().replace(/^"(.*)"$/,'$1');
}
function chooseExecutable() {
  const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '请选择 Devin.exe，工具会自动识别安装目录'
$dialog.Filter = 'Devin 主程序 (Devin.exe)|Devin.exe'
$dialog.CheckFileExists = $true
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.FileName) } }
finally { $dialog.Dispose(); $owner.Dispose() }
`;
  return cp.execFileSync('powershell.exe',['-NoProfile','-STA','-Command',script],
    {encoding:'utf8',windowsHide:true,maxBuffer:64*1024}).trim();
}
module.exports = {readWindowsHints,executableFromIcon,chooseExecutable};
