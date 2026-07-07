#!/bin/bash
# Mac 版 - 拖入 CSV 即可生成 HTML 下载页面（零依赖，只用 bash+awk+curl）

set -e

CSV="$1"
if [ -z "$CSV" ] && [ $# -eq 0 ]; then
    read -p "拖入 CSV 文件路径: " CSV
fi
if [ ! -f "$CSV" ]; then
    echo "文件不存在: $CSV"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASENAME="$(basename "$CSV" | sed 's/\.[^.]*$//')"
IMAGE_DIR="$SCRIPT_DIR/${BASENAME}_images"
HTML="$SCRIPT_DIR/${BASENAME}_下载凭证.html"

echo "读取: $CSV"

# ---- 解析 CSV 表头，找各列位置 ----
HEADER=$(head -1 "$CSV")
COL_URL=-1
COL_NAME=-1
COL_CAR=-1
COL_MONTHS=-1
COL_AMOUNT=-1
ci=0
while IFS= read -r -d ',' col || [ -n "$col" ]; do
    col="${col//\"/}"
    if [[ "$col" == *"凭证"* || "$col" == *"voucher"* || "$col" == *"链接"* ]]; then
        COL_URL=$ci
    fi
    if [[ "$col" == *"姓名"* || "$col" == *"name"* ]]; then
        COL_NAME=$ci
    fi
    if [[ "$col" == *"车牌"* || "$col" == *"car"* ]]; then
        COL_CAR=$ci
    fi
    if [[ "$col" == *"月数"* || "$col" == *"month"* ]]; then
        COL_MONTHS=$ci
    fi
    if [[ "$col" == *"金额"* || "$col" == *"amount"* ]]; then
        COL_AMOUNT=$ci
    fi
    ((ci++))
done <<< "${HEADER},"

if [ $COL_URL -lt 0 ]; then
    echo "未找到「凭证链接」列"
    exit 1
fi

# ---- 准备图片目录 ----
rm -rf "$IMAGE_DIR"
mkdir -p "$IMAGE_DIR"

# ---- 用 curl 批量下载图片到本地 ----
echo ""
echo "下载图片到本地缓存..."

ITEMS_JSON=""
COUNT=0
IDX=0
FAIL=0
line_num=0

while IFS=$'\t' read -r URL NAME CAR MONTHS AMOUNT; do
    ((line_num++))
    [ -z "$URL" ] && continue

    if [[ "$URL" =~ ^https?:// ]]; then
        ((IDX++))
        LOCAL_FILE="$IMAGE_DIR/voucher_$(printf '%03d' $IDX).jpg"

        if curl -sSL -A "Mozilla/5.0" -o "$LOCAL_FILE" "$URL" 2>/dev/null \
           && [ -s "$LOCAL_FILE" ] && [ $(stat -f%z "$LOCAL_FILE" 2>/dev/null || stat -c%s "$LOCAL_FILE") -gt 100 ]; then
            echo "  [$(printf '%03d' $IDX)] OK  $NAME"

            SAFE_NAME="${NAME//\\/\\\\}"
            SAFE_NAME="${SAFE_NAME//\"/\\\"}"
            SAFE_URL="${URL//\\/\\\\}"
            SAFE_URL="${SAFE_URL//\"/\\\"}"
            SAFE_CAR="${CAR//\\/\\\\}"
            SAFE_CAR="${SAFE_CAR//\"/\\\"}"
            SAFE_MONTHS="${MONTHS//\\/\\\\}"
            SAFE_MONTHS="${SAFE_MONTHS//\"/\\\"}"
            SAFE_AMOUNT="${AMOUNT//\\/\\\\}"
            SAFE_AMOUNT="${SAFE_AMOUNT//\"/\\\"}"

            ROW=$((line_num + 1))
            if [ $COUNT -gt 0 ]; then
                ITEMS_JSON+=$',\n'
            fi
            ITEMS_JSON+="    { \"localUri\": \"file://$LOCAL_FILE\", \"name\": \"$SAFE_NAME\", \"carNumber\": \"$SAFE_CAR\", \"months\": \"$SAFE_MONTHS\", \"amount\": \"$SAFE_AMOUNT\", \"idx\": $ROW }"
            ((COUNT++))
        else
            echo "  [$(printf '%03d' $IDX)] FAIL $NAME"
            rm -f "$LOCAL_FILE"
            ((FAIL++))
        fi
    fi
done < <(tail -n +2 "$CSV" | awk -v FS=',' -v u=$COL_URL -v n=$COL_NAME -v c=$COL_CAR -v m=$COL_MONTHS -v a=$COL_AMOUNT '{
    for (i=1; i<=NF; i++) { gsub(/^"|"$/, "", $i); }
    print $u "\t" $n "\t" $c "\t" $m "\t" $a
}')

echo ""
echo "下载成功: $COUNT, 失败: $FAIL"

if [ $COUNT -eq 0 ]; then
    echo "没有图片下载成功"
    exit 1
fi

# ---- 生成 HTML ----
cat > "$HTML" << HTMLEOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$BASENAME - 下载凭证图片</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif; background: #f5f5f5; padding: 20px; }
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
<h1>$BASENAME</h1>
<div class="sub">共 $COUNT 张凭证图片 · 已下载到本地</div>

<div class="toolbar" id="toolbar">
  <button class="btn-all" onclick="downloadAll()">⬇ 下载全部 ($COUNT 张)</button>
</div>

<div class="progress" id="progress">
  <span id="progressText">准备中...</span>
  <div class="bar"><div class="bar-inner" id="progressBar" style="width:0%"></div></div>
</div>

<div class="grid" id="grid"></div>

<script>
const items = [
$ITEMS_JSON
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

// file:// 页面上 <a download href="file:///..."> 会被 Chrome 无视，直接预览文件
// 解法：把 <img> 读到 Canvas → toBlob → URL.createObjectURL → <a download>（blob: 同源，必定生效）
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
            '<a href="' + item.localUri + '" target="_blank" rel="noopener">' +
                '<img id="img' + i + '" src="' + item.localUri + '" loading="lazy">' +
            '</a>' +
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
HTMLEOF

echo ""
echo "========================================"
echo "  已生成 HTML: $(basename "$HTML")"
echo "  图片缓存目录: $(basename "$IMAGE_DIR")"
echo "  浏览器打开 → 点击「下载全部」"
echo "========================================"

open "$HTML"
