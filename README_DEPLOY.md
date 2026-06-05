# UR ESPORTS v2.0 — 部署指南

## 远程仓库配置

首先在 GitHub 上创建仓库（如 `ur-esports/ur-esports-deploy`），然后：

```bash
cd E:\ur-esports\ur-esports-deploy
git remote add origin https://github.com/<你的用户名>/ur-esports-deploy.git
git push -u origin main
```

## 部署流程（日常更新）

### 方式一：自动化部署（推荐）

```bash
# 本地 → 推送
git add -A && git commit -m "更新内容" && git push

# 服务器 → 拉取并部署
ssh ubuntu@ur-esports.cn "cd /home/ubuntu/ur-esports && bash deploy.sh"
```

### 方式二：手动部署

```bash
# 1. SSH 到服务器
ssh ubuntu@ur-esports.cn

# 2. 拉取代码
cd /home/ubuntu/ur-esports
git pull origin main

# 3. 安装依赖 + 构建前端
cd backend && npm install && cd ../frontend && npm install && npm run build && cd ..

# 4. 重启服务
pm2 restart ur-esports

# 5. 验证
pm2 list
```

## 初期数据同步（仅首次）

以下文件不在 Git 中（已在 .gitignore 排除），需手动同步：

```bash
# 本地上传数据库
scp E:\ur-esports\ur-esports-deploy\backend\data\ur_esports.db \
    ubuntu@ur-esports.cn:/home/ubuntu/ur-esports/backend/data/

# 本地上传选手头像
scp -r E:\ur-esports\ur-esports-deploy\backend\uploads\avatars\ \
    ubuntu@ur-esports.cn:/home/ubuntu/ur-esports/backend/uploads/

# 本地上传 .env 配置文件
scp E:\ur-esports\ur-esports-deploy\backend\.env \
    ubuntu@ur-esports.cn:/home/ubuntu/ur-esports/backend/
```

## 选手照片显示修复

### 问题原因

Nginx 只代理了 `/api` 路径到 Node 后端，但 `/uploads` 路径未被代理，导致照片 404。

### 修复步骤

1. 将 `nginx-ur-esports.conf` 复制到服务器 Nginx 配置目录
2. 重载 Nginx:

```bash
sudo cp /home/ubuntu/ur-esports/nginx-ur-esports.conf /etc/nginx/sites-available/ur-esports
sudo ln -sf /etc/nginx/sites-available/ur-esports /etc/nginx/sites-enabled/
sudo nginx -t          # 测试配置
sudo systemctl reload nginx
```

### 验证

访问 https://ur-esports.cn/uploads/avatars/avatar_190_1780492173402.jpg  
如果显示照片则修复成功。

## 项目结构速查

```
ur-esports-deploy/
├── .gitignore              # Git 忽略规则
├── deploy.sh               # 自动化部署脚本
├── server-setup.sh         # 服务器首次配置脚本
├── nginx-ur-esports.conf   # Nginx 配置（含 /uploads 代理修复）
├── README_DEPLOY.md        # 本文档
├── backend/
│   ├── server.js           # Express 入口（端口 3000）
│   ├── .env                # 环境变量（JWT_SECRET 等）
│   ├── config/db.js        # SQLite 数据库封装
│   ├── middleware/auth.js   # JWT 认证中间件
│   ├── routes/             # API 路由
│   │   ├── players.js      # 🎯 选手 CRUD（含头像上传）
│   │   ├── matches.js
│   │   ├── training.js
│   │   └── ...
│   ├── uploads/avatars/    # 🎯 选手头像存储
│   └── data/ur_esports.db  # SQLite 数据库
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   └── Members.jsx # 🎯 分部成员页面
    │   └── components/
    │       └── PlayerEditModal.jsx  # 🎯 选手编辑弹窗
    └── dist/               # 构建产物
```
