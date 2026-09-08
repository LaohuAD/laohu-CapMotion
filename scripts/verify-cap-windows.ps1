$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Get-Content apps/desktop/src-tauri/tauri.local.conf.json -Raw | ConvertFrom-Json).version
$installers = @(Get-ChildItem target/x86_64-pc-windows-msvc/release/bundle/nsis -Filter *.exe)
if ($installers.Count -ne 1) { throw 'Expected exactly one CapMotion installer.' }
$installer = $installers[0]
$contents = & 7z l -slt $installer.FullName
if ($LASTEXITCODE -ne 0) { throw 'Installer archive inspection failed.' }
foreach ($file in @('CapMotion.exe','cap-cli.exe','cap-exporter.exe','cap-muxer.exe','avcodec-61.dll','avformat-61.dll','avutil-59.dll','dxcompiler.dll','dxil.dll','onnxruntime.dll')) {
    if ($contents -notcontains "Path = $file") { throw "Missing bundled file: $file" }
}
$installDir = Join-Path $env:RUNNER_TEMP 'CapMotion smoke 中文'
$setup = Start-Process $installer.FullName -ArgumentList "/S /D=$installDir" -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "Installer exit: $($setup.ExitCode)" }
$exe = Join-Path $installDir 'CapMotion.exe'
$cli = Join-Path $installDir 'cap-cli.exe'
if (-not (Test-Path $exe) -or -not (Test-Path $cli)) { throw 'Silent installation did not produce the app and CLI.' }
$actualVersion = (Get-Item $exe).VersionInfo.ProductVersion
if (-not $actualVersion.StartsWith($version)) { throw "App version mismatch: $actualVersion" }
$cliHelp = & $cli --help
if ($LASTEXITCODE -ne 0) { throw 'Installed CLI cannot start; check DLLs and runtime.' }
$cliTransactions = & node scripts/verify-cap-cli.mjs $cli
if ($LASTEXITCODE -ne 0) { throw 'Installed CLI project transaction checks failed.' }
$cliTransactions = $cliTransactions | ConvertFrom-Json
$app = Start-Process $exe -PassThru
Start-Sleep -Seconds 12
$app.Refresh()
if ($app.HasExited) { throw "Installed desktop exited during launch: $($app.ExitCode)" }
Stop-Process -Id $app.Id
$report = @{
    version = $version; commit = $env:GITHUB_SHA; installer = $installer.Name
    sha256 = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLower()
    archive = 'PASS'; silentInstall = 'PASS'; cliLaunch = 'PASS'; desktopLaunch = 'PASS'
    projectTransactions = $cliTransactions
    signature = (Get-AuthenticodeSignature $installer.FullName).Status.ToString()
    limitations = @('No Authenticode certificate configured; unsigned community distribution.','Physical camera, microphone, GPU recording and interactive editing require device acceptance.')
}
$report | ConvertTo-Json -Depth 5 | Set-Content target/capmotion-windows-verification.json -Encoding utf8
