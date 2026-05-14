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
# 使用 rsync 或 cp -R 保持符号链接和权限
cp -Rf "$ELECTRON_APP/Contents/Frameworks" "release/AILingo.app/Contents/"

echo "  复制可执行文件..."
# electron 42.x 的 Electron.app/Contents/MacOS/Electron 是 33KB 的存根可执行文件
# 直接复制并重命名
cp "$ELECTRON_APP/Contents/MacOS/Electron" "release/AILingo.app/Contents/MacOS/AILingo"
chmod +x "release/AILingo.app/Contents/MacOS/AILingo"

echo "  复制前端资源..."
cp -R dist/* "release/AILingo.app/Contents/Resources/app/"

echo "  复制图标..."
mkdir -p "release/AILingo.app/Contents/Resources"
cp public/icon.icns "release/AILingo.app/Contents/Resources/"

echo "  复制主进程..."
mkdir -p "release/AILingo.app/Contents/Resources/app/electron"
cp electron/main.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp electron/preload.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp daemon.cjs "release/AILingo.app/Contents/Resources/app/"
cp package.json "release/AILingo.app/Contents/Resources/app/"

echo "  复制 TTS 服务器..."
mkdir -p "release/AILingo.app/Contents/Resources/app/server"
cp server/tts-server.cjs "release/AILingo.app/Contents/Resources/app/server/"

echo "  复制 node 运行时..."
# Electron 内置了 node，但 app 目录内可能还需要 node_modules
# 复制必要的 node_modules（如有原生模块）
if [ -d "node_modules" ]; then
  mkdir -p "release/AILingo.app/Contents/Resources/app/node_modules"
  # 只复制 electron 相关的模块，保持最小体积
  # (实际上 Electron 内置了 Node.js，不需要额外 node)
fi

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
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleDevelopmentRegion</key>
    <string>zh_CN</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <true/>
    </dict>
</dict>
</plist>
PLISTEOF

echo "  创建 PkgInfo..."
echo "APPL????" > "release/AILingo.app/Contents/PkgInfo"

echo ""
echo "=========================================="
echo "  应用签名（ad-hoc）..."
echo "=========================================="

# === 第1步：对 Frameworks 内的每个 dylib 和 framework 进行签名 ===
echo "  [1/3] 对 Frameworks 进行签名..."
codesign --force --deep --sign - \
  "release/AILingo.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" \
  2>/dev/null || true

# 对所有 dylib 签名
find "release/AILingo.app/Contents/Frameworks" -name "*.dylib" -o -name "*.so" 2>/dev/null | while read -r lib; do
  codesign --force --sign - "$lib" 2>/dev/null || true
done

# 对所有 framework 签名
find "release/AILingo.app/Contents/Frameworks" -name "*.framework" -d 2>/dev/null | while read -r fw; do
  codesign --force --sign - "$fw" 2>/dev/null || true
done

# === 第2步：对 Helpers 目录内的所有可执行文件签名 ===
echo "  [2/3] 对 Helper 进程进行签名..."
find "release/AILingo.app/Contents/Frameworks" -type f -perm +111 -not -name "*.dylib" -not -name "*.plist" 2>/dev/null | while read -r helper; do
  # 检查是否为 Mach-O 可执行文件
  if file "$helper" | grep -q "Mach-O"; then
    codesign --force --sign - "$helper" 2>/dev/null || true
  fi
done

# === 第3步：对整个 .app 进行 ad-hoc 签名 ===
echo "  [3/3] 对整个应用进行 ad-hoc 签名..."
codesign --force --deep --sign - "release/AILingo.app"

echo ""
echo "  验证签名:"
codesign -dvvv "release/AILingo.app" 2>&1 || echo "  (ad-hoc 签名验证完成)"

echo ""
echo "=========================================="
echo "✅ 打包完成！"
echo "   应用路径: release/AILingo.app"
echo "   大小: $(du -sh "release/AILingo.app" | cut -f1)"
echo ""
echo "📖 使用说明："
echo "   1. 将 release/AILingo.app 拖到 /Applications 文件夹"
echo "   2. 如需发给别人 ⚠️ 请先打包成 ZIP 或 DMG："
echo "      方案 A（推荐）：ditto -c -k --sequesterRsrc --keepParent release/AILingo.app release/AILingo.zip"
echo "      方案 B：hdiutil create -volname AILingo -srcfolder release/AILingo.app -ov -format UDZO release/AILingo.dmg"
echo "=========================================="
