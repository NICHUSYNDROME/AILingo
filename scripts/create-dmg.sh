#!/bin/bash
# ============================================================
# AILingo DMG 打包脚本
# 手动创建可发布的 DMG 镜像，使用 icon.icns 作为应用图标
# 和卷标图标
#
# 用法:
#   bash scripts/create-dmg.sh              # 打包 DMG
#   bash scripts/create-dmg.sh --no-app     # 仅生成 DMG（不重新打包 .app）
#   bash scripts/create-dmg.sh --help       # 帮助
# ============================================================

set -e

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

SKIP_APP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-app) SKIP_APP_BUILD=true; shift ;;
    --help|-h)
      echo -e "${CYAN}AILingo DMG 打包脚本${NC}"
      echo ""
      echo "用法: bash scripts/create-dmg.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --no-app   跳过 .app 重新打包，只基于已有的 release/AILingo.app 生成 DMG"
      echo "  --help,-h  显示此帮助信息"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ════════════════════════════════════════════
#  第1步：确保 .app 已构建
# ════════════════════════════════════════════

if [ ! -d "release/AILingo.app" ]; then
  echo -e "${RED}[ERROR] release/AILingo.app 不存在${NC}"
  echo "请先运行打包脚本："
  echo "  bash scripts/build.sh --release"
  exit 1
fi

if [ "$SKIP_APP_BUILD" = false ]; then
  echo -e "${YELLOW}[可选] 是否重新构建前端 + .app？(y/n, 默认 n)${NC}"
  read -r REBUILD_APP
  if [[ "$REBUILD_APP" =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}[INFO] 重新构建 .app...${NC}"
    bash scripts/build.sh --release
  else
    echo -e "${CYAN}[INFO] 使用现有的 release/AILingo.app${NC}"
  fi
fi

# ════════════════════════════════════════════
#  第2步：准备 DMG 临时文件
# ════════════════════════════════════════════

APP_NAME="AILingo"
VOLUME_NAME="${APP_NAME} ${APP_VERSION:-1.0.0}"
DMG_NAME="${APP_NAME}.dmg"
DMG_PATH="release/${DMG_NAME}"

# 临时目录
TEMP_DIR="/tmp/ailingo-dmg-$$"
TEMP_DMG="${TEMP_DIR}/${APP_NAME}-rw.dmg"

rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# 计算 DMG 大小 (.app 大小 + 额外空间)
APP_SIZE_MB=$(du -sm "release/AILingo.app" | cut -f1)
DMG_SIZE_MB=$((APP_SIZE_MB + 50))  # 额外 50MB 空间
echo -e "${CYAN}[INFO]${NC} APP 大小: ${APP_SIZE_MB}MB, DMG 大小: ${DMG_SIZE_MB}MB"

# ════════════════════════════════════════════
#  第3步：从 icon.icns 提取图标用于 DMG
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 准备 DMG 卷标图标..."

# 从 icon.icns 提取 256x256 PNG 用于 DMG 图标
ICNS_PATH="public/icon.icns"
DMG_ICON_PATH="${TEMP_DIR}/dmg_icon.png"

if [ -f "$ICNS_PATH" ]; then
  # 使用 sips 从 icns 提取 PNG
  sips -s format png "$ICNS_PATH" --out "$DMG_ICON_PATH" &>/dev/null
  echo -e "  ${GREEN}✓${NC} 从 icon.icns 提取了 PNG 图标"
else
  echo -e "  ${YELLOW}⚠ icon.icns 不存在，使用默认图标${NC}"
fi

# ════════════════════════════════════════════
#  第4步：创建读写 DMG
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 创建临时 DMG..."

# 创建空白 DMG
hdiutil create \
  -size "${DMG_SIZE_MB}m" \
  -fs "HFS+" \
  -volname "$VOLUME_NAME" \
  -layout SPUD \
  -type UDIF \
  -ov \
  "$TEMP_DMG" 2>/dev/null

# 挂载 DMG
MOUNT_POINT="/Volumes/${VOLUME_NAME}"
hdiutil attach "$TEMP_DMG" -noverify -nobrowse -mountpoint "$MOUNT_POINT" 2>/dev/null

echo -e "  ${GREEN}✓${NC} DMG 已挂载到: ${MOUNT_POINT}"

# ════════════════════════════════════════════
#  第5步：布置 DMG 内容
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 布置 DMG 内容..."

# 复制 .app
cp -R "release/AILingo.app" "${MOUNT_POINT}/"

# 创建 /Applications 别名（软链接）
ln -s /Applications "${MOUNT_POINT}/Applications"

echo -e "  ${GREEN}✓${NC} 已复制 AILingo.app"
echo -e "  ${GREEN}✓${NC} 已创建 Applications 快捷方式"

# ════════════════════════════════════════════
#  第6步：设置 DMG 卷标图标
# ════════════════════════════════════════════

if [ -f "$DMG_ICON_PATH" ]; then
  # 将 PNG 设置到卷标的自定义图标
  # 先创建 .VolumeIcon.icns 文件
  # 使用 iconutil 从 PNG 生成 icns
  ICONSET_DIR="${TEMP_DIR}/dmg_icon.iconset"
  mkdir -p "$ICONSET_DIR"

  # 从原 icns 提取所有尺寸
  sips -z 16 16 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_16x16.png" &>/dev/null
  sips -z 32 32 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_16x16@2x.png" &>/dev/null
  sips -z 32 32 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_32x32.png" &>/dev/null
  sips -z 64 64 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_32x32@2x.png" &>/dev/null
  sips -z 128 128 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_128x128.png" &>/dev/null
  sips -z 256 256 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_128x128@2x.png" &>/dev/null
  sips -z 256 256 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_256x256.png" &>/dev/null
  sips -z 512 512 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_256x256@2x.png" &>/dev/null
  sips -z 512 512 "$DMG_ICON_PATH" --out "${ICONSET_DIR}/icon_512x512.png" &>/dev/null

  # 转换为 icns
  iconutil -c icns "${ICONSET_DIR}" -o "${TEMP_DIR}/dmg_volume.icns" 2>/dev/null

  if [ -f "${TEMP_DIR}/dmg_volume.icns" ]; then
    # 设置卷标图标
    cp "${TEMP_DIR}/dmg_volume.icns" "${MOUNT_POINT}/.VolumeIcon.icns"
    # 设置自定义图标标志
    SetFile -a C "$MOUNT_POINT" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} 已设置 DMG 卷标图标"
  fi
fi

# ════════════════════════════════════════════
#  第7步：设置 Finder 窗口布局
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 设置 Finder 窗口布局..."

# 等待 Finder 窗口出现
sleep 2

# 使用 AppleScript 设置窗口布局（带重试）
for i in 1 2 3; do
  if osascript << APPLESCRIPT 2>/dev/null
tell application "Finder"
  if not (exists window "$VOLUME_NAME") then
    return
  end if
  tell window "$VOLUME_NAME"
    set current view to icon view
    set toolbar visible to false
    set statusbar visible to false
    set bounds to {100, 100, 700, 500}
    try
      set position of item "AILingo.app" to {120, 200}
      set position of item "Applications" to {480, 200}
    end try
  end tell
  set icon size of icon view options of window "$VOLUME_NAME" to 96
  set text size of icon view options of window "$VOLUME_NAME" to 13
  set arrangement of icon view options of window "$VOLUME_NAME" to not arranged
end tell
APPLESCRIPT
  then
    echo -e "  ${GREEN}✓${NC} Finder 布局已设置"
    break
  else
    sleep 1
  fi
done

# ════════════════════════════════════════════
#  第8步：添加背景图（可选）
# ════════════════════════════════════════════

BACKGROUND_IMG="public/dmg-background.png"
if [ -f "$BACKGROUND_IMG" ]; then
  echo -e "${CYAN}[INFO]${NC} 设置 DMG 背景..."
  BACKGROUND_DIR="${MOUNT_POINT}/.background"
  mkdir -p "$BACKGROUND_DIR"
  cp "$BACKGROUND_IMG" "${BACKGROUND_DIR}/background.png"

  osascript << APPLESCRIPT
tell application "Finder"
  set background picture of icon view options of window "$VOLUME_NAME" to POSIX file "${BACKGROUND_DIR}/background.png"
end tell
APPLESCRIPT
  echo -e "  ${GREEN}✓${NC} 背景已设置"
else
  echo -e "  ${YELLOW}⚠ 背景图片不存在 ($BACKGROUND_IMG)，跳过${NC}"
fi

# ════════════════════════════════════════════
#  第9步：卸载 DMG 并转换为只读压缩 DMG
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 卸载 DMG..."
sync
hdiutil detach "$MOUNT_POINT" -force 2>/dev/null

echo -e "${CYAN}[INFO]${NC} 转换为压缩只读 DMG..."

# 删除旧 DMG
rm -f "$DMG_PATH"

# 转换为压缩 DMG（UDZO = bzip2 压缩）
hdiutil convert "$TEMP_DMG" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$DMG_PATH" 2>/dev/null

echo -e "  ${GREEN}✓${NC} DMG 已创建: ${DMG_PATH}"

# ════════════════════════════════════════════
#  第10步：清理
# ════════════════════════════════════════════

echo -e "${CYAN}[INFO]${NC} 清理临时文件..."
rm -rf "$TEMP_DIR"

# ════════════════════════════════════════════
#  完成
# ════════════════════════════════════════════

DMG_SIZE=$(du -sh "$DMG_PATH" | cut -f1)

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DMG 打包完成！${NC}"
echo -e "${GREEN}  文件: ${CYAN}${DMG_PATH}${NC}"
echo -e "${GREEN}  大小: ${CYAN}${DMG_SIZE}${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}使用方法：${NC}"
echo -e "    1. 双击 ${CYAN}release/AILingo.dmg${NC}"
echo -e "    2. 将 ${CYAN}AILingo.app${NC} 拖到 ${CYAN}Applications${NC} 文件夹"
echo -e ""
echo -e "  ${YELLOW}验证 DMG：${NC}"
echo -e "    hdiutil verify ${DMG_PATH}"

exit 0
