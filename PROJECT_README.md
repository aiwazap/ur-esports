# UR Esports CS2 赛训数据中心 — 项目完整说明书

> **版本**: v2.1  
> **最后更新**: 2026-06-08  
> **维护人**: 华哥 (UR 电竞领队)  
> **AI 助理**: 巴蒂 (基于 WorkBuddy)  
> **开源地址**: https://github.com/aiwazap/ur-esports  

---

## 目录

1. [项目概述](#1-项目概述)
2. [环境速查卡](#2-环境速查卡)
3. [完整目录结构](#3-完整目录结构)
4. [技术栈](#4-技术栈)
5. [数据库设计](#5-数据库设计)
6. [前端页面详解](#6-前端页面详解)
7. [后端 API 详解](#7-后端-api-详解)
8. [数据来源与生成逻辑](#8-数据来源与生成逻辑)
9. [部署与运维](#9-部署与运维)
10. [常见问题与故障排除](#10-常见问题与故障排除)

---

## 1. 项目概述

### 1.1 项目背景

UR Esports 是一支 CS2 职业电竞战队，VRS 亚洲排名 #43（2026.06）。赛训周期为**周一至周六，周日休息**，每日 17:30 系统自动同步训练日志与战术简报。

本项目是战队的**赛训数据管理与分析平台**，覆盖：
- 选手信息管理
- 比赛记录录入与分析
- 训练数据采集（回合级）
- 战术总表维护
- 对手情报收集
- 外设/库存管理
- 多维度数据可视化

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **三表联动校验** | matches / training_sessions / training_rounds 三者数据同时存在时才计入统计 |
| **三级下钻交互** | 问题类型 → 选手分布 → 具体回合明细 |
| **完整性过滤** | 所有查询自动排除空日期、占位符对手名、垃圾数据 |
| **数据库 = 单一事实源** | SQLite 单文件存储，一键备份恢复 |
| **前后端分离 + JWT 鉴权** | React SPA + Express API，Nginx 反向代理 |

### 1.3 数据流全景

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  腾讯文档 API  │     │  Excel 文件    │     │  HLTV 网页    │
│  (在线协同)    │     │  (教练导出)    │     │  (公开数据)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
sync_tencent_api.py    etl_sync_all.py      sync_hltv.py
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │  ur_esports.db   │  ← SQLite 单文件数据库 (14 张表)
                  │  (事实源)         │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Express API     │  ← Node.js (端口 3000)
                  │  11 个路由模块    │     JWT 鉴权 + better-sqlite3
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Nginx (443)     │  ← HTTPS 反向代理
                  │  Let's Encrypt   │     /api → :3000
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  React 前端      │  ← Vite 构建产物
                  │  7 个页面        │     Tailwind + Recharts
                  │  ur-esports.cn   │
                  └─────────────────┘
```

---

## 2. 环境速查卡

### 2.1 账号信息

| 项目 | 值 |
|------|-----|
| 线上地址 | `https://ur-esports.cn` |
| 管理员用户名 | `admin` |
| 管理员密码 | `admin123` |
| JWT Secret (本地) | `URsecret_jwt_key_2026_change_this` |
| JWT Secret (线上) | 见服务器 `/home/ubuntu/ur-esports/backend/.env` |
| 初始化管理员 | `cd backend && node setup-admin.js` |

### 2.2 路径速查

| 环境 | 路径 | 说明 |
|------|------|------|
| **本地 Windows 项目** | `E:\ur-esports\ur-esports-deploy\` | 开发主目录 |
| **本地 Windows 备份** | `E:\ur-esports_project_backup\ur-esports-deploy\` | 完整项目备份 |
| **本地后端** | `E:\ur-esports\ur-esports-deploy\backend\` | Node.js 后端 |
| **本地前端** | `E:\ur-esports\ur-esports-deploy\frontend\` | React 前端 |
| **本地数据库** | `E:\ur-esports\ur-esports-deploy\backend\data\ur_esports.db` | SQLite 数据库 |
| **本地 WorkBuddy 记忆** | `E:\ur-esports\ur-esports-deploy\.workbuddy\memory\` | AI 工作日志 |
| **线上服务器** | `/home/ubuntu/ur-esports/` | Ubuntu 部署目录 |
| **线上后端** | `/home/ubuntu/ur-esports/backend/` | Express 服务 |
| **线上前端构建** | `/home/ubuntu/ur-esports/frontend/dist/` | Nginx 托管 |
| **线上数据库** | `/home/ubuntu/ur-esports/backend/data/ur_esports.db` | SQLite 生产库 |
| **线上 PM2 日志** | `/home/ubuntu/.pm2/logs/ur-esports-error.log` | 错误日志 |
| **Nginx 配置** | `/etc/nginx/sites-available/ur-esports` | HTTPS 反向代理 |

### 2.3 连接信息

| 项目 | 值 |
|------|-----|
| 服务器 IP | `124.220.64.8` |
| SSH 用户 | `ubuntu` |
| SSH 命令 | `ssh ubuntu@ur-esports.cn` (通过 OrcaTerm) |
| 本地开发端口 | `http://localhost:5173` (Vite dev server) |
| 后端端口 | `http://localhost:3000` |
| PM2 进程名 | `ur-esports` |
| GitHub 仓库 | `https://github.com/aiwazap/ur-esports.git` |
| ICP 备案 | 沪ICP备2026023847号 |

### 2.4 本地开发启动

```bash
# Windows CMD 终端
# 1. 启动后端
cd E:\ur-esports\ur-esports-deploy\backend
node server.js

# 2. 启动前端 (另一个终端)
cd E:\ur-esports\ur-esports-deploy\frontend
npm run dev
# 浏览器访问 http://localhost:5173
```

---

## 3. 完整目录结构

```
E:\ur-esports\ur-esports-deploy\
│
├── PROJECT_README.md            # 【本文档】完整项目说明书
├── README.txt                   # 简要部署说明
├── README_DEPLOY.md             # 详细部署指南
├── .gitignore                   # Git 排除: node_modules, .db, .env, uploads, dist
│
├── backend/                     # ══════ Node.js 后端 ══════
│   ├── server.js                # Express 主入口 (端口3000，注册12个路由模块)
│   ├── setup-admin.js           # 初始管理员账号创建脚本 (admin/admin123)
│   ├── package.json             # 后端依赖: express, better-sqlite3, bcryptjs, jwt, multer, xlsx
│   ├── .env                     # 环境变量 (JWT_SECRET/PORT/DATA_DIR/PYTHON_PATH)
│   │
│   ├── config/
│   │   ├── db.js                # SQLite 数据库封装 (MySQL→SQLite 语法自动翻译)
│   │   └── schema.sql           # 完整建表脚本 (14张表 + 索引 + 默认数据)
│   │
│   ├── middleware/
│   │   └── auth.js              # JWT 认证中间件 (auth: 普通鉴权, adminAuth: 管理员鉴权)
│   │
│   ├── routes/                  # API 路由 (11个模块)
│   │   ├── auth.js              # 用户注册/登录
│   │   ├── players.js           # 选手 CRUD + Excel 导入导出 + 头像上传
│   │   ├── matches.js           # 比赛记录分组查询/导入/统计
│   │   ├── stats.js             # 地图/对手/选手/半场统计
│   │   ├── training.js          # 赛训核心 API (仪表盘/报告/回合详细)
│   │   ├── training-plans.js    # 训练计划 CRUD
│   │   ├── tactics.js           # (通过 training.js 的 /tactics 端点)
│   │   ├── dashboard.js         # 数据总览聚合 (KPI/赛事/地图/选手/外设/库存/周环比)
│   │   ├── admin.js             # 用户审核/管理
│   │   ├── config.js            # 系统配置管理
│   │   ├── peripherals.js       # 选手外设管理
│   │   ├── inventory.js         # 库存管理
│   │   └── opponent-intel.js    # 对手情报 CRUD
│   │
│   ├── scripts/                 # 数据脚本
│   │   ├── migrate_v2_1.js      # JS: v2.1 数据库迁移 (新增6表1列)
│   │   ├── etl_sync_all.py      # Python: 全量 ETL (4张Excel→SQLite)
│   │   ├── sync_hltv.py         # Python: HLTV 爬虫
│   │   ├── sync_tencent_api.py  # Python: 腾讯文档实时同步
│   │   ├── parse_briefing.py    # Python: 解析每日简报 docx
│   │   ├── parse_tactics.py     # Python: 解析战术总表 xlsx
│   │   └── parse_training.py    # Python: 解析训练日志 xlsx
│   │
│   ├── uploads/                 # 上传文件 (头像等)
│   │   └── avatars/             # 选手头像
│   │
│   └── data/                    # SQLite 数据库
│       └── ur_esports.db        # 生产数据库
│
├── frontend/                    # ══════ React 前端 ══════
│   ├── index.html               # HTML 入口
│   ├── package.json             # 前端依赖: react18, recharts, tailwind, vite, lucide-react
│   ├── vite.config.js           # Vite 配置 (端口5173, /api代理→:3000, cacheDir: ./.vite)
│   ├── tailwind.config.js       # Tailwind 自定义主题 (电竞深色 + 10色板)
│   ├── postcss.config.js        # PostCSS 配置
│   │
│   ├── public/                  # 静态资源
│   │   ├── logo.png             # UR 战队 LOGO
│   │   ├── dashboard-template.html    # 赛训总览设计稿 (完整HTML)
│   │   ├── design-members.html        # 分部成员设计稿
│   │   ├── design-training-report.html # 赛训报告设计稿
│   │   └── images/
│   │       └── maps/                  # CS2 地图 LOGO (7张PNG)
│   │           ├── ancient.png
│   │           ├── anubis.png
│   │           ├── inferno.png
│   │           ├── mirage.png
│   │           ├── nuke.png
│   │           ├── overpass.png
│   │           └── train.png
│   │
│   ├── src/
│   │   ├── main.jsx            # React 入口文件
│   │   ├── App.jsx             # 路由配置 (React Router 6, 私有路由保护)
│   │   ├── api.js              # Axios 封装 (baseURL: /api, JWT 拦截器, 401 自动跳转)
│   │   ├── index.css           # 全局样式 + Tailwind + 设计令牌
│   │   │
│   │   ├── components/
│   │   │   ├── Layout.jsx      # 页面布局 (侧边导航6菜单 + 粒子背景 + 登出)
│   │   │   ├── ParticleBackground.jsx   # Canvas 粒子动画背景
│   │   │   └── PlayerEditModal.jsx      # 选手编辑弹窗
│   │   │
│   │   └── pages/
│   │       ├── Login.jsx       # 登录页 (用户名+密码+SteamID+角色)
│   │       ├── Register.jsx    # 注册页 (已禁用)
│   │       ├── Overview.jsx    # 【赛训总览】仪表盘 (514行, iframe 渲染)
│   │       ├── Members.jsx     # 【分部成员】选手卡片墙
│   │       ├── Matches.jsx     # 【近期比赛】记录列表
│   │       ├── TrainingReport.jsx  # 【赛训报告】核心页面 (~744行, 三级下钻)
│   │       ├── Tactics.jsx     # 【战术总表】战术浏览
│   │       ├── Admin.jsx       # 【数据管理】用户审核
│   │       └── overview-dashboard.css  # 赛训总览专用样式
│   │
│   └── dist/                   # Vite 构建产物 (生产环境)
│       ├── index.html
│       └── assets/
│
├── docs/
│   └── 赛训报告模块说明.md       # 赛训报告模块技术文档 (290行)
│
├── deploy.sh                    # 自动化部署脚本 (git pull → npm install → build → pm2 restart)
├── server-setup.sh              # 服务器首次配置脚本
├── nginx-ur-esports.conf        # Nginx 反向代理配置
├── push-login-fix.mjs           # GitHub API 登录修复脚本
└── setup.bat                    # Windows 一键部署
```

---

## 4. 技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| **运行时** | Node.js | 22.x (managed) |
| **后端框架** | Express | 4.18 |
| **数据库** | SQLite + better-sqlite3 | 11.x (同步 API) |
| **认证** | JWT + bcryptjs | jsonwebtoken 9.x |
| **文件上传** | multer | 1.4 |
| **Excel 处理** | xlsx (SheetJS) | 0.18 |
| **限流** | express-rate-limit | — |
| **前端框架** | React 18 | SPA |
| **构建工具** | Vite 6 | — |
| **CSS** | Tailwind CSS 3.4 | 自定义电竞深色主题 |
| **图表** | Recharts 2.15 | — |
| **路由** | React Router 6 | — |
| **图标** | Lucide React | — |
| **部署** | PM2 + Nginx | Ubuntu 22.04 |
| **SSL** | Let's Encrypt | — |
| **Python** | 3.x (managed) | 数据同步脚本 |
| **Python 库** | openpyxl, python-docx, requests | ETL/爬虫 |

### Tailwind 自定义色板

```
ur-bg:     #05070b    (最深背景)
ur-card:   #0b111c    (卡片/面板)
ur-border: rgba(159,203,255,0.14)  (边框)
ur-indigo: #5379ff    (靛蓝-强调)
ur-cyan:   #68e8ff    (青色-主色调)
ur-purple: #8b5cff    (紫色)
ur-emerald:#35e59d    (绿色-胜利)
ur-rose:   #ff597d    (玫瑰-警告)
ur-amber:  #ffc45c    (琥珀-警告)
ur-text:   #eef6ff    (正文)
ur-muted:  #8494a8    (次要文本)
```

---

## 5. 数据库设计

### 5.1 数据库基本信息

| 项目 | 值 |
|------|-----|
| 数据库引擎 | SQLite 3 |
| 文件位置 | `backend/data/ur_esports.db` |
| 建表脚本 | `backend/config/schema.sql` |
| 迁移脚本 | `backend/scripts/migrate_v2_1.js` |
| 表总数 | 14 张 |
| 字符集 | UTF-8 |

### 5.2 表结构详解

#### 5.2.1 用户表 `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `username` | TEXT UNIQUE | 用户名 |
| `password_hash` | TEXT | bcrypt 哈希密码 |
| `steam_id` | TEXT UNIQUE | Steam64 ID (17位数字) |
| `role` | TEXT | admin/player/coach/pending/team_lead/analyst/manager/ceo |
| `division` | TEXT | cs2/val/all |
| `created_at` | TEXT | 创建时间 |
| `approved_at` | TEXT | 审核通过时间 |
| `approved_by` | INTEGER | 审核人 ID |

**默认数据**: admin 用户 (密码: admin123，实际是 bcrypt hash)

#### 5.2.2 选手表 `players`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `nickname` | TEXT | 游戏昵称 |
| `real_name` | TEXT | 真实姓名 |
| `steam_id` | TEXT | Steam ID |
| `role` | TEXT | 职位 |
| `in_game_role` | TEXT | 游戏内位置 (如 AWPer/Rifler/IGL) |
| `join_date` | TEXT | 入队日期 |
| `leave_date` | TEXT | 离队日期 |
| `status` | TEXT | active/inactive/left |
| `team_type` | TEXT | roster(现役)/staff(职员)/former(离队) |
| `hltv_url` | TEXT | HLTV 个人页面链接 |
| `bio` | TEXT | 个人简介 |
| `avatar_url` | TEXT | 头像 URL |
| `division` | TEXT | cs2/val |
| `birth_date` | TEXT | 生日 (前端据此计算年龄) |

**数据来源**: Excel 导入 + 网页手动编辑

#### 5.2.3 比赛记录表 `matches` 【核心表】

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `match_date` | TEXT | 比赛日期 (YYYY-MM-DD) |
| `match_time` | TEXT | 比赛时间 |
| `opponent` | TEXT | 对手名称 |
| `event_name` | TEXT | 赛事名称 |
| `match_type` | TEXT | official(正式赛)/scrim(训练赛) |
| `map_name` | TEXT | 地图名称 |
| `our_score` | INTEGER | 我方比分 |
| `their_score` | INTEGER | 对方比分 |
| `t_score` | INTEGER | T 方得分 |
| `ct_score` | INTEGER | CT 方得分 |
| `pistol_rounds` | TEXT | 手枪局结果 |
| `result` | TEXT | **计算列**: win/loss/draw (基于比分自动计算) |
| `bo_format` | TEXT | BO1/BO3/BO5 |
| `notes` | TEXT | 备注 |

**关键规则**: `result` 是 GENERATED ALWAYS AS 计算列，在 SQLite 中自动计算。**每行 = 一张地图**（一场 BO3 有 3 行）。

**数据来源**: ETL 同步脚本 (`etl_sync_all.py`) + Excel 导入

#### 5.2.4 选手单场数据 `player_stats`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `match_id` | INTEGER FK | → matches.id |
| `player_id` | INTEGER FK | → players.id |
| `kills` | INTEGER | 击杀数 |
| `deaths` | INTEGER | 死亡数 |
| `adr` | REAL | 平均每回合伤害 |
| `rating` | REAL | HLTV 2.0 Rating |
| `kast` | REAL | 回合贡献率 |
| `hs` | INTEGER | 爆头数 (v2.1 新增) |

**数据来源**: HLTV 爬虫 (`sync_hltv.py`) 自动抓取

#### 5.2.5 即将赛事表 `upcoming_matches`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `match_date` | TEXT | 比赛日期 |
| `match_time` | TEXT | 比赛时间 |
| `opponent` | TEXT | 对手 |
| `event_name` | TEXT | 赛事名称 |
| `match_type` | TEXT | official(正赛)/scrim(训练赛) |
| `bo_format` | TEXT | BO1/BO3/BO5 |
| `location_type` | TEXT | online/offline/hybrid |
| `source_link` | TEXT | 来源链接 |
| `stage` | TEXT | 赛事阶段 |
| `region` | TEXT | 赛区 |

**关键规则**: 数据总览页面只显示 `match_type = 'official'` 的赛事，无正赛时显示"暂无正赛规划"。

#### 5.2.6 训练赛次表 `training_sessions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `match_date` | TEXT | 日期 |
| `opponent` | TEXT | 对手 |
| `event_name` | TEXT | 赛事名 |
| `notes` | TEXT | 备注 |

**唯一约束**: `UNIQUE(match_date, opponent)` — 同一日期同一对手只有一条记录

**数据来源**: 腾讯文档同步 (`sync_tencent_api.py`) 自动生成

#### 5.2.7 训练回合表 `training_rounds` 【核心表】

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自增主键 |
| `session_id` | INTEGER FK | → training_sessions.id |
| `round_number` | INTEGER | 回合编号 |
| `map_name` | TEXT | 地图 |
| `team_side` | TEXT | T / CT |
| `round_type` | TEXT | 回合类型 (手枪局/ECO/长枪局等) |
| `command_text` | TEXT | 战术指令 |
| `execution_text` | TEXT | 执行记录 |
| `first_death_reason` | TEXT | 首死原因 |
| `issue_grenade` | INTEGER | 道具问题 (0/1) |
| `issue_position` | INTEGER | 走位问题 (0/1) |
| `issue_aim` | INTEGER | 枪法问题 (0/1) |
| `issue_comms` | INTEGER | 沟通问题 (0/1) |
| `issue_tactics` | INTEGER | 战术问题 (0/1) |
| `round_result` | TEXT | win/loss |
| `players_involved` | TEXT | 参与选手 (逗号分隔) |

**数据来源**: 腾讯文档同步 → training_rounds，教练逐回合记录

#### 5.2.8 战术总表 `tactics`

| 字段 | 说明 |
|------|------|
| `tactic_id` | 战术编号 (UNIQUE)，如 MIR-T-DEF-001 |
| `map_name` | 地图 |
| `team_side` | T/CT |
| `round_type` | 回合类型 |
| `category` | 战术分类 |
| `name` | 战术名称 |
| `description` | 战术描述 |
| `details` | 详细说明 |
| `version` | 版本号 |

**数据来源**: 全量覆盖导入 (每次导入删除旧数据重新写入)

#### 5.2.9 简报条目表 `briefing_items`

与 `training_sessions` 关联的多条指令，含 `priority`(核心/重点/一般)、`sort_order` 排序。

**数据来源**: 腾讯文档同步 + Excel 导入

#### 5.2.10 特殊事件表 `special_events`

| 字段 | 说明 |
|------|------|
| `date` | 日期 (PRIMARY KEY) |
| `status` | 状态 |
| `note` | 说明 (如"放假"、"对手弃权") |

**自动检测**: 每日简报地图字段若不属于 CS2 标准地图名，则自动标记为特殊事件。

#### 5.2.11 ~ 5.2.14 v2.1 新增表

| 表 | 用途 | 关键字段 |
|------|------|---------|
| `peripherals` | 选手外设 | player_id(UNIQUE), keyboard, mouse, headset, mousepad, monitor |
| `inventory` | 库存管理 | item_type, current_count, max_count |
| `training_plans` | 训练计划 | plan_date(索引), start_time, end_time, title, subtitle, tags |
| `opponent_intel` | 对手情报 | opponent_name(UNIQUE), vrs_rank, map_preference, core_players, h2h_wins/losses |
| `system_config` | 系统配置 | config_key(PRIMARY), config_value (默认: founded_date=2025-03-27, vrs_rank=43) |
| `operation_logs` | 操作日志 | user_id, action, details |

### 5.3 表关联关系图

```
players ────1:N──→ player_stats ←──N:1── matches
   │                                        │
   │                              (日期+对手匹配)
   │                                        │
   │              training_sessions ←───────┘
   │                    │
   │              ┌─────┼─────┐
   │              │           │
   │         training_rounds  briefing_items
   │              │                │
   └── (players_involved)    (tactic_id)
                                   │
                               tactics
```

### 5.4 数据完整性过滤规则 (CRITICAL)

所有从 `matches` 表查询必须附加：

```sql
AND opponent NOT IN ('match_data', 'OPPONENT', '___')
AND match_date IS NOT NULL AND match_date != '' AND length(match_date) >= 8
AND map_name IS NOT NULL AND map_name != ''
```

`training_sessions` 同理：

```sql
AND opponent NOT IN ('OPPONENT', '未知', '___')
```

---

## 6. 前端页面详解

### 6.1 路由结构

```
/                   → 重定向到 /overview (未登录 → /login)
├── /login           → Login.jsx        (公开页面)
├── /register        → Register.jsx     (已禁用)
├── /overview        → Overview.jsx     【赛训总览】仪表盘
├── /members         → Members.jsx      【分部成员】选手卡片
├── /matches         → Matches.jsx      【近期比赛】记录
├── /training-report → TrainingReport.jsx 【赛训报告】核心
├── /tactics         → Tactics.jsx      【战术总表】
└── /admin           → Admin.jsx        【数据管理】
```

所有页面（除 login/register）通过 `PrivateRoute` 组件检查 localStorage 中的 JWT token。

### 6.2 Layout.jsx — 全局布局

- **侧边导航** (左侧 224px): 6 个菜单项 + 用户信息 + 登出按钮
- **粒子背景**: `ParticleBackground.jsx` 提供 Canvas 动态粒子动画
- **菜单项**: 赛训总览 / 分部成员 / 近期比赛 / 赛训报告 / 战术总表 / 数据管理
- **权限**: 所有登录用户可见，但 `/admin` 路由内的 API 操作需要 admin 角色

### 6.3 Login.jsx — 登录页

**表单字段**: 用户名、密码、Steam64 ID (17位数字)、职位 (7种角色可选)

**验证逻辑**:
- 所有字段必填
- Steam64 ID 必须是 17 位数字
- 后端验证用户名+密码+SteamID+角色匹配

**登录成功后**: 存储 `token` 和 `user` 到 localStorage，跳转到 `/overview`

### 6.4 Overview.jsx — 赛训总览 (514行)

**核心页面**，当前开发重点。

**渲染方式**: iframe 隔离 — Overview.jsx 获取 `/dashboard-template.html` 并通过 `window.DASHBOARD_DATA` 注入 API 数据，完全隔离 CSS，避免 Tailwind 干扰。

**数据来源**: `GET /api/dashboard/overview`

**页面区域**:

| 区域 | 内容 | 数据字段 |
|------|------|---------|
| KPI 行 (4卡片) | VRS排名 / 近10场胜率 / 训练质量 / 成立天数 | kpi.vrsRank, kpi.recentWinRate, kpi.trainingQuality, kpi.foundedDate |
| 上排三列 | 即将赛事 / 数据枢纽 / 训练对象 | upcomingMatch, opponentIntel, h2hFromDb |
| 训练计划 | 今日计划表 | trainingPlan |
| 近五场表格 | 赛事记录 + 选手数据 (双列) | recentMatches, playerStats, hsStats |
| 地图统计 | 7 张地图胜率卡片 | mapStats |
| 外设+库存 | 选手外设汇总 + 库存 | peripherals, inventory |
| 教练评语 | 评论列表 | coachNotes |

**交互**: 点击赛事行 → 弹出比赛详情 Modal，点击地图卡片 → 弹出地图统计 Modal

### 6.5 Members.jsx — 分部成员

**功能**: 按 `team_type` 分组展示选手卡片
- **roster** (现役): 金色边框 + 发光效果
- **staff** (职员): 蓝色边框
- **former** (离队): 灰色淡化

**卡片内容**: 头像首字母 / 昵称 / 位置 / 年龄 / 入队天数 / 编辑按钮

**交互**: 
- 点击卡片 → 弹出选手详情
- 点击编辑 → `PlayerEditModal` 弹窗 (昵称/真名/SteamID/位置/日期/HLTV/头像)

### 6.6 Matches.jsx — 近期比赛

**筛选**: 3种比赛类型 (训练赛/正式赛/全部) + 4个时间范围 (3/7/30天/自定义) + 搜索框 + 地图筛选

**展示**: 按日期+对手分组的卡片，每张卡片显示：
- 对手名 / 日期 / BO格式标签 / 地图列表 (带颜色标记) / 比分 / 比赛类型

### 6.7 TrainingReport.jsx — 赛训报告 (核心页面, ~744行)

**功能**: 日期范围内训练数据全景展示

**页面结构**:
```
日期选择器 [start] ~ [end]    [立即同步]
┌──────┬──────┬──────┬──────┬──────────┐
│ 场次  │ 回合  │ 胜场  │ 负场  │ 地图胜率   │  ← MetricCard 卡片
├──────────────┴──────┴──────┴──────────┤
│  问题类型分布(柱状图)  │  选手失误统计(卡片) │
│  点击→选手分布        │  点击→失误明细     │
├──────────────────────┴────────────────┤
│        地图统计 (卡片网格)              │
│        点击→地图详情弹框               │
├────────────────────────────────────────┤
│        比赛记录 (表格)                  │
│  日期|对手|回合|问题|地图结果           │
│  点击行→单场联动报告弹框               │
└────────────────────────────────────────┘
```

**三级下钻交互**:

| 层级 | 操作 | 展示 |
|------|------|------|
| L1 | 点击问题类型柱 | 各选手该问题次数 |
| L2 | 点击选手卡片 | 该选手各项问题分布 |
| L3 | 点击问题类型 | 具体回合列表 (地图/回合号/战术/原因) |

**API**: `GET /api/training/dashboard?start=YYYY-MM-DD&end=YYYY-MM-DD`

### 6.8 Tactics.jsx — 战术总表

**筛选**: 地图选择 / T/CT 阵营 / 关键词搜索

**展示**: 战术卡片，按地图颜色标记，显示 tactic_id + name + description

**点击**: 弹出战术详情弹窗

**API**: `GET /api/training/tactics?map=X&side=Y`

### 6.9 Admin.jsx — 数据管理

**功能**: 用户审核 (pending → approved) + 用户 CRUD

**表单字段**: 用户名 / 密码 / Steam ID / 角色 / 分部

**权限**: 仅 admin 角色可访问

---

## 7. 后端 API 详解

### 7.1 通用约定

| 项目 | 说明 |
|------|------|
| Base URL | `/api` |
| 鉴权 | `Authorization: Bearer <JWT>` |
| 内容类型 | `application/json` |
| 错误格式 | `{ "error": "错误描述" }` |
| 限流 | 15分钟 200 次请求 |

### 7.2 认证模块 `routes/auth.js`

```
POST /api/auth/login
-- 请求体: { "username": "admin", "password": "admin123", "steam_id": "00000000000000000", "role": "admin" }
-- 返回: { "token": "JWT...", "user": { "id":1, "username":"admin", "role":"admin" } }
-- 错误: 401 "用户名或密码错误" / 403 "账号未审核"

POST /api/auth/register (已禁用)
```

### 7.3 选手管理 `routes/players.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/players` | 查询选手列表。query: team_type, status, division |
| POST | `/api/players` | 新增选手 |
| PUT | `/api/players/:id` | 编辑选手 |
| DELETE | `/api/players/:id` | 删除选手 |
| POST | `/api/players/:id/avatar` | 上传头像 (multipart/form-data, 字段 avatar) |
| POST | `/api/players/import` | Excel 批量导入 |
| GET | `/api/players/export` | Excel 导出 |

### 7.4 比赛记录 `routes/matches.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/matches/grouped` | 按日期+对手分组查询。query: days, matchType, search, map, dateFrom, dateTo |
| GET | `/api/matches/overview` | 比赛概览统计 |
| POST | `/api/matches/import` | Excel 导入比赛数据 |
| DELETE | `/api/matches/:id` | 删除单张地图 |
| PUT | `/api/matches/:opponentDate` | 批量更新对手名 |

### 7.5 统计 `routes/stats.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats/maps` | 地图胜率 (played/wins/win_rate/avg_ct/avg_t) |
| GET | `/api/stats/vs-opponent` | 对阵特定对手统计 |
| GET | `/api/stats/players` | 选手个人 K/D/A/ADR/Rating |
| GET | `/api/stats/halftime` | 半场 T/CT 数据 |

### 7.6 赛训核心 `routes/training.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/training/dashboard` | **主接口**。参数: start, end, days。返回 overview, issue_distribution, map_stats, match_summary, player_stats, player_performance, all_issue_rounds, special_events |
| GET | `/api/training/report/:sessionId` | 单场赛次联动报告 (简报+回合+战术) |
| GET | `/api/training/match-records` | 按地图筛选比赛记录 (弹框用) |
| GET | `/api/training/round-details` | 回合详情查询 (带筛选) |
| GET | `/api/training/tactics` | 战术总表数据 |

### 7.7 数据总览 `routes/dashboard.js`

```
GET /api/dashboard/overview
-- 无需参数
-- 返回:
{
  kpi:          { vrsRank, recentWinRate, recentWins, totalRecentMatches, trainingQuality, foundedDate }
  upcomingMatch: { match_date, match_time, opponent, event_name, stage, bo_format, match_type }  // 仅 official
  recentMatches: [{ id, date, opponent, map, score, result }]  // 近10场
  playerStats:   [{ nickname, in_game_role, avg_rating, total_kills, total_deaths, avg_adr }]
  hsStats:       [{ nickname, hs_pct }]  // 近3天爆头率
  teamAverages:  { rating, adr }
  mapStats:      [{ map_name, played, wins, losses, win_rate }]  // 近30天
  matchDetails:  [...]  // 含选手详细数据
  peripherals:   [{ player_id, nickname, keyboard, mouse, headset, mousepad, monitor }]
  inventory:     [{ id, item_type, current_count, max_count }]
  opponentIntel: { opponent_name, vrs_rank, map_preference, core_players }
  h2hFromDb:     { wins, losses }
  trainingPlan:  [{ id, plan_date, start_time, end_time, title, subtitle, tags }]
  coachNotes:    [{ id, date, opponent, map, notes }]
  weeklyComparison: { issues: [{ issue_type, cnt }] }  // 上周Top3问题
  missingData:   [...]  // 缺失数据列表 (方便前端标识)
}
```

### 7.8 v2.1 新增模块

#### 外设管理 `routes/peripherals.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/peripherals` | 获取所有选手外设 (JOIN players) |
| GET | `/api/peripherals/:playerId` | 单个选手外设 |
| PUT | `/api/peripherals/:playerId` | 更新外设 (upsert) |

#### 库存管理 `routes/inventory.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/inventory` | 所有库存项 |
| POST | `/api/inventory` | 新增库存 |
| PUT | `/api/inventory/:id` | 更新库存 |
| DELETE | `/api/inventory/:id` | 删除库存 |
| PUT | `/api/inventory/batch` | 批量更新库存 |

#### 训练计划 `routes/training-plans.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/training-plans?date=YYYY-MM-DD` | 按日期查询 |
| POST | `/api/training-plans` | 创建 |
| PUT | `/api/training-plans/:id` | 更新 |
| DELETE | `/api/training-plans/:id` | 删除 |
| PUT | `/api/training-plans/batch` | 批量保存 (删旧插新) |

#### 对手情报 `routes/opponent-intel.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/opponent-intel?opponent=X` | 模糊搜索 |
| POST | `/api/opponent-intel` | 新增 |
| PUT | `/api/opponent-intel/:id` | 更新 |
| DELETE | `/api/opponent-intel/:id` | 删除 |

### 7.9 管理员 `routes/admin.js`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/pending-users` | 待审核列表 (需 adminAuth) |
| POST | `/api/admin/approve-user/:id` | 审核通过 |
| DELETE | `/api/admin/reject-user/:id` | 拒绝 |
| GET | `/api/admin/users` | 所有用户 |
| PUT | `/api/admin/users/:id` | 编辑用户 |
| DELETE | `/api/admin/users/:id` | 删除用户 |

### 7.10 系统配置 `routes/config.js`

```
GET  /api/config         -- 读取 .env 文件配置
PUT  /api/config         -- 更新 .env 配置项
GET  /api/config/system  -- 读取 system_config 表 (founded_date, vrs_rank)
```

### 7.11 内部 API

```
POST /api/internal/sync-tencent  -- 腾讯文档同步 (仅 localhost)
GET  /api/special-events         -- 特殊事件查询
```

---

## 8. 数据来源与生成逻辑

### 8.1 数据来源总览

| 数据类型 | 来源 | 同步方式 | 频率 |
|---------|------|---------|------|
| 选手信息 | Excel 导入 + 网页手动编辑 | `POST /api/players/import` | 按需 |
| 比赛记录 | Excel 导入 + ETL | `POST /api/matches/import` + `etl_sync_all.py` | 按需 |
| 选手比赛数据 | HLTV 爬虫 | `sync_hltv.py` | 手动触发 |
| 训练日志 | 腾讯文档 | `sync_tencent_api.py` | 每日 17:30 自动 |
| 战术总表 | Excel 全量覆盖 | `etl_sync_all.py` | 按需 |
| 即将赛事 | 网页手动编辑 | 前端表单 CRUD | 按需 |
| 对手情报 | 网页手动编辑 | 前端表单 CRUD | 按需 |
| 外设/库存 | 网页手动编辑 | 前端表单 CRUD | 按需 |
| 训练计划 | 网页手动编辑 | 前端表单 CRUD | 按需 |
| VRS 排名 | system_config 表 | 手动更新 (HLTV 爬虫待开发) | 手动 |

### 8.2 KPI 计算逻辑

**近十场胜率** (`kpi.recentWinRate`):
```sql
-- 从 matches 表查询最近 10 场比赛，按 result 列统计 win/loss 比例
-- 数据完整性过滤后的计数
SELECT result, COUNT(*) as cnt FROM matches
WHERE <完整性过滤> ORDER BY match_date DESC LIMIT 10
```

**训练质量** (`kpi.trainingQuality`):
```sql
-- 从 training_rounds 统计无问题回合占比
-- 近 30 天训练回合中，所有 issue_* 字段均为 0 的回合比例
```

**成立天数** (`kpi.foundedDate`):
```javascript
// 前端 JS 计算
const daysSince = (dateStr) => {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
// founded_date = '2025-03-27' (from system_config 表)
```

**HS% (爆头率)**:
```sql
-- 从 player_stats 表，近 3 天数据
-- 计算每位选手的 hs / kills 比例
```

**周环比训练重点**:
```sql
-- 从 training_rounds，近 7 天
-- 统计 5 种 issue 出现频率，返回 Top 3
SELECT 
  CASE WHEN issue_grenade = 1 THEN '道具配合' ... END as issue_type,
  COUNT(*) as cnt
FROM training_rounds
WHERE created_at >= date('now','localtime','-7 days')
GROUP BY issue_type ORDER BY cnt DESC LIMIT 3
```

### 8.3 ETL 同步流程 (`etl_sync_all.py`)

1. 读取 4 张 Excel → 按 sheet 名解析
2. 训练日志 sheet: `MMDD_vs_OPPONENT` 格式 → 解析对手/日期/地图/回合
3. 简报 sheet: `MMDD` 格式 → 解析指令/战术/优先级
4. 战术总表 sheet: `战术总表` → 全量覆盖式导入 (DELETE + INSERT)
5. 比赛数据 sheet: `MMDD_match` 格式 → 解析选手 K/D/A/ADR

### 8.4 腾讯文档同步流程 (`sync_tencent_api.py`)

1. 腾讯文档 API 导出 CSV → 下载到 `tencent_sync/` 目录
2. `server.js` 内建 `POST /api/internal/sync-tencent` 触发
3. CSV → XLSX 转换 (server.js 内置 xlsx 库)
4. 调用 `etl_sync_all.py` 写入数据库
5. 特殊事件检测：简报"地图"字段若非标准 CS2 地图名 → 标记为 special_events

---

## 9. 部署与运维

### 9.1 首次部署 (服务器)

```bash
# 1. SSH 到服务器
ssh ubuntu@ur-esports.cn

# 2. 安装 Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 安装 PM2 和 Nginx
sudo npm install -g pm2
sudo apt-get install -y nginx python3 python3-pip sqlite3

# 4. 克隆代码
cd /home/ubuntu
git clone https://github.com/aiwazap/ur-esports.git
cd ur-esports

# 5. 安装依赖
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# 6. 配置环境变量
cp backend/.env.example backend/.env
nano backend/.env   # 修改 JWT_SECRET

# 7. 创建管理员
cd backend && node setup-admin.js

# 8. 配置 Nginx
sudo cp nginx-ur-esports.conf /etc/nginx/sites-available/ur-esports
sudo ln -sf /etc/nginx/sites-available/ur-esports /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 9. 配置 SSL (Let's Encrypt)
sudo certbot --nginx -d ur-esports.cn -d www.ur-esports.cn

# 10. 启动 PM2
pm2 start backend/server.js --name ur-esports
pm2 save
pm2 startup
```

### 9.2 日常部署 (代码更新)

**方式一: 手动 (OrcaTerm)**
```bash
# 服务器上
cd /home/ubuntu/ur-esports
git pull origin main
cd frontend && npm run build
pm2 restart ur-esports
```

**方式二: 自动化脚本**
```bash
# 服务器上
cd /home/ubuntu/ur-esports && bash deploy.sh
```

### 9.3 数据库操作

```bash
# 备份
cp /home/ubuntu/ur-esports/backend/data/ur_esports.db \
   /home/ubuntu/backup/database_$(date +%Y%m%d_%H%M).db

# 查看表
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db ".tables"

# 查看表结构
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db "PRAGMA table_info(表名);"

# 添加列
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db "ALTER TABLE 表名 ADD COLUMN 列名 类型;"

# 从 schema.sql 重新初始化 (⚠️ 危险! 会清空数据)
rm /home/ubuntu/ur-esports/backend/data/ur_esports.db
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db < /home/ubuntu/ur-esports/backend/config/schema.sql

# 执行迁移
cd /home/ubuntu/ur-esports/backend && node scripts/migrate_v2_1.js
```

### 9.4 常用运维命令

```bash
pm2 status                          # 服务状态
pm2 restart ur-esports              # 重启
pm2 logs ur-esports --lines 50      # 最近50行日志
pm2 logs ur-esports --nostream      # 不跟踪，仅输出
tail -50 /home/ubuntu/.pm2/logs/ur-esports-error.log   # 错误日志
sudo nginx -t                       # Nginx 配置测试
sudo systemctl reload nginx         # Nginx 重载
```

### 9.5 本地开发工作流

```bash
# Windows 本地 (不需要 OrcaTerm)
# 1. 启动后端
cd E:\ur-esports\ur-esports-deploy\backend
node server.js                          # 或: npm start

# 2. 启动前端 (另一个终端)
cd E:\ur-esports\ur-esports-deploy\frontend
npm run dev                             # Vite dev server on :5173

# 3. 修改代码后
# 前端: Vite HMR 自动热更新
# 后端: 手动重启 node server.js

# 4. 提交代码
git add -A
git commit -m "描述"
git push origin main

# 5. 部署到服务器
# 通过 OrcaTerm 执行: cd /home/ubuntu/ur-esports && bash deploy.sh
```

### 9.6 从 GitHub 部署到服务器的快速方式

当 `git pull` 在服务器上不可用时（国内网络问题），使用 GHProxy 镜像：

```bash
cd /tmp && rm -rf ur-esports-latest
git clone https://ghproxy.com/https://github.com/aiwazap/ur-esports.git ur-esports-latest
cp -rf /tmp/ur-esports-latest/frontend/public/* /home/ubuntu/ur-esports/frontend/public/
cp -f /tmp/ur-esports-latest/frontend/src/pages/*.jsx /home/ubuntu/ur-esports/frontend/src/pages/
cp -f /tmp/ur-esports-latest/backend/server.js /home/ubuntu/ur-esports/backend/server.js
cp -f /tmp/ur-esports-latest/backend/routes/*.js /home/ubuntu/ur-esports/backend/routes/
cd /home/ubuntu/ur-esports/frontend && npm run build && pm2 restart ur-esports
```

---

## 10. 常见问题与故障排除

### 10.1 页面 500 错误

```bash
# 查看错误详情
tail -50 /home/ubuntu/.pm2/logs/ur-esports-error.log

# 常见原因:
# 1. SQLite 缺少表/列 → ALTER TABLE 添加
# 2. 路由文件不存在 → 注释掉 server.js 中对应行
# 3. 模块找不到 → 确认 package.json 依赖已安装
```

### 10.2 数据库为空 (0 字节)

数据库文件损坏或被意外清空时：
```bash
cp /home/ubuntu/ur-esports/backend/data/ur_esports.db /tmp/db.bak
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db < /home/ubuntu/ur-esports/backend/config/schema.sql
pm2 restart ur-esports
```

### 10.3 前端构建失败

```bash
# 检查 Node 版本
node -v   # 需要 18+

# 清除缓存
cd /home/ubuntu/ur-esports/frontend
rm -rf node_modules dist .vite
npm install
npm run build
```

### 10.4 "数据加载失败" 但页面正常

JWT 过期或 localStorage 被清除 → 重新登录即可。

### 10.5 matches 表缺少 result/score 列

```bash
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db "ALTER TABLE matches ADD COLUMN result TEXT;"
sqlite3 /home/ubuntu/ur-esports/backend/data/ur_esports.db "ALTER TABLE matches ADD COLUMN score TEXT;"
pm2 restart ur-esports
```

### 10.6 设计指南

- **颜色规范**: 中国股市惯例 — 盈利/上涨 → 红色，亏损/下跌 → 绿色
- **配色方案**: 黑金 #D4AF37 + 深色背景 #0a0a0a
- **视觉效果**: 赛博玻璃 / 3D 质感 / 竖版卡牌
- **禁止**: 扁平化 AI 风格

### 10.7 WorkBuddy 项目记忆

`.workbuddy/` 目录存储项目级记忆和每日工作日志，**禁止删除**。

```bash
# 项目记忆文件
.workbuddy/memory/MEMORY.md       # 长期项目记忆
.workbuddy/memory/YYYY-MM-DD.md   # 每日工作日志 (仅追加)
```

---

> **文档维护**: 本文档应在重大变更后更新。建议每次部署后检查是否需要补充新内容。
> **最后更新**: 2026-06-08 by 巴蒂 (AI 助理)
