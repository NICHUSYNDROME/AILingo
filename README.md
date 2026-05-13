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
| 📚 **知识点管理** | 自动提取对话中的知识点，支持搜索、排序、确认/删除 |
| 🔄 **SM-2 间隔重复** | 基于 SM-2 算法的智能复习排期，优化记忆效率 |
| 📝 **智能测验** | 选择题、填空题、拼写题、纠错题，混合题型自动生成 |
| 🔊 **文本转语音** | 通义千问 TTS API，AI 消息自动朗读，支持缓存 |
| 📊 **学习热力图** | 月度活动热力图，直观展示学习轨迹 |
| 🔍 **词典查词** | 选中文本即时查词，支持快捷键 `Cmd+Shift+K` |
| 🌙 **深色模式** | 支持亮色/暗色主题切换，跟随系统偏好 |
| 🌐 **双语界面** | 应用 UI 支持英文和中文切换 |

---

## 技术栈

| 技术 | 用途 |
|------|------|
| **React 19** | UI 框架 |
| **Vite 8** | 构建工具 |
| **DeepSeek API** | AI 对话、纠错、测验生成 |
| **通义千问 TTS API** | 文本转语音 |
| **SM-2 算法** | 间隔重复复习排期 |
| **localStorage** | 数据持久化（知识点、学习日志、配置） |
| **CSS Custom Properties** | 主题系统（亮色/暗色） |

---

## 快速开始

### 前置要求

- Node.js >= 18
- DeepSeek API Key（[获取](https://platform.deepseek.com/)）
- （可选）通义千问 DashScope API Key（[获取](https://dashscope.aliyun.com/)）

### 安装与运行

```bash
# 1. 进入项目目录
cd english-ai-learn

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. （可选）启动 TTS 代理服务器
npm run tts-server
```

### 配置 API Key

首次使用时，在应用界面中点击右上角设置按钮，输入 DeepSeek API Key。API Key 会保存在浏览器本地存储中。

---

## 项目结构

```
english-ai-learn/
├── index.html                          # HTML 入口
├── package.json                        # 项目配置与依赖
├── vite.config.js                      # Vite 构建配置
├── eslint.config.js                    # ESLint 配置
├── LAUNCH_GUIDE.md                     # 启动指南
├── start.sh                            # 启动脚本
├── launch.scpt                         # macOS AppleScript 启动
├── server.log                          # TTS 服务器日志
│
├── public/                             # 静态资源
│   ├── favicon.svg
│   └── icons.svg
│
├── server/                             # 后端服务
│   └── tts-server.cjs                  # TTS 代理服务器（Node.js）
│
├── English AI Learn.app/               # macOS 打包应用
│
└── src/                                # 前端源码
    ├── main.jsx                        # 应用入口，挂载 Provider
    ├── App.jsx                         # 主应用组件（状态管理、路由）
    ├── App.css                         # 主应用样式
    ├── index.css                       # 全局样式（主题变量）
    │
    ├── api.js                          # DeepSeek API 封装（6 个 Agent）
    │
    ├── config/
    │   └── languages.js                # 语言配置（场景、UI 文本、类型样式）
    │
    ├── context/
    │   ├── LanguageContext.jsx          # 语言上下文（中/英 UI）
    │   └── ThemeContext.jsx             # 主题上下文（亮/暗）
    │
    ├── hooks/
    │   └── useKnowledgePoints.js        # 知识点管理 Hook（CRUD + 持久化）
    │
    ├── utils/
    │   ├── sm2.js                      # SM-2 间隔重复算法
    │   ├── tts.js                      # TTS 客户端（缓存 + 心跳）
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

## 功能详解

### 1. 场景化对话

在 [`ScenarioSetup.jsx`](src/components/ScenarioSetup.jsx) 中配置对话参数：

- **场景选择**：餐厅、酒店、商务会面、日常闲聊、自定义场景
- **对话目标**：可随机生成或手动输入本次对话的学习目标
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
- **类型分类**：词汇、短语、语法规则、拼写纠正、语法纠正
- **语言隔离**：英语和日语的知识点分别存储在不同 localStorage key 下
- **搜索排序**：按字母、难度、最近学习、掌握程度排序
- **确认机制**：新知识点需用户确认后才纳入复习计划

### 4. 间隔重复复习 (SM-2)

[`sm2.js`](src/utils/sm2.js) 实现了针对语言学习优化的 SM-2 算法：

- **质量评分**：0-3 分制（不同于传统 SM-2 的 0-5，更适合语言学习）
- **排期计算**：根据评分动态调整下次复习时间（1 天 / 3 天 / 7 天 / 14 天...）
- **难度因子**：Ease Factor 最低 1.3，防止过度降级
- **新卡片**：新知识点立即进入复习队列

### 5. 智能测验

[`QuizPanel.jsx`](src/components/QuizPanel.jsx) 提供完整的测验流程：

- **题型**：选择题、填空题、拼写题、纠错题
- **选题策略**：优先选取到期复习的知识点
- **自动批改**：选择题和拼写题本地评分；填空题和纠错题由 AI 评审
- **复习模式**：测验结束后展示详细结果，包含正确答案和解析
- **SM-2 联动**：测验结果自动更新知识点复习排期

### 6. 文本转语音 (TTS)

- **前端**：[`tts.js`](src/utils/tts.js) — 调用本地代理服务器，支持音频缓存（50 条）、心跳保活
- **后端**：[`tts-server.cjs`](server/tts-server.cjs) — Node.js HTTP 代理，转发请求到通义千问 DashScope API
- **自动播放**：AI 消息自动朗读，支持静音切换
- **语音选择**：默认使用 Ethan 音色
- **心跳机制**：前端每 10 秒发送心跳，服务器 30 秒无心跳自动关闭

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

---

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 通义千问 API Key（TTS） | 无 |
| `TTS_PROXY_PORT` | TTS 代理服务器端口 | `3001` |

### 应用配置

所有配置通过 UI 界面完成，存储在 `localStorage` 中：

| Key | 说明 |
|-----|------|
| `deepseek_api_key` | DeepSeek API Key |
| `dashscope_api_key` | 通义千问 API Key |
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
# 启动 Vite 开发服务器（热更新）
npm run dev

# 启动 TTS 代理服务器（另一个终端）
npm run tts-server

# 代码检查
npm run lint

# 生产构建
npm run build
```

### 架构说明

- **状态管理**：使用 React `useState` / `useCallback`，无外部状态库
- **数据流**：`App.jsx` 作为状态中心，通过 props 向下传递数据和回调
- **持久化**：所有用户数据存储在 `localStorage`，无后端数据库
- **AI 通信**：直接通过 `fetch` 调用 DeepSeek API，不经过中间服务器
- **TTS 代理**：仅 TTS 需要本地代理服务器（避免 CORS 和 API Key 暴露）

### 扩展指南

- **添加新语言**：在 [`languages.js`](src/config/languages.js) 中添加语言配置，实现对应的 System Prompt 构建函数
- **添加新场景**：在 `languages.js` 的 `SCENARIOS` 中添加场景定义
- **添加新题型**：在 [`QuizPanel.jsx`](src/components/QuizPanel.jsx) 中添加题型处理逻辑和对应的 AI Prompt

---

## 许可证

MIT
