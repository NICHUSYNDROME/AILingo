# 🚀 English AI Learn — 启动指南

## 项目结构

```
english-ai-learn/
├── start.sh              # 增强版启动脚本（推荐）
├── launch.scpt           # AppleScript 脚本（双击在终端中运行）
├── English AI Learn.app  # macOS 应用包（双击后台静默启动）
├── server/
│   └── tts-server.cjs    # TTS 语音合成后端代理 (port 3001)
├── src/                  # React 前端源码
└── package.json
```

## 启动方式

### 方式一：终端命令（开发推荐）

```bash
cd /Users/nichu/English_AI_Learn/english-ai-learn

# 分别启动（可观察各自输出）
node server/tts-server.cjs   # TTS 后端 → http://localhost:3001
npm run dev                  # Vite 前端 → http://localhost:5173
```

### 方式二：启动脚本（一键启动）

```bash
cd /Users/nichu/English_AI_Learn/english-ai-learn
bash start.sh
```

脚本会自动：
1. 清理残留的旧进程（port 3001 / 5173）
2. 启动 TTS 后端代理
3. 启动 Vite 前端开发服务器
4. 检测启动状态，成功后自动打开浏览器
5. 持续守护进程，异常退出时自动清理

日志文件：`server.log`

### 方式三：AppleScript 脚本（双击运行）

双击 [`launch.scpt`](launch.scpt)，会在终端窗口中启动服务，用户可以看到实时输出并随时按 `Ctrl+C` 停止。

也可通过命令行运行：

```bash
osascript launch.scpt
```

### 方式四：macOS 应用（双击后台运行）

双击 [`English AI Learn.app`](English%20AI%20Learn.app)，服务将在后台静默启动，无终端窗口弹出。

启动日志：`/tmp/english-ai-learn-launch.log`

## 访问地址

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:5173 |
| TTS 语音合成 API | http://localhost:3001 |

## 停止服务

- **终端启动**：按 `Ctrl+C`
- **AppleScript 启动**：在终端窗口中按 `Ctrl+C`
- **macOS 应用启动**：在活动监视器中找到并结束 `node` 进程，或重启电脑

## 常见问题

**Q: 端口被占用怎么办？**
脚本会自动清理旧进程。如果手动启动，可运行：
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

**Q: 启动后浏览器无法访问？**
检查终端输出是否有报错，或查看日志文件：
```bash
cat server.log          # start.sh 日志
cat /tmp/english-ai-learn-launch.log  # .app 启动日志
```

**Q: TTS 语音合成不工作？**
确保前端已配置有效的阿里云 DashScope API Key。
