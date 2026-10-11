$ErrorActionPreference = 'Stop'
$guiProject = $env:DEVIN_ZH_GUI_PROJECT
if (-not $guiProject) { throw 'Missing GUI project directory' }
$guiSourceFile = Join-Path $guiProject 'scripts/launcher-windows.cs'
$guiIconFile = Join-Path $guiProject 'assets/devin-zh.ico'
$guiHasher = [Security.Cryptography.SHA256]::Create()
$guiInputs = New-Object IO.MemoryStream
try {
  foreach ($guiInputFile in @($guiSourceFile, $guiIconFile)) {
    $guiInputBytes = [IO.File]::ReadAllBytes($guiInputFile)
    $guiInputs.Write($guiInputBytes, 0, $guiInputBytes.Length)
  }
  $guiInputs.Position = 0
  $guiSourceHash = [BitConverter]::ToString($guiHasher.ComputeHash($guiInputs)).Replace('-', '').ToLowerInvariant()
} finally { $guiInputs.Dispose(); $guiHasher.Dispose() }
$guiDirectory = Join-Path $guiProject ('cache/gui/' + $guiSourceHash)
$guiExecutable = Join-Path $guiDirectory 'DevinZh.exe'
if (-not (Test-Path -LiteralPath $guiExecutable)) {
  [IO.Directory]::CreateDirectory($guiDirectory) | Out-Null
  $guiCompiler = New-Object Microsoft.CSharp.CSharpCodeProvider
  $guiParameters = New-Object CodeDom.Compiler.CompilerParameters
  $guiParameters.GenerateExecutable = $true
  $guiParameters.OutputAssembly = $guiExecutable
  $guiParameters.CompilerOptions = '/target:winexe /win32icon:"' + $guiIconFile + '"'
  foreach ($guiReference in @('System.dll','System.Core.dll','System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll')) { [void]$guiParameters.ReferencedAssemblies.Add($guiReference) }
  try {
    $guiResult = $guiCompiler.CompileAssemblyFromFile($guiParameters, @($guiSourceFile))
    if ($guiResult.Errors.HasErrors) { throw (($guiResult.Errors | ForEach-Object { $_.ToString() }) -join "`n") }
  } finally { $guiCompiler.Dispose() }
}
if ($env:DEVIN_ZH_GUI_CHECK -eq '1') { Write-Output $guiExecutable; return }
$guiStartInfo = New-Object Diagnostics.ProcessStartInfo
$guiStartInfo.FileName = $guiExecutable
$guiStartInfo.Arguments = '"' + $guiProject + '"'
$guiStartInfo.WorkingDirectory = $guiProject
$guiStartInfo.UseShellExecute = $false
[void][Diagnostics.Process]::Start($guiStartInfo)
