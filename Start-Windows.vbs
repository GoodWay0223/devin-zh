Option Explicit
Dim shell, files, projectDir, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
projectDir = files.GetParentFolderName(WScript.ScriptFullName)
shell.Environment("Process")("DEVIN_ZH_GUI_PROJECT") = projectDir
command = "powershell.exe -NoProfile -STA -WindowStyle Hidden -Command " & Chr(34) & _
  "& { try { $guiFile = Join-Path $env:DEVIN_ZH_GUI_PROJECT 'scripts/build-windows-gui.ps1'; & ([ScriptBlock]::Create([IO.File]::ReadAllText($guiFile))) } catch { $errorFile = Join-Path $env:DEVIN_ZH_GUI_PROJECT 'cache/gui/bootstrap-error.log'; [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($errorFile)) | Out-Null; [IO.File]::WriteAllText($errorFile, ($_ | Out-String)); Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Devin GUI error') } }" & Chr(34)
shell.Run command, 0, False
