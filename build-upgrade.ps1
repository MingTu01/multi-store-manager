#Requires -Version 5.1
<#
.SYNOPSIS
    多店管理系统 - Windows 本地打包脚本
.DESCRIPTION
    清理旧构建、执行前端构建、打包ZIP升级包（排除node_modules和数据目录）
    供开发者本地使用，不部署到服务器
.EXAMPLE
    .\build-upgrade.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# 读取版本号
$PkgJson = Get-Content -Path "$ProjectRoot\apps\web\package.json" -Raw | ConvertFrom-Json
$Version = $PkgJson.version
$Output = "multi-store-manager-v$Version.zip"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  多店管理系统 - Windows 打包" -ForegroundColor Cyan
Write-Host "  版本: v$Version" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. 清理旧构建
Write-Host "[清理] 删除旧 dist..." -ForegroundColor Yellow
if (Test-Path "$ProjectRoot\apps\web\dist") {
    Remove-Item -Recurse -Force "$ProjectRoot\apps\web\dist"
}

# 2. 前端构建
Write-Host "[构建] 前端..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\apps\web"
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
} finally {
    Pop-Location
}

# 3. 验证 dist
if (-not (Test-Path "$ProjectRoot\apps\web\dist\index.html")) {
    Write-Host "[错误] dist/index.html 不存在，构建可能失败" -ForegroundColor Red
    exit 1
}
Write-Host "[验证] dist 构建成功" -ForegroundColor Green

# 4. 删除旧ZIP
if (Test-Path "$ProjectRoot\$Output") {
    Remove-Item -Force "$ProjectRoot\$Output"
}

# 5. 打包ZIP
Write-Host "[打包] 生成 $Output ..." -ForegroundColor Yellow

$ExcludeDirs = @(
    "node_modules",
    ".git",
    "apps\server\data",
    "apps\server\backups",
    "apps\server\uploads",
    "apps\server\logs"
)

# 使用 robocopy 排除大目录后压缩
$TempDir = Join-Path $env:TEMP "multi-store-build-$(Get-Random)"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    $robocopyArgs = @($ProjectRoot, $TempDir, "/E", "/XD") + $ExcludeDirs + @("/XF", "*.zip", ".env")
    & robocopy $robocopyArgs | Out-Null

    Compress-Archive -Path "$TempDir\*" -DestinationPath "$ProjectRoot\$Output" -Force

    $Size = (Get-Item "$ProjectRoot\$Output").Length / 1MB
    Write-Host "" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  打包完成！" -ForegroundColor Green
    Write-Host "  文件: $Output" -ForegroundColor Green
    Write-Host "  大小: $([math]::Round($Size, 2)) MB" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
} finally {
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
