# AILingo — AI 语言学习助手

> 基于 DeepSeek API 的智能语言学习应用，支持英语和日语，通过 AI 对话、实时纠错、间隔重复复习等机制，帮助用户高效掌握外语。

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [功能详解](#功能详解)
  - [场景化对话](#1-场景化对话)
  - [多智能体纠错系统](#2-多智能体纠错系统)
  - [知识点管理](#3-知识点管理)
  - [间隔重复复习 (SM-2)](#4-间隔重复复习-sm-2)
  - [智能测验](#5-智能测验)
  - [文本转语音 (TTS)](#6-文本转语音-tts)
  - [学习热力图](#7-学习热力图)
  - [词典查词](#8-词典查词)
  - [水平评估系统](#9-水平评估系统)
  - [对话目标分级](#10-对话目标分级)
  - [对话记录与继续](#11-对话记录与继续)
- [配置说明](#配置说明)
- [开发指南](#开发指南)

---

## 项目简介

AILingo 是一款面向语言学习者的 AI 对话练习工具。它利用 DeepSeek 大语言模型，模拟真实场景下的外语对话，并在对话过程中实时提供拼写纠正、语法分析、词汇提示和学习建议。所有学到的知识点通过 SM-2 间隔重复算法安排复习，配合智能测验巩固记忆。

支持 **英语** 和 **日语** 两种语言，数据完全隔离存储。

---

## 核心特性

| 特性 | 说明 |
|------|------|
| 🎭 **场景化角色扮演** | 餐厅、酒店、商务、日常闲聊、自定义场景，AI 扮演对应角色 |
| 🤖 **多智能体架构** | 6 个 AI Agent 协同工作：对话、纠错、语法分析、提示、知识提取、总结 |
| ✍️ **实时拼写纠正** | 词级 diff 算法高亮显示用户输入中的拼写错误 |
| 📚 **知识点管理** | 自动提取对话中的知识点，支持模糊搜索、类型筛选、批量操作、排序 |
| 🔄 **SM-2 间隔重复** | 基于 SM-2 算法的智能复习排期，优化记忆效率 |
| 📝 **智能测验** | 选择题、填空题、拼写题、纠错题、助词题，混合题型自动生成，支持英语/日语差异出题；答对题目折叠收起，专注错题复习 |
| 🔊 **文本转语音** | 通义千问 TTS API（`qwen3-tts-instruct-flash`），纪录⽚风格朗读，AI 消息自动播放，支持打断
| 📊 **学习热力图** | 月度活动热力图，直观展示学习轨迹 |
| 🔍 **词典查词** | 选中文本即时查词，支持快捷键 `Cmd+Shift+K` |
| 📊 **水平评估系统** | 新用户首次使用通过自适应对话（8-10轮）评测外语水平，AI 根据评分调整对话难度（i+1 原则），评分结果隐式使用、仅调试可见 |
| 📊 **水平评估系统** | 新用户首次使用通过自适应对话（8-10轮）评测外语水平，AI 根据评分调整对话难度（i+1 原则），评分结果隐式使用、仅调试可见 |
| 🌙 **深色模式** | 支持亮色/暗色主题切换，跟随系统偏好 |
| 🌐 **双语界面** | 应用 UI 支持英文和中文切换 |
| 📋 **对话记录** | 自动保存历史对话，支持中断恢复、继续对话，修正/Tips/总结完整保留 |

---

## 技术栈

| 技术 | 用途 |
|------|------|
| **React 19** | UI 框架 |
| **Vite 8** | 构建工具 |
| **Electron** | 桌面应用壳（macOS/Windows/Linux） |
| **DeepSeek API** | AI 对话、纠错、测验生成 |
| **通义千问 TTS API** | 文本转语音 |
| **SM-2 算法** | 间隔重复复习排期 |
| **localStorage / Electron IPC** | 数据持久化（知识点、学习日志、配置） |
| **CSS Custom Properties** | 主题系统（亮色/暗色） |

---

## 快速开始

### 前置要求

- Node.js >= 18
- DeepSeek API Key（[获取](https://platform.deepseek.com/)）
- （可选）通义千问 DashScope API Key（[获取](https://bailian.console.aliyun.com/)）

### 安装与运行

```bash
# 1. 进入项目目录
cd english-ai-learn

# 2. 安装依赖
npm install

# 3. 启动开发服务器（浏览器全功能模式，含 TTS）
npm run dev:browser

# 浏览器访问 http://localhost:5173
```

> `npm run dev:browser` 一键启动 Vite HMR + TTS 代理，Ctrl+C 同时清理两个进程。
> 纯前端模式（不含 TTS）：`npm run dev`

### 运行单元测试

```bash
# 运行一次
npm run test

# 持续监听模式
npm run test:watch
```

当前测试覆盖：
- SM-2 间隔重复算法（16 个用例）
- AI 响应 JSON 解析器 `parseJSONResponse`（20 个用例）

### Electron 桌面应用

```bash
# Electron 开发模式（需先运行 npm run dev）
npm run dev:electron

# 生产构建
npm run release

# 仅打包（跳过前端构建）
npm run release -- --skip-build

# 打包产物位于 release/AILingo.app
# 直接双击即可运行
```

# 数据互通与持久化说明

切换 Electron ⇄ 浏览器模式时，App 启动自动执行以下同步流程：

```
Electron 文件存储 ──→ localStorage  ──→ 浏览器模式读取
                    (syncAllFromFile)
```

所有用户数据（API Key、知识点、学习日志、偏好设置）始终通过 localStorage 互通，
无需在浏览器开发模式下重复输入 API Key。

> **性能优化**：Electron 写入采用内存缓存 + 300ms 防抖批量刷新，
> 高频知识点更新（如连续确认多个知识点）自动合并为单次文件写入。

### 配置 API Key

首次启动时，应用会自动弹出 API Key 配置向导，引导你输入 DeepSeek API Key（必填）和千问 TTS API Key（可选）。
之后可通过界面右上角 ⚙️ 按钮随时修改配置。

API Key 相关特性：
- **安全脱敏**：已保存的 Key 回显时自动脱敏（仅显示前后 4 位，中间隐藏）
- **智能保留**：修改时如未更改脱敏输入框内容，自动使用原 Key，避免重新输入
- **一键测试**：保存前自动测试 Key 有效性，无效时提示具体错误
- **本地存储**：保存在 `localStorage` 中（Electron 环境下加密存储在主进程管理的 JSON 文件中），不会上传到任何服务器

---

## 项目结构

```
english-ai-learn/
├── index.html                          # HTML 入口
├── package.json                        # 项目配置与依赖
├── vite.config.js                      # Vite 构建 + vitest 测试配置
├── eslint.config.js                    # ESLint 配置
├── start.sh                            # 启动脚本
│
├── scripts/                            # 构建脚本
│   ├── build.sh                        # 预览/发布双模式构建
│   ├── create-dmg.sh                   # DMG 打包
│   ├── create-app.sh                   # .app 创建
│   ├── fix-electron-binary.sh          # Electron 二进制修复
│   ├── manual-pack.sh                  # 手动打包（含 ad-hoc 签名）
│   └── launcher.sh                     # Electron 启动器包装
│
├── electron/                           # Electron 主进程
│   ├── main.cjs                        # 主进程（窗口管理、IPC、文件存储、TTS）
│   └── preload.cjs                     # 预加载脚本（桥接 API）
│
├── daemon.cjs                          # 守护进程（已由 Electron 主进程内置替代）
├── server/                             # 后端服务
│   ├── tts-proxy.cjs                   # 共享 TTS 代理模块（Electron + 独立 server 共用）
│   └── tts-server.cjs                  # TTS 代理服务器入口（浏览器 dev 模式，13 行）
│
├── release/                            # 打包输出（.gitignore）
│
└── src/                                # 前端源码
    ├── main.jsx                        # 应用入口，挂载 Provider
    ├── App.jsx                         # 容器组件（状态管理，~150 行）
    ├── AppView.jsx                     # 视图组件（纯展示，memo 优化子面板）
    ├── App.css                         # 主应用样式
    ├── index.css                       # 全局样式（主题变量）
    │
    ├── api.js                          # barrel 导出，聚合 api/ 子模块
    ├── api/                            # API 模块化子目录
    │   ├── client.js                   # HTTP 客户端、Key 测试、JSON 解析
    │   ├── prompts.js                  # System Prompt 参数化模板（英/日）
    │   ├── chat.js                     # 对话流程、目标生成、总结、任务追踪
    │   ├── knowledge.js                # 结构化知识点提取
    │   ├── correction.js               # 纠错代理 2A-2E
    │   └── client.test.js              # parseJSONResponse 单元测试
    │
    ├── config/
    │   ├── languages.js                # 语言配置（场景、UI 文本、类型样式）
    │   └── prompts.js                  # 词典查词 System Prompt（英/日）
    │
    ├── context/
    │   ├── LanguageContext.jsx          # 语言上下文（中/英 UI）
    │   └── ThemeContext.jsx             # 主题上下文（亮/暗）
    │
    ├── hooks/
    │   ├── useKnowledgePoints.js        # 知识点管理 Hook（CRUD + 持久化）
    │   ├── useScenarioState.js          # 场景配置 + 状态机（idle/chatting/quiz）
    │   └── useSidebarState.js           # 侧边栏 + 词典搜索 + 快捷键
    │
    ├── utils/
    │   ├── debug.js                   # 统一调试模块（生产环境自动 tree-shake log/warn）
    │   ├── sm2.js                      # SM-2 间隔重复算法
    │   ├── sm2.test.js                 # SM-2 算法单元测试
    │   ├── storage.js                  # 持久化存储（localStorage + Electron 缓存防抖双写）
    │   ├── speech.js                   # Web Speech API 本地语音合成
    │   ├── tts.js                      # TTS 客户端（缓存 + 打断控制）
    │   ├── learningLog.js              # 学习日志（活动记录 + 统计）
    │   └── date.js                     # 日期工具（本地时区）
    │
    ├── assets/
    │   ├── hero.png
    │   ├── react.svg
    │   └── vite.svg
    │
    └── components/
        ├── Layout.jsx                  # 三栏布局（侧边栏 + 主区域）
        ├── Layout.css
        │
        ├── ScenarioSetup.jsx           # 场景配置面板
        ├── ScenarioSetup.css
        │
        ├── ChatArea.jsx                # 对话主区域（多 Agent 流水线）
        ├── ChatArea.css
        │
        ├── ApiKeyModal.jsx             # API Key 配置弹窗
        ├── ApiKeyModal.css
        │
        ├── KnowledgeSidebar.jsx        # 知识点侧边栏（搜索/排序/管理）
        ├── KnowledgeSidebar.css
        │
        ├── LookUpPanel.jsx             # 查词面板（词典详情）
        ├── LookUpPanel.css
        │
        ├── ProgressDashboard.jsx       # 学习进度仪表盘
        │
        ├── HeatmapCalendar.jsx         # 学习热力图日历
        │
        └── QuizPanel.jsx               # 智能测验系统
```

---

## 架构优化（2025.05）

项目已完成以下优化，提升渲染性能、存储效率和代码可维护性：

| 优化项 | 说明 |
|--------|------|
| **组件拆分** | `App.jsx` 拆为容器（状态管理） + `AppView.jsx`（纯展示），`CenterPanel`/`RightSidebar`/`HeaderRight`/`KnowledgeSidebar` 均 `React.memo` 包裹 |
| **存储防抖** | `storage.js` 新增内存缓存 + 300ms 防抖批量写 Electron 文件，避免高频知识点操作导致大量 I/O |
| **渲染闪烁消除** | `useKnowledgePoints` Electron 加载时对比数据 ID，相同时跳过 `setState` |
| **重复代码清理** | 删除 `api.js.bak`（737 行废弃备份），`useSidebarState` 改为复用共享 `parseJSONResponse`，`QuizPanel` 硬编码 URL 统一为 `API_URL` |
| **调试日志优化** | 全项目 139+ 处 `console.log/warn` 替换为 `debug` 模块，生产构建自动 tree-shake（0 字节开销），`console.error` 保留 |
| **打包体积** | 主包从 273.56 kB 降至 271.49 kB |
| **搜索流程重构** | 查词时先查 `knowledgePoints` 缓存，已存在则直接显示、跳过 API 调用；`addPoint` 不再内部查重，避免 `setState` 回调异步执行的闭包过期问题 |
| **详情面板同步** | 右侧 LookUp 面板优先从 `knowledgePoints` 取最新数据，确认/删除操作后状态实时同步 |
| **朗读功能** | 单词详情集成有道词典真人发音，英语美式/US、日语专用接口，失败回退 Web Speech API |
| **移动端选中浮窗** | 窄屏下选中文字弹出 🔍 浮动搜索按钮，绕过 `Cmd+Shift+K` 快捷键限制 |
| **搜索流程重构** | 查词时先查 `knowledgePoints` 缓存，已存在则直接显示、跳过 API 调用；`addPoint` 不再内部查重

---

## 功能详解

### 1. 场景化对话

在 [`ScenarioSetup.jsx`](src/components/ScenarioSetup.jsx) 中配置对话参数：

- **场景选择**：预设场景（餐厅、酒店等）+ 用户自定义场景，支持新增/删除
- **场景 Prompt 编辑**：每个场景可单独编辑 System Prompt，分为三部分：
  - **通用背景设定**（角色/人格/风格/规则）— 可折叠编辑，所有场景共享
  - **场景参数**（场景名、纠错感度、目标知识点数等）— 由表单设置自动注入
  - **场景笔记**（角色扮演、会话流程、关键词）— 预设场景有默认笔记，支持 AI 生成
- **对话目标**：可随机生成（综合场景笔记生成）或手动输入
- **严格程度**：宽松 / 普通 / 严格 — 控制 AI 纠错的敏感度
- **最大轮次**：达到指定轮次后自动总结
- **目标知识点数**：达到指定数量后自动结束对话

AI 会根据场景扮演对应角色（如餐厅场景中扮演服务员），引导用户完成对话目标。

### 2. 多智能体纠错系统

[`api.js`](src/api.js) 中定义了 6 个 AI Agent，在 [`ChatArea.jsx`](src/components/ChatArea.jsx) 中编排执行：

```
用户输入
    │
    ├── Agent 1 ────────── 对话回复（主对话）
    │
    ├── Agent 2A ───────── 拼写 + 语法纠正（词级 diff）
    │
    ├── Agent 2B ───────── 语法分析（时态、语态、句式）
    │
    ├── Agent 2C ───────── 词汇提示（AI 回复中的重点词汇）
    │
    ├── Agent 2D ───────── 清理 AI 回复 + 提取纠错内容
    │
    └── Agent 2E ───────── 合并建议 + 提取知识点
```

**词级 diff 算法**（[`ChatArea.jsx`](src/components/ChatArea.jsx) 中的 `computeWordDiff` / `findDifferences`）：

- 将用户原文与纠正文本分词
- 使用 diff 算法计算词级差异
- 生成带注释的 HTML，在界面上高亮显示错误和修正

### 3. 知识点管理

[`useKnowledgePoints.js`](src/hooks/useKnowledgePoints.js) 提供完整的 CRUD 操作：

- **自动提取**：对话结束后，Agent 2E 自动从对话中提取知识点
- **类型分类**：词汇、短语、惯用句、连语、语法规则、敬语、助词、活用（日语）
- **语言隔离**：英语和日语的知识点分别存储在不同 localStorage key 下
- **搜索筛选**：模糊匹配搜索（word/meaning/context），支持按类型筛选
- **排序**：按字母、难度、最近学习、掌握程度排序
- **确认机制**：新知识点需用户确认后才纳入复习计划
- **批量操作**：支持批量确认/删除知识点，一键全选/取消全选

### 4. 间隔重复复习 (SM-2)

[`sm2.js`](src/utils/sm2.js) 实现了针对语言学习优化的 SM-2 算法：

- **质量评分**：0-3 分制（不同于传统 SM-2 的 0-5，更适合语言学习）
- **排期计算**：根据评分动态调整下次复习时间（1 天 / 3 天 / 7 天 / 14 天...）
- **难度因子**：Ease Factor 最低 1.3，防止过度降级
- **新卡片**：新知识点立即进入复习队列

### 5. 智能测验

[`QuizPanel.jsx`](src/components/QuizPanel.jsx) 提供完整的测验流程：

- **英语题型**：选择题、填空题、拼写题、纠错题
- **日语题型**：填空题、纠错题、汉字注音题、助词题（填空+选择）、语法选择题
- **选题策略**：优先选取到期复习的知识点；日语知识点不足时由 AI 自动补充助词/语法题
- **自动批改**：选择题和拼写题本地评分；填空题和纠错题由 AI 评审
- **复习模式**：测验结束后展示详细结果，包含正确答案和解析；答对题目收在折叠菜单中默认关闭，让用户专注查看错题
- **第二人称评阅**：AI 评审使用第二人称（你/あなた）撰写解析，拉近与用户的距离
- **SM-2 联动**：测验结果自动更新知识点复习排期

### 6. 文本转语音 (TTS)

- **模型升级**：使用 `qwen3-tts-instruct-flash` 模型，支持 `instructions` 指令和 `optimize_instructions` 参数，朗读风格沉稳冷静，如同纪录片旁白
- **音色选择**：默认使用 **Kai** 音色（沉稳男声），备选 Cherry、Serena、Ethan、Ryan
- **前端**：[`tts.js`](src/utils/tts.js) — 调用本地代理服务器，支持音频缓存（50 条）、`stopSpeaking()` / `isSpeaking()` 打断控制
- **后端**：[`tts-server.cjs`](server/tts-server.cjs) — Node.js HTTP 代理，转发请求到通义千问 DashScope API；Electron 环境可直接**内嵌在主进程中**运行，无需独立进程
- **自动播放**：AI 消息自动朗读，支持静音切换
- **播放冲突**：新消息朗读自动打断当前播放，避免重叠

### 7. 学习热力图

[`HeatmapCalendar.jsx`](src/components/HeatmapCalendar.jsx) 展示月度学习活动：

- **活动权重**：对话 = 1 分，知识点确认 = 2 分，测验 = 3 分
- **颜色编码**：从浅到深 5 个等级，直观展示学习强度
- **月份导航**：支持前后翻页查看历史记录

### 8. 词典查词

[`App.jsx`](src/App.jsx) 中的查词功能：

- **选中查词**：在对话或任意页面选中文本，使用 `Cmd+Shift+K` 快捷键
- **AI 解释**：调用 DeepSeek API 提供单词释义、音标、词性、例句
- **中文释义**：支持切换显示中文翻译
- **语法回退**：常见语法规则（如过去时、介词用法）有内置回退释义
- **先查缓存再调 API**：查词时先在 `knowledgePoints` 中查找，已存在的直接显示，避免重复网络请求
- **详情面板同步**：右侧面板优先从 `knowledgePoints` 取最新数据，确认/删除操作后状态实时更新
- **选中朗读**：卡片详情中点击 🔈 按钮朗读单词，英语使用有道词典真人发音，日语优先读假名注音
- **移动端选中浮窗**：窄屏模式下选中文字后，在选中位置上方弹出 🔍 浮动搜索按钮

---

### 9. 水平评估系统

首次使用外语时会展示评估邀请，通过一段 8-10 轮的自适应对话评测用户当前水平（1.00-10.00 分）：

- **四阶段渐进**：从自我介绍→日常偏好→观点比较→抽象推理，逐层试探用户能力上限
- **自适应难度**：AI 根据回答表现停留在合适阶段，不会强行推进
- **可跳过**：跳过时默认分配 3.0 分（"Template Phrases" 水平）
- **隐式评分**：分数仅通过 `debug.proficiency()` 输出到控制台，不在 UI 中显示
- **语言独立**：英语和日语的评分独立存储、独立评估

### 10. 对话目标分级

随机生成对话目标时，会根据用户当前评分动态调整目标数量和难度：

| 评分 | 目标数 | 示例特征 |
|------|--------|---------|
| < 4.0 | 1 个 | 简单的是/否问答，单个词汇回复 |
| 4.0-5.9 | 2 个 | 日常场景基础对话，短句表达 |
| ≥ 6.0 | 3 个 | 观点表达、理由说明、复杂话题 |

### 11. 对话记录与继续

[`conversationHistory.js`](src/utils/conversationHistory.js) 和 [`ProgressDashboard.jsx`](src/components/ProgressDashboard.jsx) 提供完整的对话历史管理：

- **自动保存**：对话正常结束（生成总结）或中断（点击返回）时自动保存快照到 localStorage，每语言最多保留 50 条
- **继续中断对话**：在进度面板中点击中断记录即可恢复。恢复时完整保留：
  - 对话消息（用户 + AI 全部轮次）
  - 拼写/语法修正（✏️ Corrections & Tips）
  - 语法分析结果
  - 已提取的知识点
  - TODO 清单完成状态（☑/☐）
- **对话记录列表**：按时间倒序排列，显示场景、目标、完成状态、轮次进度，支持按日期筛选和单条删除
- **数据模型**：每条记录包含 `id`、`messages`、`corrections`、`analysis`、`knowledgePoints`、`todos`、`roundCount` 等完整字段；继续的对话使用 `updateConversation` 更新原记录（同 ID），不会产生重复条目
- **卸载保护**：组件卸载时自动保存当前对话，避免意外关闭丢失数据

---

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 通义千问 API Key（TTS） | 无 |
| `TTS_PROXY_PORT` | TTS 代理服务器端口 | `3001` |

### 应用配置

所有配置通过 UI 界面完成：

| Key | 说明 |
|-----|------|
| `deepseek_api_key` | DeepSeek API Key |
| `qwen_tts_api_key` | 千问 TTS API Key |
| `theme` | 主题（light / dark / system） |
| `language` | UI 语言（en / zh-CN） |
| `isMuted` | TTS 静音状态 |
| `en_knowledge_points` | 英语知识点数据 |
| `ja_knowledge_points` | 日语知识点数据 |
| `en_learning_log` | 英语学习日志 |
| `ja_learning_log` | 日语学习日志 |

---

## 开发指南

### 本地开发

```bash
# 浏览器全功能模式（Vite + TTS，推荐）
npm run dev:browser

# 纯前端模式（仅 Vite）
npm run dev

# Electron 开发模式（需先运行 npm run dev，再开终端运行）
npm run dev:electron

# TTS 代理服务器（可独立运行）
npm run tts-server

# 单元测试
npm run test

# 代码检查
npm run lint

# 生产构建
npm run build
```

### 架构说明

- **状态管理**：使用 React `useState` / `useCallback`，抽取 2 个自定义 hook（`useScenarioState`、`useSidebarState`），App.jsx 从 758 行精简至 426 行
- **组件懒加载**：`ChatArea`、`QuizPanel`、`ApiKeyModal` 通过 `React.lazy` 按需加载，首屏 JS 减少 17%、CSS 减少 33%
- **数据流**：`App.jsx` 作为状态中心，通过 props 向下传递数据和回调
- **持久化**：`localStorage`（浏览器）+ Electron IPC 文件双写；`syncAllFromFile()` 确保两种模式数据互通
- **AI 通信**：直接通过 `fetch` 调用 DeepSeek API，不经过中间服务器
- **TTS 代理**：`server/tts-proxy.cjs` 共享模块，同时用于独立 server 和 Electron 内嵌

### 扩展指南

- **添加新语言**：在 [`languages.js`](src/config/languages.js) 中添加语言配置，实现对应的 System Prompt 构建函数
- **添加新场景**：在 `languages.js` 的 `SCENARIOS` 中添加场景定义
- **添加新题型**：在 [`QuizPanel.jsx`](src/components/QuizPanel.jsx) 中添加题型处理逻辑和对应的 AI Prompt

---

## 许可证

MIT
