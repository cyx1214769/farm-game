# Fix project.config.json in WeChat mini-game build output.
# Double-click "修复微信配置.bat" in the same folder to run this.
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads BOM-less files as ANSI.

$ErrorActionPreference = 'Stop'

$appid = 'wx5103fb544cde15c4'
$root  = Join-Path $PSScriptRoot 'build'

if (-not (Test-Path $root)) {
    Write-Host 'ERROR: build folder not found' -ForegroundColor Red
    exit 1
}

$dirs = Get-ChildItem $root -Directory -Filter 'wechatgame*' -ErrorAction SilentlyContinue
if (-not $dirs) {
    Write-Host 'ERROR: no build output found' -ForegroundColor Red
    exit 1
}

$count = 0
foreach ($d in $dirs) {
    $file = Join-Path $d.FullName 'project.config.json'
    if (-not (Test-Path $file)) { continue }

    $obj = Get-Content -Raw -Encoding UTF8 $file | ConvertFrom-Json
    $obj.appid = $appid
    if ($obj.PSObject.Properties.Name -contains 'isGameTourist') {
        $obj.isGameTourist = $false
    } else {
        $obj | Add-Member -NotePropertyName 'isGameTourist' -NotePropertyValue $false
    }
    if ($obj.PSObject.Properties.Name -contains 'miniprogramRoot') {
        $obj.PSObject.Properties.Remove('miniprogramRoot')
    }

    $json = $obj | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host ("FIXED: " + $d.Name) -ForegroundColor Green
    $count++
}

Write-Host ""
Write-Host ("Done. Fixed $count folder(s).") -ForegroundColor Cyan
