#!/bin/bash
# ═══════════════════════════════════════════════════════════
# UR ESPORTS v2.0 — 自动化部署脚本
# 用法: bash deploy.sh
# 运行位置: 服务器 /home/ubuntu/ur-esports/
# ═══════════════════════════════════════════════════════════

set -e

PROJECT_DIR="/home/ubuntu/ur-esports"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "============================================"
echo "  UR ESPORTS v2.0 — 开始部署"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"

# ── 1. 拉取最新代码 ──
echo ""
echo "[1/5] 拉取最新代码..."
cd "$PROJECT_DIR"
git pull origin main
echo "  ✓ 代码已更新"

# ── 2. 后端依赖 ──
echo ""
echo "[2/5] 安装后端依赖..."
cd "$BACKEND_DIR"
npm install --production
echo "  ✓ 后端依赖安装完成"

# ── 3. 前端构建 ──
echo ""
echo "[3/5] 构建前端..."
cd "$FRONTEND_DIR"
npm install
npm run build
echo "  ✓ 前端构建完成 → $FRONTEND_DIR/dist/"

# ── 4. 重启服务 ──
echo ""
echo "[4/5] 重启 PM2 服务..."
pm2 restart ur-esports
echo "  ✓ PM2 服务已重启"

# ── 5. 验证 ──
echo ""
echo "[5/5] 验证服务状态..."
sleep 2
pm2 list | grep ur-esports
echo ""
echo "============================================"
echo "  部署完成！"
echo "  访问: https://ur-esports.cn"
echo "============================================"
