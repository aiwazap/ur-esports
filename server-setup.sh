#!/bin/bash
# ═══════════════════════════════════════════════════════════
# UR ESPORTS v2.0 — 服务器首次配置脚本
# 在 Ubuntu 服务器上以 ubuntu 用户执行
# 用法: bash server-setup.sh
# ═══════════════════════════════════════════════════════════

set -e

echo "============================================"
echo "  UR ESPORTS v2.0 — 服务器初始化"
echo "============================================"

# ── 0. 检查必要工具 ──
echo ""
echo "[0] 检查依赖..."
command -v git >/dev/null 2>&1 || { echo "安装 git..."; sudo apt install -y git; }
command -v node >/dev/null 2>&1 || { echo "❌ 请先安装 Node.js 22+"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo "安装 PM2..."; npm install -g pm2; }
echo "  ✓ 依赖检查通过"

# ── 1. 克隆仓库（首次）或拉取（已有） ──
PROJECT_DIR="/home/ubuntu/ur-esports"
if [ -d "$PROJECT_DIR/.git" ]; then
    echo ""
    echo "[1] 仓库已存在，拉取最新..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo ""
    echo "[1] 克隆仓库..."
    cd /home/ubuntu
    echo "  请手动执行: git clone <你的仓库URL> $PROJECT_DIR"
    echo "  然后重新运行此脚本"
    exit 1
fi

# ── 2. 环境变量 ──
echo ""
echo "[2] 检查 .env 配置..."
if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo "  创建 backend/.env..."
    cat > "$PROJECT_DIR/backend/.env" << 'ENVEOF'
JWT_SECRET=ur-esports-cs2-2026-secure-key-change-me
PORT=3000
DATA_DIR=/home/ubuntu/ur-esports/data
ENVEOF
    echo "  ⚠️ 请修改 JWT_SECRET 为随机字符串！"
fi

# ── 3. 创建必要目录 ──
echo ""
echo "[3] 创建数据目录..."
mkdir -p "$PROJECT_DIR/backend/uploads/avatars"
mkdir -p "$PROJECT_DIR/backend/uploads/tmp"
mkdir -p "$PROJECT_DIR/backend/data"
mkdir -p "$PROJECT_DIR/data/tencent_sync"
echo "  ✓ 目录已创建"

# ── 4. 安装依赖 ──
echo ""
echo "[4] 安装后端依赖..."
cd "$PROJECT_DIR/backend"
npm install --production

echo ""
echo "[5] 安装前端依赖并构建..."
cd "$PROJECT_DIR/frontend"
npm install
npm run build
echo "  ✓ 前端构建完成"

# ── 5. 初始化数据库（导入本地数据） ──
echo ""
echo "[6] 数据库说明..."
echo "  ⚠️ 需要手动导入本地数据库:"
echo "     将 backend/data/ur_esports.db 上传到服务器同路径"
echo "     或将 SQL 导出文件导入"

# ── 6. 启动 PM2 ──
echo ""
echo "[7] 启动服务..."
cd "$PROJECT_DIR/backend"
if pm2 list | grep -q ur-esports; then
    pm2 restart ur-esports
else
    pm2 start server.js --name ur-esports
fi
pm2 save
pm2 startup
echo "  ✓ PM2 已配置"

# ── 7. Nginx 配置 ──
echo ""
echo "[8] Nginx 配置..."
if [ -f "$PROJECT_DIR/nginx-ur-esports.conf" ]; then
    echo "  请手动执行以下命令更新 Nginx:"
    echo "  sudo cp $PROJECT_DIR/nginx-ur-esports.conf /etc/nginx/sites-available/ur-esports"
    echo "  sudo ln -sf /etc/nginx/sites-available/ur-esports /etc/nginx/sites-enabled/"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
fi

echo ""
echo "============================================"
echo "  初始化完成！"
echo "  下一步:"
echo "  1. 上传数据库: scp backend/data/ur_esports.db ubuntu@ur-esports.cn:/home/ubuntu/ur-esports/backend/data/"
echo "  2. 上传头像: scp -r backend/uploads/avatars/ ubuntu@ur-esports.cn:/home/ubuntu/ur-esports/backend/uploads/"
echo "  3. 更新 Nginx: 按上面 [8] 的命令执行"
echo "  4. 访问: https://ur-esports.cn"
echo "============================================"
