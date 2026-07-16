@echo off
chcp 65001 >nul
echo ════════════════════════════════════════
echo   UR Esports 本地开发站 一键启动
echo   后端 3001 + 前端 5173（Claude 调试副本）
echo ════════════════════════════════════════
start "UR后端-3001" /d "D:\Agent files\claude\projects\ur-esports\backend" cmd /k node server.js
start "UR前端-5173" /d "D:\Agent files\claude\projects\ur-esports\frontend" cmd /k npm run dev
timeout /t 4 /nobreak >nul
start http://localhost:5173
echo 已启动。关掉弹出的两个黑窗口即可停止服务。
