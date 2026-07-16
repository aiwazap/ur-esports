@echo off
chcp 65001 >nul
echo ════════════════════════════════════
echo   UR Esports 战术本 → Word 一键导出
echo ════════════════════════════════════
cd /d "D:\Agent files\claude\projects\ur-esports\tools\tactics-export"
node export.js
if errorlevel 1 (
  echo 导出失败，请把上面的报错发给 Claude
) else (
  echo 正在更新目录页码...
  powershell -NoProfile -ExecutionPolicy Bypass -File finish.ps1
  start "" "D:\Agent files\claude\projects\ur-esports\战术本导出"
)
pause
