#!/bin/bash
# AILingo 手动打包脚本
# 当 electron-builder 不可用或失败时使用
# 运行方式：bash scripts/manual-pack.sh

set -e

echo "📦 手动打包 AILingo.app..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ELECTRON_DIST="node_modules/electron/dist"
ELECTRON_APP="$ELECTRON_DIST/Electron.app"

if [ ! -f "$ELECTRON_APP/Contents/MacOS/Electron" ] && [ ! -L "$ELECTRON_APP/Contents/MacOS/Electron" ]; then
  echo "❌ 错误: Electron 二进制文件不存在: $ELECTRON_APP/Contents/MacOS/Electron"
  exit 1
fi

rm -rf "release/AILingo.app"
mkdir -p "release/AILingo.app/Contents/MacOS"
mkdir -p "release/AILingo.app/Contents/Resources/app"

echo "  复制 Frameworks..."
cp -R "$ELECTRON_APP/Contents/Frameworks" "release/AILingo.app/Contents/"

echo "  复制可执行文件..."
if [ -L "$ELECTRON_APP/Contents/MacOS/Electron" ]; then
  REAL_BINARY=$(readlink "$ELECTRON_APP/Contents/MacOS/Electron")
  cp "$ELECTRON_APP/Contents/MacOS/$REAL_BINARY" "release/AILingo.app/Contents/MacOS/AILingo"
else
  cp "$ELECTRON_APP/Contents/MacOS/Electron" "release/AILingo.app/Contents/MacOS/AILingo"
fi
chmod +x "release/AILingo.app/Contents/MacOS/AILingo"

echo "  复制前端资源..."
cp -R dist/* "release/AILingo.app/Contents/Resources/app/"

echo "  复制主进程..."
mkdir -p "release/AILingo.app/Contents/Resources/app/electron"
cp electron/main.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp electron/preload.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp daemon.cjs "release/AILingo.app/Contents/Resources/app/"
cp package.json "release/AILingo.app/Contents/Resources/app/"

echo "  创建 Info.plist..."
cat > "release/AILingo.app/Contents/Info.plist" << 'PLISTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>AILingo</string>
    <key>CFBundleDisplayName</key>
    <string>AILingo</string>
    <key>CFBundleIdentifier</key>
    <string>com.ailingo.app</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>AILingo</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLISTEOF

echo ""
echo "✅ 手动打包完成！"
echo "   应用路径: release/AILingo.app"
du -sh "release/AILingo.app"
ls -lh "release/AILingo.app/Contents/MacOS/AILingo"
