#!/bin/bash
# Mac 版 - 拖入 CSV 直接下载凭证图片到本地（零依赖，只用 bash+awk+curl）
# 用法: 拖 CSV 到脚本上，或双击后输入路径

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
TIMESTAMP="$(date +'%Y%m%d%H%M%S')"
OUTPUT_DIR="$SCRIPT_DIR/${TIMESTAMP}_${BASENAME}"

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
    col="${col// /}"
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

# ---- 准备输出目录 ----
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# 清理文件名中的非法字符
sanitize() {
    echo "$1" | sed 's|[\\/:*?"<>|]|_|g'
}

# ---- 用 curl 批量下载图片到本地 ----
echo ""
echo "下载凭证图片..."

OK=0
FAIL=0
IDX=0
line_num=0

while IFS=$'\t' read -r URL NAME CAR MONTHS AMOUNT; do
    ((line_num++))
    [ -z "$URL" ] && continue

    if [[ "$URL" =~ ^https?:// ]]; then
        ((IDX++))

        # 构建文件名: 姓名_车牌_月数_金额.jpg
        PARTS=()
        [ -n "$NAME" ] && PARTS+=("$(sanitize "$NAME")")
        [ -n "$CAR" ] && PARTS+=("$(sanitize "$CAR")")
        [ -n "$MONTHS" ] && PARTS+=("$(sanitize "$MONTHS")")
        [ -n "$AMOUNT" ] && PARTS+=("$(sanitize "$AMOUNT")")

        if [ ${#PARTS[@]} -eq 0 ]; then
            BASE="image_$(printf '%03d' $IDX)"
        else
            BASE=$(IFS='_'; echo "${PARTS[*]}")
        fi

        FILE_NAME="${BASE}.jpg"
        TARGET="$OUTPUT_DIR/$FILE_NAME"

        # 处理同名冲突
        SFX=1
        while [ -f "$TARGET" ]; do
            FILE_NAME="${BASE}_${SFX}.jpg"
            TARGET="$OUTPUT_DIR/$FILE_NAME"
            ((SFX++))
        done

        if curl -sSL -A "Mozilla/5.0" -o "$TARGET" "$URL" 2>/dev/null \
           && [ -s "$TARGET" ] && [ $(stat -f%z "$TARGET" 2>/dev/null || stat -c%s "$TARGET") -gt 100 ]; then
            echo "  [$(printf '%03d' $IDX)] OK  $NAME  -> $FILE_NAME"
            ((OK++))
        else
            echo "  [$(printf '%03d' $IDX)] FAIL $NAME"
            rm -f "$TARGET"
            ((FAIL++))
        fi
    fi
done < <(tail -n +2 "$CSV" | awk -v FS=',' -v u=$((COL_URL+1)) -v n=$((COL_NAME+1)) -v c=$((COL_CAR+1)) -v m=$((COL_MONTHS+1)) -v a=$((COL_AMOUNT+1)) '{
    for (i=1; i<=NF; i++) { gsub(/^"|"$/, "", $i); }
    print $u "\t" $n "\t" $c "\t" $m "\t" $a
}')

echo ""
echo "========================================"
echo "  下载成功: $OK, 失败: $FAIL"
echo "  输出目录: $(basename "$OUTPUT_DIR")"
echo "========================================"

open "$OUTPUT_DIR"
