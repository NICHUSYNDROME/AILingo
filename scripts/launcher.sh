#!/bin/bash
# AILingo 启动器 - 被 .app 调用，无终端窗口运行

# 获取脚本所在目录（支持软链接）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 如果脚本在 .app/Contents/Resources/ 中，需要向上找到项目根目录
# Platypus 会把脚本复制到 .app/Contents/Resources/
if [[ "$SCRIPT_DIR" == *".app/Contents/Resources"* ]]; then
    APP_ROOT="$(dirname "$SCRIPT_DIR" | sed 's/\/Contents\/Resources//')"
fi

# 方案：在打包时，将项目路径写入配置文件
CONFIG_FILE="$HOME/.ailingo/config"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
else
    # 默认路径（用户可修改）
    PROJECT_DIR="/Users/$USER/English_AI_Learn/english-ai-learn"
fi

# 如果当前目录有 daemon.cjs，直接使用（开发模式）
if [ -f "$(pwd)/daemon.cjs" ]; then
    PROJECT_DIR="$(pwd)"
fi

if [ ! -d "$PROJECT_DIR" ]; then
    osascript -e "display dialog \"AILingo 项目目录不存在:\\n$PROJECT_DIR\\n\\n请在 ~/.ailingo/config 中设置正确的 PROJECT_DIR\" buttons {\"OK\"} default button 1"
    exit 1
fi

# 进入项目目录
cd "$PROJECT_DIR"

# 检查是否已有实例运行
if [ -f ".ailingo-pids.json" ]; then
    # 已有进程在运行，检查是否存活
    VITE_PID=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('.ailingo-pids.json','utf8')); console.log(p.vite?.pid || '')")
    if kill -0 "$VITE_PID" 2>/dev/null; then
        # 服务已在运行，只是打开窗口
        osascript -e "tell application \"System Events\" to if (exists process \"Electron\") then tell application \"Electron\" to activate"
        exit 0
    fi
fi

# 启动守护进程（后台运行，无终端，静默模式）
AILINGO_SILENT=1 nohup node daemon.cjs > /tmp/ailingo-daemon.log 2>&1 &

# 保存 PID 供菜单栏使用
echo $! > /tmp/ailingo-daemon.pid

echo "AILingo started"
