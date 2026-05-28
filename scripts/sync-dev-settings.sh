#!/bin/bash
# ============================================================
# 开发环境数据同步：将 Electron 生产数据单向复制到浏览器测试环境
# 只读单向：生产 → 测试（不会反向影响生产数据）
# ============================================================
SRC="$HOME/Library/Application Support/english-ai-learn/ailingo_settings.json"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/__dev_settings.json"

if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST"
  echo "✅ 已同步 $(wc -c < "$SRC" | tr -d ' ') 字节生产数据到测试环境"
else
  echo "⚠️  未找到 Electron 数据文件，跳过同步"
fi
