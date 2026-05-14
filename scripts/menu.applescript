-- AILingo 菜单栏应用行为
-- 被 Platypus 用作菜单栏应用

property isRunning : false

on run
    -- 启动时隐藏 Dock 图标
    tell application "System Events"
        set visible of process "AILingo" to false
    end tell
    
    -- 启动守护进程
    do shell script (path to resource "launcher.sh" as text)
    
    delay 2
    set isRunning to true
end run

on openLocation theURL
    -- 处理 URL scheme（可选）
    return
end openLocation

on open theFiles
    -- 文件打开事件
    return
end open

-- 菜单项定义
on showMenu()
    set theMenu to {}
    
    if isRunning then
        set end of theMenu to {title:"✅ AILingo 运行中", enabled:false}
        set end of theMenu to {title:"-" , enabled:false}
        set end of theMenu to {title:"打开 AILingo", action:"openApp"}
        set end of theMenu to {title:"重启服务", action:"restart"}
        set end of theMenu to {title:"-" , enabled:false}
        set end of theMenu to {title:"退出 AILingo", action:"quitApp"}
    else
        set end of theMenu to {title:"⏳ AILingo 未运行", enabled:false}
        set end of theMenu to {title:"-" , enabled:false}
        set end of theMenu to {title:"启动 AILingo", action:"start"}
        set end of theMenu to {title:"退出", action:"quit"}
    end if
    
    return theMenu
end showMenu

on handleAction theAction
    if theAction is "openApp" then
        -- 打开 Electron 窗口
        do shell script "open -a Electron 2>/dev/null || osascript -e 'tell application \"System Events\" to if (exists process \"Electron\") then tell application \"Electron\" to activate'"
    else if theAction is "restart" then
        -- 重启守护进程
        do shell script "kill $(cat /tmp/ailingo-daemon.pid) 2>/dev/null; sleep 1; cd ~/English_AI_Learn/english-ai-learn && nohup node daemon.cjs > /tmp/ailingo-daemon.log 2>&1 & echo $! > /tmp/ailingo-daemon.pid"
        set isRunning to true
    else if theAction is "start" then
        do shell script (path to resource "launcher.sh" as text)
        set isRunning to true
    else if theAction is "quitApp" then
        -- 停止守护进程并退出
        do shell script "kill $(cat /tmp/ailingo-daemon.pid) 2>/dev/null; killall node 2>/dev/null; killall Electron 2>/dev/null"
        tell application "AILingo" to quit
    else if theAction is "quit" then
        tell application "AILingo" to quit
    end if
end handleAction
