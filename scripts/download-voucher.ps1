param([string]$filePath)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

if (-not $filePath) {
    $filePath = Read-Host 'Enter CSV file path (or drag file here)'
}
if (-not $filePath) { pause; exit }

$filePath = [IO.Path]::GetFullPath($filePath)
if (-not (Test-Path $filePath)) {
    Write-Host "File not found: $filePath" -ForegroundColor Red
    pause; exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseName = [IO.Path]::GetFileNameWithoutExtension($filePath)
$outputDir = Join-Path $scriptDir ((Get-Date -Format 'yyyyMMddHHmmss') + '_' + $baseName)

Write-Host "Reading: $filePath" -ForegroundColor Cyan

$content = [IO.File]::ReadAllText($filePath, [Text.UTF8Encoding]::new($true))

function Parse-CsvLine {
    param([string]$line)
    $fields = [System.Collections.ArrayList]::new()
    $cur = [System.Text.StringBuilder]::new()
    $inQuote = $false
    for ($k = 0; $k -lt $line.Length; $k++) {
        $ch = $line[$k]
        if ($ch -eq '"') {
            if ($inQuote -and $k + 1 -lt $line.Length -and $line[$k + 1] -eq '"') {
                [void]$cur.Append('"')
                $k++
            } else { $inQuote = -not $inQuote }
        } elseif ($ch -eq ',' -and -not $inQuote) {
            [void]$fields.Add($cur.ToString())
            $cur = [System.Text.StringBuilder]::new()
        } else { [void]$cur.Append($ch) }
    }
    [void]$fields.Add($cur.ToString())
    return ,$fields
}

$rawLines = $content -split "`r?`n"
while ($rawLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($rawLines[-1])) {
    $rawLines = $rawLines[0..($rawLines.Count - 2)]
}
if ($rawLines.Count -lt 2) {
    Write-Host 'No data rows' -ForegroundColor Yellow
    pause; exit
}
$rows = @()
for ($i = 0; $i -lt $rawLines.Count; $i++) {
    $line = $rawLines[$i]
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $fields = Parse-CsvLine -line $line
    $rows += ,$fields
}

$headers = $rows[0]
$colName = -1
$colUrl = -1
$colCarNumber = -1
$colMonths = -1
$colAmount = -1
for ($c = 0; $c -lt $headers.Count; $c++) {
    $h = ($headers[$c] -replace '[`"''\s]', '').Trim()
    if ($h -like '*凭证*' -or $h -like '*voucher*' -or $h -like '*链接*') { $colUrl = $c }
    if ($h -like '*姓名*' -or $h -like '*name*') { $colName = $c }
    if ($h -like '*车牌*' -or $h -like '*car*') { $colCarNumber = $c }
    if ($h -like '*月数*' -or $h -like '*month*') { $colMonths = $c }
    if ($h -like '*金额*' -or $h -like '*amount*') { $colAmount = $c }
}

if ($colUrl -lt 0) {
    Write-Host 'No "凭证链接" column found. Headers:' -ForegroundColor Red
    Write-Host ($headers -join ' | ')
    pause; exit 1
}

# 准备目录
if (Test-Path $outputDir) { Remove-Item $outputDir -Recurse -Force }
New-Item -ItemType Directory -Path $outputDir | Out-Null

function Sanitize-FileName([string]$name) {
    return $name -replace '[\\/:*?"<>|]', '_'
}

function Get-FileBaseName($name, $carNumber, $months, $amount) {
    $parts = @()
    foreach ($p in @($name, $carNumber, $months, $amount)) {
        if ($p -and $p.Trim().Length -gt 0) { $parts += (Sanitize-FileName $p.Trim()) }
    }
    if ($parts.Count -eq 0) { return 'image' }
    return $parts -join '_'
}

Write-Host ''
Write-Host "Downloading images to local cache..." -ForegroundColor Cyan

$items = @()
$ok = 0
$failCount = 0
$idx = 0
for ($i = 1; $i -lt $rows.Count; $i++) {
    $fields = $rows[$i]
    if ($fields.Count -le $colUrl) { continue }
    $url = $fields[$colUrl].Trim()
    if (-not ($url -match '^https?://')) { continue }

    $name = if ($colName -ge 0 -and $colName -lt $fields.Count) { $fields[$colName].Trim() } else { '' }
    $carNumber = if ($colCarNumber -ge 0 -and $colCarNumber -lt $fields.Count) { $fields[$colCarNumber].Trim() } else { '' }
    $months = if ($colMonths -ge 0 -and $colMonths -lt $fields.Count) { $fields[$colMonths].Trim() } else { '' }
    $amount = if ($colAmount -ge 0 -and $colAmount -lt $fields.Count) { $fields[$colAmount].Trim() } else { '' }

    $idx++
    $baseName2 = Get-FileBaseName $name $carNumber $months $amount
    $fileName = "${baseName2}.jpg"
    $targetPath = Join-Path $outputDir $fileName
    $suffix = 1
    while (Test-Path $targetPath) {
        $fileName = "${baseName2}_${suffix}.jpg"
        $targetPath = Join-Path $outputDir $fileName
        $suffix++
    }

    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add('User-Agent', 'Mozilla/5.0')
        $wc.DownloadFile($url, $targetPath)

        if ((Get-Item $targetPath).Length -lt 100) { throw "File too small" }

        Write-Host ("  [{0:D3}] OK  {1}" -f $idx, $name) -ForegroundColor Green
        $ok++

        $items += @{
            Row = $i + 1
            Name = $name
            CarNumber = $carNumber
            Months = $months
            Amount = $amount
            Url = $url
            LocalFile = $targetPath
        }
    } catch {
        $failCount++
        Write-Host ("  [{0:D3}] FAIL {1} -> {2}" -f $idx, $name, $_.Exception.Message) -ForegroundColor Red
        if (Test-Path $targetPath) { Remove-Item $targetPath -Force }
    }
}

Write-Host ''
Write-Host "Downloaded: $($items.Count), Failed: $failCount" -ForegroundColor Cyan

if ($items.Count -eq 0) {
    Write-Host 'No images downloaded successfully' -ForegroundColor Yellow
    pause; exit
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host "  Downloaded: $ok, Failed: $failCount"
Write-Host "  Output dir: $outputDir"
Write-Host '========================================' -ForegroundColor Green

explorer.exe $outputDir
pause
