UR Esports CS2 赛训数据中心 - 部署说明
==========================================

包含内容:
  backend/       - Node.js + Express 后端（含 SQLite 数据库）
  frontend/dist/ - React 前端（已构建）
  setup.bat      - Windows 一键部署脚本
  backend/.env   - 环境配置

快速部署（Windows）:
  1. 确保已安装 Node.js 22.x: https://nodejs.org
  2. 双击 setup.bat 或在命令行运行它
  3. 浏览器访问 http://localhost:3000

手动部署:
  cd backend
  npm install --production
  npm start

管理员账号:
  首次启动后自动创建:
    用户名: admin
    密码:   admin123

常用操作:
  查看服务:    pm2 status
  重启服务:    pm2 restart ur-esports
  查看日志:    pm2 logs ur-esports
  停止服务:    pm2 stop ur-esports

数据文件:
  数据库: backend/data/ur_esports.db (SQLite)
  如需迁移到新电脑, 复制此文件即可

端口:
  默认 3000, 可在 backend/.env 中修改 PORT=3000

技术支持:
  华哥 - UR Esports
