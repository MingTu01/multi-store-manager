#!/bin/bash
# Multi Shop Link - 打包升级ZIP
# 使用方法: ./build-upgrade.sh
set -e

VERSION=$(node -e "console.log(require('./apps/web/package.json').version)")
OUTPUT="multi-shop-link-v${VERSION}.zip"

echo "打包版本: v${VERSION}"

# 清理旧构建
rm -rf apps/web/dist
cd apps/web && npm run build && cd ../..

# 创建临时目录
STAGING="_staging_build"
rm -rf $STAGING
mkdir -p $STAGING

# 复制文件（排除大文件和数据）
rsync -av --exclude='node_modules' --exclude='.git' --exclude='backups' \
  --exclude='uploads' --exclude='logs' --exclude='data' \
  --exclude='*.zip' --exclude='test-results' --exclude='_staging*' \
  ./ $STAGING/

# 打包ZIP（使用tar确保正斜杠路径）
rm -f $OUTPUT
tar -a -cf $OUTPUT -C $STAGING .

# 清理
rm -rf $STAGING

echo "升级包已生成: $OUTPUT"
echo "大小: $(du -h $OUTPUT | cut -f1)"
echo ""
echo "部署步骤:"
echo "1. 上传 $OUTPUT 到服务器"
echo "2. 1Panel -> 运行环境 -> 停止服务"
echo "3. 解压覆盖: cd /opt && unzip -o $OUTPUT -d multi-shop-link"
echo "4. 1Panel -> 运行环境 -> 启动服务"
