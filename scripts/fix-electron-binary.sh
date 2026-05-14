#!/bin/bash
# 修复 Electron 二进制文件
# 确保 MacOS/Electron 是正确的可执行存根（33KB executable），
# 而不是错误复制的 Framework 共享库（174MB dylib）
# 用法: bash scripts/fix-electron-binary.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ELECTRON_BINARY="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
ELECTRON_FRAMEWORK_DIR="node_modules/electron/dist/Electron.app/Contents/Frameworks"
FIXTURE="/tmp/clean-electron/Electron.app"

# 如果还没有干净的原始解压版本，重新解压
if [ ! -f "$FIXTURE/Contents/MacOS/Electron" ]; then
  # 尝试从已有 zip 中获取
  for ZIP in /tmp/electron-new.zip /tmp/electron-github.zip /tmp/electron-v42.0.1-darwin-arm64.zip; do
    if [ -f "$ZIP" ]; then
      echo "  从 $ZIP 解压获取原始存根..."
      rm -rf "$FIXTURE"
      unzip -q "$ZIP" -d /tmp/clean-electron/
      break
    fi
  done
fi

if [ ! -f "$FIXTURE/Contents/MacOS/Electron" ]; then
  echo "❌ 错误: 找不到原始 Electron 存根文件"
  exit 1
fi

# 检查并修复 MacOS/Electron
if [ -f "$ELECTRON_BINARY" ]; then
  FILE_TYPE=$(file "$ELECTRON_BINARY" 2>/dev/null)
  BINARY_SIZE=$(stat -f%z "$ELECTRON_BINARY" 2>/dev/null || stat -c%s "$ELECTRON_BINARY" 2>/dev/null)
  
  # 如果是共享库（被错误复制）或大小异常
  if echo "$FILE_TYPE" | grep -q "shared library"; then
    echo "  检测到错误的共享库类型，替换为可执行存根..."
    cp "$FIXTURE/Contents/MacOS/Electron" "$ELECTRON_BINARY"
    chmod +x "$ELECTRON_BINARY"
    echo "  ✅ 已修复: $(file "$ELECTRON_BINARY")"
  else
    echo "  ✅ MacOS/Electron 类型正确: $(file "$ELECTRON_BINARY" | awk -F: '{print $2}')"
  fi
fi

# 检查 Frameworks 是否存在
if [ ! -d "$ELECTRON_FRAMEWORK_DIR" ]; then
  echo "❌ 错误: Frameworks 目录不存在: $ELECTRON_FRAMEWORK_DIR"
  exit 1
fi

echo "  总大小: $(du -sh node_modules/electron/dist/ | cut -f1)"
echo "✅ Electron 二进制修复完成"
