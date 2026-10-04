Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '..\src-tauri\icons'
$master = Join-Path $root 'icon-master.png'
if (-not (Test-Path $master)) {
    $master = Join-Path $root 'icon.png'
}

if (Test-Path $master) {
    Write-Host "Generating icons using Tauri CLI from $master..."
    pnpm tauri icon -o $root $master

    $assetsDir = Join-Path $PSScriptRoot '..\src\assets'
    $publicDir = Join-Path $PSScriptRoot '..\public'
    if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
    if (!(Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir | Out-Null }

    Copy-Item (Join-Path $root 'icon.png') (Join-Path $assetsDir 'logo.png') -Force
    Copy-Item (Join-Path $root 'icon.png') (Join-Path $publicDir 'icon.png') -Force
    Copy-Item (Join-Path $root '32x32.png') (Join-Path $publicDir 'favicon.png') -Force
    Copy-Item (Join-Path $root 'icon.ico') (Join-Path $publicDir 'favicon.ico') -Force
    Write-Host "Icons successfully generated and synchronized!"
} else {
    Write-Error "Master icon not found: $master"
}
