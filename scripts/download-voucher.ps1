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
$outputDir = Join-Path $scriptDir ($baseName + '_vouchers')
$htmlPath = Join-Path $scriptDir ($baseName + '_下载凭证.html')

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

# 构建 HTML items JSON
$outDirName = [IO.Path]::GetFileName($outputDir)
$itemJsonParts = @()
foreach ($it in $items) {
    $safeName = $it.Name.Replace('\','\\').Replace('"','\"').Replace("`n",' ').Replace("`r",' ')
    $safeCar = $it.CarNumber.Replace('\','\\').Replace('"','\"').Replace("`n",' ').Replace("`r",' ')
    $safeMonths = $it.Months.Replace('\','\\').Replace('"','\"').Replace("`n",' ').Replace("`r",' ')
    $safeAmount = $it.Amount.Replace('\','\\').Replace('"','\"').Replace("`n",' ').Replace("`r",' ')
    $imgFileName = [IO.Path]::GetFileName($it.LocalFile)
    $relativeSrc = './' + $outDirName + '/' + $imgFileName
    $itemJsonParts += "    { ""src"": ""$relativeSrc"", ""name"": ""$safeName"", ""carNumber"": ""$safeCar"", ""months"": ""$safeMonths"", ""amount"": ""$safeAmount"", ""idx"": $($it.Row) }"
}
$itemJson = $itemJsonParts -join ",`n"

$html = @'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__ - 下载凭证图片</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Microsoft YaHei', sans-serif; background: #f5f5f5; padding: 20px; }
h1 { font-size: 18px; margin-bottom: 4px; }
.sub { color: #999; font-size: 13px; margin-bottom: 16px; }
.toolbar { position: sticky; top: 10px; z-index: 10; background: #fff; padding: 12px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1); margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.toolbar button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
.btn-all { background: #07c160; color: #fff; }
.btn-all:hover { background: #06ad56; }
.progress { position: sticky; top: 10px; z-index: 10; background: #fff; padding: 10px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1); margin-bottom: 16px; display: none; }
.progress .bar { height: 6px; background: #e0e0e0; border-radius: 3px; margin-top: 6px; overflow: hidden; }
.progress .bar-inner { height: 100%; background: #07c160; border-radius: 3px; transition: width .3s; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); transition: box-shadow .2s; }
.card:hover { box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.card img { width: 100%; height: 150px; object-fit: cover; display: block; background: #eee; }
.card-info { padding: 8px 10px; }
.card-name { font-size: 13px; font-weight: bold; word-break: break-all; }
.card-status { font-size: 12px; margin-top: 2px; }
.status-ok { color: #07c160; }
.status-pending { color: #999; }
.download { float: right; color: #07c160; text-decoration: none; font-size: 13px; }
.download:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>__TITLE__</h1>
<div class="sub">共 __COUNT__ 张凭证图片 · 已下载到本地</div>

<div class="toolbar" id="toolbar">
  <button class="btn-all" onclick="downloadAll()">下载全部 (__COUNT__ 张)</button>
</div>

<div class="progress" id="progress">
  <span id="progressText">准备中...</span>
  <div class="bar"><div class="bar-inner" id="progressBar" style="width:0%"></div></div>
</div>

<div class="grid" id="grid">
</div>

<script>
const items = [
__ITEMS__
];

function buildFileName(item) {
    var parts = [item.name, item.carNumber, item.months, item.amount].filter(function(v) { return v && v.length > 0; });
    return (parts.join('_') || 'image').replace(/[\\/:*?"<>|]/g, '_') + '.jpg';
}

function updateStatus(i, state, msg) {
    var el = document.getElementById('status' + i);
    if (el) {
        el.textContent = msg || (state === 'ok' ? '✓ 已触发下载' : '✗ 失败');
        el.className = 'card-status status-' + state;
    }
}

function downloadViaCanvas(imgId, i) {
    var img = document.getElementById(imgId);
    if (!img) return;
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = buildFileName(items[i]);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }, 'image/jpeg', 0.95);
}

function downloadOne(i, callback) {
    var imgId = 'img' + i;
    var img = document.getElementById(imgId);
    if (!img || !img.complete || img.naturalWidth === 0) {
        updateStatus(i, 'fail', '图片未加载');
        if (callback) callback();
        return;
    }
    try {
        downloadViaCanvas(imgId, i);
        updateStatus(i, 'ok', '✓ 已触发下载');
    } catch (e) {
        updateStatus(i, 'fail', '✗ ' + e.message);
    }
    if (callback) setTimeout(callback, 200);
}

function render() {
    var grid = document.getElementById('grid');
    grid.innerHTML = items.map(function(item, i) {
        return '<div class="card" id="card' + i + '">' +
            '<img id="img' + i + '" src="' + item.src + '" loading="lazy">' +
            '<div class="card-info">' +
                '<div class="card-name">#' + (i+1) + ' ' + item.name + '</div>' +
                '<div class="card-status status-pending" id="status' + i + '">等待下载</div>' +
                '<a class="download" href="javascript:void(0)" onclick="downloadOne(' + i + ')">单张下载</a>' +
            '</div>' +
        '</div>';
    }).join('');
}

function downloadAll() {
    document.getElementById('progress').style.display = 'block';
    var total = items.length;
    var idx = 0;

    function next() {
        if (idx >= total) {
            document.getElementById('progressText').textContent = '完成! 共 ' + total + ' 张';
            document.getElementById('progressBar').style.width = '100%';
            return;
        }
        document.getElementById('progressText').textContent = '下载中: ' + (idx+1) + '/' + total + ' - ' + items[idx].name;
        document.getElementById('progressBar').style.width = ((idx/total)*100) + '%';
        downloadOne(idx, function() { idx++; next(); });
    }
    next();
}

render();
</script>
</body>
</html>
'@

$html = $html.Replace('__TITLE__', $baseName)
$html = $html.Replace('__COUNT__', "$($items.Count)")
$html = $html.Replace('__ITEMS__', $itemJson)

[IO.File]::WriteAllText($htmlPath, $html, [Text.Encoding]::UTF8)

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host "  HTML generated: $htmlPath"
Write-Host "  用 Chrome 打开 HTML，点击「下载全部」"
Write-Host "  Downloaded: $ok"
Write-Host "  Output dir: $outputDir"
Write-Host '========================================' -ForegroundColor Green

Start-Process $htmlPath
explorer.exe $outputDir
pause
