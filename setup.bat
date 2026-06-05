@echo off
cd /d "%~dp0backend"
npm install -g pm2
npm install --production
node -e "const Database=require('better-sqlite3'); const fs=require('fs'); if(!fs.existsSync('./data/ur_esports.db')){const db=new Database('./data/ur_esports.db'); db.pragma('journal_mode=WAL'); const schema=fs.readFileSync('./config/schema.sql','utf8'); db.exec(schema); console.log('DB created'); db.close();}"
node setup-admin.js
pm2 delete ur-esports 2>nul
pm2 start server.js --name ur-esports
pm2 save
netsh advfirewall firewall add rule name="UR" dir=in action=allow protocol=TCP localport=3000 2>nul
echo Done! http://localhost:3000
echo admin / admin123
pause
