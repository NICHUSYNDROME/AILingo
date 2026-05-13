-- English AI Learn Launcher
-- 在终端中启动服务，用户可以看到窗口并随时 Ctrl+C 停止

tell application "Terminal"
    -- 打开新终端窗口
    do script "/Users/nichu/English_AI_Learn/english-ai-learn/start.sh"
    activate
end tell
