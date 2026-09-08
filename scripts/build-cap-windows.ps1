param([switch]$SkipSetup)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Run this script with PowerShell 7 on Windows.' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE)" }
}
Invoke-Checked node @('scripts/check-cap-local-release.mjs')
$env:CAP_GPUI_DEV = '0'
$env:CAP_LAOHU_LOCAL_BUILD = '1'
$env:RUST_TARGET_TRIPLE = 'x86_64-pc-windows-msvc'
if (-not $SkipSetup) { Invoke-Checked pnpm @('-w', 'cap-setup') }
Invoke-Checked node @('scripts/build-desktop-binaries.mjs', $env:RUST_TARGET_TRIPLE)
Push-Location apps/desktop
try {
    Invoke-Checked pnpm @('run', 'preparescript', '--release')
    # Platform override derives identity and version from the one shared authority.
    $config = Get-Content src-tauri/tauri.local.conf.json -Raw | ConvertFrom-Json -AsHashtable
    $config.bundle.targets = @('nsis')
    $config.bundle.windows = @{ nsis = @{ languages = @('English', 'SimpChinese'); displayLanguageSelector = $true; installMode = 'currentUser' }; wix = @{ upgradeCode = 'f9966c1a-c474-4dd5-8a49-266f86bb5fb2'; version = $config.version } }
    $configPath = Join-Path $env:TEMP 'capmotion-windows-config.json'
    $config | ConvertTo-Json -Depth 12 | Set-Content $configPath -Encoding utf8
    Invoke-Checked pnpm @('tauri', 'build', '--target', $env:RUST_TARGET_TRIPLE, '--config', $configPath, '--bundles', 'nsis')
} finally { Pop-Location }
