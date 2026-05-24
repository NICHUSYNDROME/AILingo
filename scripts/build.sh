#!/bin/bash
# ============================================================
# AILingo 构建脚本
# 支持两种模式：
#   - 预览版 (--preview):  构建前端 + 启动 Electron dev 模式
#   - 分发版 (--release):  构建完整 .app 到 release/ 目录
#
# 用法:
#   bash scripts/build.sh --preview        # 预览版
#   bash scripts/build.sh --release        # 分发版
#   bash scripts/build.sh --release --skip-build  # 跳过前端构建（仅打包）
#   bash scripts/build.sh --help           # 显示帮助
# ============================================================

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── 参数解析 ──
MODE=""
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preview)
      MODE="preview"
      shift
      ;;
    --release)
      MODE="release"
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --help|-h)
      echo -e "${CYAN}AILingo 构建脚本${NC}"
      echo ""
      echo "用法: bash scripts/build.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --preview      预览版 — 构建前端并启动 Electron"
      echo "  --release      分发版 — 构建完整的 AILingo.app"
      echo "  --skip-build   跳过前端构建（仅与 --release 搭配使用）"
      echo "  --help, -h     显示此帮助信息"
      echo ""
      echo "示例:"
      echo "  bash scripts/build.sh --preview"
      echo "  bash scripts/build.sh --release"
      echo "  bash scripts/build.sh --release --skip-build"
      exit 0
      ;;
    *)
      echo -e "${RED}未知参数: $1${NC}"
      echo "使用 --help 查看帮助"
      exit 1
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo -e "${RED}请指定模式：--preview 或 --release${NC}"
  echo "使用 --help 查看帮助"
  exit 1
fi

# ════════════════════════════════════════════
#  工具函数
# ════════════════════════════════════════════

log_info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependency() {
  if ! command -v "$1" &> /dev/null; then
    log_error "缺少依赖: $1"
    log_info "请先安装: $2"
    exit 1
  fi
}

# ════════════════════════════════════════════
#  检查依赖
# ════════════════════════════════════════════

check_dependency "node" "brew install node"
check_dependency "npx"  "npm install -g npx"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  log_info "安装依赖..."
  npm install
  log_ok "依赖安装完成"
fi

# ════════════════════════════════════════════
#  前端构建
# ════════════════════════════════════════════

if [ "$SKIP_BUILD" = false ]; then
  log_info "构建前端生产版本..."
  npm run build
  log_ok "前端构建完成"
else
  log_info "跳过前端构建（使用已有的 dist/）"
fi

# ════════════════════════════════════════════
#  预览模式
# ════════════════════════════════════════════

if [ "$MODE" = "preview" ]; then
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  预览模式 — 启动 Electron${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  echo ""

  # 检查 Electron 二进制
  ELECTRON_BINARY="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  if [ ! -f "$ELECTRON_BINARY" ]; then
    log_error "Electron 二进制不存在，请先运行 npm install"
    exit 1
  fi

  # 确保二进制是正确的可执行文件
  FILE_TYPE=$(file "$ELECTRON_BINARY" 2>/dev/null)
  if echo "$FILE_TYPE" | grep -q "shared library"; then
    log_warn "Electron 二进制类型异常，尝试修复..."
    if [ -f "scripts/fix-electron-binary.sh" ]; then
      bash scripts/fix-electron-binary.sh
    fi
  fi

  log_info "启动 Electron（加载 dist/index.html）..."
  echo ""
  echo -e "  ${YELLOW}提示: Electron 窗口加载的是本地构建产物${NC}"
  echo -e "  ${YELLOW}路径: $(pwd)/dist/index.html${NC}"
  echo -e "  ${YELLOW}如需开发模式（热更新），请运行: npm run dev${NC}"
  echo ""

  # 用 electron 运行主进程（非开发模式）
  npx electron electron/main.cjs

  log_ok "预览已退出"
  exit 0
fi

# ════════════════════════════════════════════
#  分发模式 — 打包 .app
# ════════════════════════════════════════════

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  分发模式 — 构建 AILingo.app${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""

ELECTRON_DIST="node_modules/electron/dist"
ELECTRON_APP="$ELECTRON_DIST/Electron.app"

# 检查 Electron
if [ ! -f "$ELECTRON_APP/Contents/MacOS/Electron" ]; then
  log_error "Electron 二进制不存在: $ELECTRON_APP/Contents/MacOS/Electron"
  exit 1
fi

log_info "清空旧的 release/AILingo.app..."
rm -rf "release/AILingo.app"

log_info "创建目录结构..."
mkdir -p "release/AILingo.app/Contents/MacOS"
mkdir -p "release/AILingo.app/Contents/Resources/app"

log_info "复制 Frameworks..."
cp -Rf "$ELECTRON_APP/Contents/Frameworks" "release/AILingo.app/Contents/"

log_info "复制可执行文件..."
cp "$ELECTRON_APP/Contents/MacOS/Electron" "release/AILingo.app/Contents/MacOS/AILingo"
chmod +x "release/AILingo.app/Contents/MacOS/AILingo"

log_info "复制前端资源..."
cp -R dist/* "release/AILingo.app/Contents/Resources/app/"

log_info "复制图标..."
mkdir -p "release/AILingo.app/Contents/Resources"
cp public/icon.icns "release/AILingo.app/Contents/Resources/"

log_info "复制主进程..."
mkdir -p "release/AILingo.app/Contents/Resources/app/electron"
cp electron/main.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp electron/preload.cjs "release/AILingo.app/Contents/Resources/app/electron/"
cp daemon.cjs "release/AILingo.app/Contents/Resources/app/"

log_info "复制 package.json..."
cp package.json "release/AILingo.app/Contents/Resources/app/"

log_info "复制 TTS 服务器..."
mkdir -p "release/AILingo.app/Contents/Resources/app/server"
cp server/tts-server.cjs "release/AILingo.app/Contents/Resources/app/server/"
cp server/tts-proxy.cjs "release/AILingo.app/Contents/Resources/app/server/"

log_info "创建 Info.plist..."
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

log_info "创建 PkgInfo..."
echo "APPL????" > "release/AILingo.app/Contents/PkgInfo"

# ════════════════════════════════════════════
#  代码签名（ad-hoc）
# ════════════════════════════════════════════

echo ""
log_info "进行 ad-hoc 签名..."

# 1. 对 Frameworks 签名
log_info "  [1/3] 签名 Frameworks..."
codesign --force --deep --sign - \
  "release/AILingo.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" \
  2>/dev/null || log_warn "  Electron Framework 签名跳过"

find "release/AILingo.app/Contents/Frameworks" \( -name "*.dylib" -o -name "*.so" \) 2>/dev/null | while read -r lib; do
  codesign --force --sign - "$lib" 2>/dev/null || true
done

find "release/AILingo.app/Contents/Frameworks" -name "*.framework" -d 2>/dev/null | while read -r fw; do
  codesign --force --sign - "$fw" 2>/dev/null || true
done

# 2. 对 Helper 可执行文件签名
log_info "  [2/3] 签名 Helper 进程..."
find "release/AILingo.app/Contents/Frameworks" -type f -perm +111 \
  -not -name "*.dylib" -not -name "*.plist" -not -name "*.png" -not -name "*.icns" 2>/dev/null | while read -r helper; do
  if file "$helper" | grep -q "Mach-O"; then
    codesign --force --sign - "$helper" 2>/dev/null || true
  fi
done

# 3. 对整个应用签名
log_info "  [3/3] 对整个应用进行 ad-hoc 签名..."
codesign --force --deep --sign - "release/AILingo.app"

echo ""
log_info "签名验证:"
codesign -dvvv "release/AILingo.app" 2>&1 || log_warn "  (ad-hoc 签名验证完成，非 Apple 开发者签名)"

# ════════════════════════════════════════════
#  完成
# ════════════════════════════════════════════

APP_SIZE=$(du -sh "release/AILingo.app" | cut -f1)

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ 打包完成！${NC}"
echo -e "${GREEN}  应用路径: ${CYAN}release/AILingo.app${NC}"
echo -e "${GREEN}  大小: ${CYAN}$APP_SIZE${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  使用说明："
echo -e "    ${YELLOW}双击打开:${NC} open release/AILingo.app"
echo -e "    ${YELLOW}移到应用:${NC} cp -R release/AILingo.app /Applications/"
echo ""
echo -e "  ${YELLOW}如需分发给他人，请打包成 ZIP：${NC}"
echo -e "    ditto -c -k --sequesterRsrc --keepParent \\"
echo -e "      release/AILingo.app release/AILingo.zip"
echo ""

exit 0
