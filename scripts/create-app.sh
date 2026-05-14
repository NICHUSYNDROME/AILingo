#!/bin/bash
# AILingo 打包脚本
# 运行方式：bash scripts/create-app.sh

set -e

echo "🔨 开始打包 AILingo..."

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. 构建前端生产版本
echo "📦 构建前端..."
npm run build

# 2. 打包 Electron 应用
# 使用手动打包（electron-builder 在 Electron 42.x 有兼容问题）
echo "📦 使用手动打包..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/manual-pack.sh"

# 3. 创建 Platypus 菜单栏应用（如果 Platypus 可用）
if command -v platypus &> /dev/null; then
  echo "🍎 创建菜单栏应用..."

# 准备应用资源目录
APP_RESOURCES="release/AILingo-menu.app/Contents/Resources"
mkdir -p "$APP_RESOURCES"

# 复制启动脚本
  if [ -f "scripts/launcher.sh" ] && [ -f "scripts/menu.applescript" ]; then
cp scripts/launcher.sh "$APP_RESOURCES/"
cp scripts/menu.applescript "$APP_RESOURCES/"
chmod +x "$APP_RESOURCES/launcher.sh"

# 使用 Platypus 创建菜单栏应用
platypus \
    --name "AILingo" \
    --app-icon "public/icon.icns" \
    --interface-type "Status Menu" \
    --script-type "AppleScript" \
    --script "scripts/menu.applescript" \
    --author "AILingo Team" \
    --version "1.0.0" \
    --bundled-file "$APP_RESOURCES/launcher.sh" \
    "release/AILingo.app"
  else
    echo "  ⚠️ 菜单栏脚本文件不存在，跳过菜单栏应用创建"
  fi
else
  echo "  🍎 Platypus 未安装，跳过菜单栏应用创建"
  echo "     如需菜单栏支持，请运行: brew install platypus"
fi

echo ""
echo "✅ 打包完成！"
echo "   应用路径: release/AILingo.app"
echo ""
echo "📖 使用方法："
echo "   1. 将 release/AILingo.app 拖到 /Applications 文件夹"
echo "   2. 双击 AILingo.app 启动"
echo "   3. 菜单栏会出现 AILingo 图标"

