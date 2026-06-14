#!/bin/bash
# 打包升级ZIP（排除node_modules和数据）
set -e
VERSION=$(node -e "console.log(require('./apps/web/package.json').version)")
OUTPUT="multi-shop-link-v${VERSION}.zip"
echo "打包版本: v${VERSION}"

# 清理旧构建
rm -rf apps/web/dist
cd apps/web && npm run build && cd ../..

# 创建ZIP（排除大文件和数据）
zip -r "${OUTPUT}" . \
    -x "node_modules/*" \
    -x "*/node_modules/*" \
    -x "apps/server/data/*" \
    -x "apps/server/backups/*" \
    -x "apps/server/uploads/*" \
    -x "apps/server/logs/*" \
    -x ".git/*" \
    -x "*.zip"

echo "升级包已生成: ${OUTPUT}"
echo "大小: $(du -h ${OUTPUT} | cut -f1)"
