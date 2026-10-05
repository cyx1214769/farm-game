# Back up Cocos project source into ..\backup\<timestamp>\
# Double-click "备份代码.bat" in the same folder to run this.
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads BOM-less files as ANSI.

$ErrorActionPreference = 'Stop'

$project = $PSScriptRoot
$stamp   = Get-Date -Format 'yyyyMMdd_HHmm'
$target  = Join-Path (Split-Path $project -Parent) ('backup\' + $stamp)

New-Item -ItemType Directory -Force -Path $target | Out-Null

# 1) the folders that actually contain YOUR work
foreach ($name in @('assets', 'settings', 'profiles')) {
    $src = Join-Path $project $name
    if (Test-Path $src) {
        $dst = Join-Path $target $name
        # 先清掉旧的，否则同一分钟内跑第二次会变成 assets\assets
        if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
        Copy-Item -Recurse -Force $src $dst
        Write-Host ("COPIED: " + $name) -ForegroundColor Green
    }
}

# 2) small files in the project root
Get-ChildItem $project -File | Copy-Item -Destination $target -Force

$size = [Math]::Round((Get-ChildItem $target -Recurse -File | Measure-Object Length -Sum).Sum / 1KB, 1)

Write-Host ""
Write-Host ("Backup created: " + $target) -ForegroundColor Cyan
Write-Host ("Size: " + $size + " KB") -ForegroundColor Cyan
