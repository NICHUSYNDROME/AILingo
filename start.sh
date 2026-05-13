#!/bin/bash

# =============================================
#  English AI Learn — 增强版启动脚本
#  解决 Automator 启动时环境变量和路径问题
# =============================================

# 强制设置工作目录
cd /Users/nichu/English_AI_Learn/english-ai-learn
export HOME=/Users/nichu

# 设置 Node 路径（Automator 环境下可能找不到）
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

PROJECT_DIR="/Users/nichu/English_AI_Learn/english-ai-learn"
LOG_FILE="$PROJECT_DIR/server.log"

echo "=========================================" | tee "$LOG_FILE"
echo "  English AI Learn — 启动中..." | tee -a "$LOG_FILE"
echo "  项目路径: $PROJECT_DIR" | tee -a "$LOG_FILE"
echo "=========================================" | tee -a "$LOG_FILE"

# 关闭可能残留的旧进程
echo "→ 清理旧进程..." | tee -a "$LOG_FILE"
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# 启动 TTS 后端
echo "→ 启动 TTS 后端代理 (port 3001)..." | tee -a "$LOG_FILE"
cd "$PROJECT_DIR"
node server/tts-server.cjs >> "$LOG_FILE" 2>&1 &
TTS_PID=$!
echo "   PID: $TTS_PID" | tee -a "$LOG_FILE"
sleep 1

# 启动 Vite 前端
echo "→ 启动 Vite 前端..." | tee -a "$LOG_FILE"
cd "$PROJECT_DIR"
npx vite >> "$LOG_FILE" 2>&1 &
VITE_PID=$!
echo "   PID: $VITE_PID" | tee -a "$LOG_FILE"
sleep 2

# 检查是否启动成功
if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "" | tee -a "$LOG_FILE"
  echo "=========================================" | tee -a "$LOG_FILE"
  echo "  启动成功！" | tee -a "$LOG_FILE"
  echo "  前端: http://localhost:5173" | tee -a "$LOG_FILE"
  echo "  TTS:  http://localhost:3001" | tee -a "$LOG_FILE"
  echo "=========================================" | tee -a "$LOG_FILE"
  
  # 自动打开浏览器
  sleep 1
  open "http://localhost:5173"
else
  echo "⚠️ 启动可能失败，请查看日志: $LOG_FILE" | tee -a "$LOG_FILE"
fi

# 保持进程运行
echo ""
echo "服务运行中... 关闭此窗口将停止所有服务。"
echo "按 Ctrl+C 停止"

# 捕获退出信号
cleanup() {
  echo ""
  echo "正在停止所有服务..." | tee -a "$LOG_FILE"
  kill $TTS_PID 2>/dev/null
  kill $VITE_PID 2>/dev/null
  echo "已停止。" | tee -a "$LOG_FILE"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 等待 Vite 进程结束（浏览器关闭后 TTS 心跳超时自动退出，
# 或用户 Ctrl+C 手动停止），结束后自动清理
wait $VITE_PID
echo "Vite 进程已退出。" | tee -a "$LOG_FILE"
cleanup
