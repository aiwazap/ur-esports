const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execFile } = require('child_process');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/players', require('./routes/players'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/training', require('./routes/training'));
app.use('/api/config', require('./routes/config'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/peripherals', require('./routes/peripherals'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/training-plans', require('./routes/training-plans'));
app.use('/api/opponent-intel', require('./routes/opponent-intel'));
app.use('/api/trial', require('./routes/trial'));
// app.use('/api/hltv-sync', require('./routes/hltv-sync'));  // TODO: VRS auto-sync feature

// ============ Internal: tencent_sync trigger (localhost only) ============
const XLSX = require('xlsx');
const db = require('./config/db');

// CS2 standard map names (full + abbreviations)
const CS2_MAPS = /\b(mirage|dust2|inferno|nuke|ancient|anubis|overpass|vertigo|train|cache|op|anc|mir|d2|inf|nuk|trn|vtg|ovp)\b/i;

function detectSpecialEvent(briefingCsvText) {
  // Extract the "地图:" field from the second line of briefing CSV
  const lines = briefingCsvText.split('\n');
  if (lines.length < 2) return null;
  const metaLine = lines[1] || '';
  const mapMatch = metaLine.match(/地图[：:]\s*(.*?)(?:\s*\||$)/);
  if (!mapMatch) return null;
  const mapField = mapMatch[1].trim();
  if (!mapField) return null;
  // If the map field contains standard CS2 map names, it's a normal day
  if (CS2_MAPS.test(mapField)) return null;
  return mapField; // return the special event note (e.g. "放假", "被放鸽子")
}

function extractDateFromBriefingCsv(filename) {
  // briefing_MMDD.csv → extract date
  const m = filename.match(/_(\d{4})\.csv$/);
  if (!m) return null;
  const mmdd = m[1];
  const now = new Date();
  const year = now.getFullYear();
  const month = parseInt(mmdd.slice(0, 2));
  const day = parseInt(mmdd.slice(2, 4));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

app.post('/api/internal/sync-tencent', async (req, res) => {
  // Allow requests from Nginx proxy (trust X-Forwarded-For from localhost)
  const clientIP = req.ip || req.socket.remoteAddress;
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const isLocal = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1'
               || forwarded === '127.0.0.1' || forwarded === '::1';
  if (!isLocal) {
    return res.status(403).json({ error: '仅限内部调用' });
  }

  const dataDir = process.env.DATA_DIR || '';
  const syncDir = dataDir
    ? path.join(dataDir, 'tencent_sync')
    : path.join(__dirname, '..', 'tencent_sync');

  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true });
    return res.json({ message: '同步目录已创建，等待数据写入', dir: syncDir });
  }

  const csvFiles = fs.readdirSync(syncDir).filter(f => f.endsWith('.csv'));
  if (!csvFiles.length) {
    return res.json({ message: '无待同步文件', dir: syncDir });
  }

  const MAPPING = {
    training: 'UR_CS2_训练日志.xlsx',
    briefing: 'UR_CS2_每日简报.xlsx',
    tactics: 'UR_CS2_战术总表.xlsx',
    match_data: 'CS2_Match_Data_May2026.xlsx',
  };

  // Build sheet name aligned with Tencent Docs source naming, so ETL scripts parse correctly.
  function buildSheetName(prefix, csvFile, rows) {
    switch (prefix) {
      case 'tactics':
        return '战术总表';                                // ETL hardcodes: wb['战术总表']

      case 'briefing': {
        const mm = csvFile.match(/_(\d{4})\.csv$/);
        return mm ? mm[1] : csvFile;                      // ETL: date_str = f"2026-{name[:2]}-{name[2:]}" → expects "0602"
      }

      case 'training': {
        // CSV row 0: "对手: dy2k| 日期: 2026-06-02 | ..."
        const firstCell = (rows[0] && rows[0][0]) || '';
        const oppMatch = firstCell.match(/对手[：:]\s*([^|\s]+)/);
        const opponent = oppMatch ? oppMatch[1] : 'OPPONENT';
        const mm = csvFile.match(/_(\d{4})\.csv$/);
        const mmdd = mm ? mm[1] : '0000';
        return `${mmdd}_vs_${opponent}`;                       // ETL: re.match(r'^(\d{4})_vs_(.+)$', sheetName)
      }

      case 'match_data': {
        // CSV row 0: ["日期", "2026-05-25 17:00"], row 1: ["地图", "Overpass"]
        const dateCell = (rows[0] && rows[0][1]) || '';
        const d = dateCell.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (d) return `${d[2]}${d[3]}_match`;             // ETL extracts opponent from sheet name via regex
        return 'match_data';
      }

      default:
        return csvFile.replace('.csv', '').slice(0, 31);
    }
  }

  const synced = [];
  const specialEvents = [];

  for (const csvFile of csvFiles) {
    const prefix = csvFile.replace(/_\d{4}\.csv$/, '').replace(/\.csv$/, '');
    const targetXlsx = MAPPING[prefix];
    if (!targetXlsx) {
      synced.push({ file: csvFile, status: '跳过（未知前缀）' });
      continue;
    }

    try {
      const csvPath = path.join(syncDir, csvFile);
      const csvText = fs.readFileSync(csvPath, 'utf-8');
      const rows = csvText.split('\n').map(line => line.split(','));

      // === Skip OPPONENT placeholder (coach hasn't updated opponent name yet) ===
      if (prefix === 'training') {
        const firstCell = (rows[0] && rows[0][0]) || '';
        const oppMatch = firstCell.match(/对手[：:]\s*([^|\s]+)/);
        const opponent = oppMatch ? oppMatch[1] : '';
        if (opponent.toUpperCase() === 'OPPONENT') {
          synced.push({ file: csvFile, status: '跳过（对手名未更新：OPPONENT）' });
          continue;
        }
      }

      // === Special Event Detection (briefing only) ===
      if (prefix === 'briefing') {
        const eventNote = detectSpecialEvent(csvText);
        const eventDate = extractDateFromBriefingCsv(csvFile);
        if (eventDate) {
          if (eventNote) {
            // Upsert special event
            db.query(
              `INSERT INTO special_events (date, status, note, updated_at)
               VALUES (?, '特殊事件', ?, datetime('now','localtime'))
               ON CONFLICT(date) DO UPDATE SET status='特殊事件', note=excluded.note, updated_at=datetime('now','localtime')`,
              [eventDate, eventNote]
            );
            specialEvents.push({ date: eventDate, note: eventNote, action: '标记' });
          } else {
            // Normal day — clear any previous special event
            db.query('DELETE FROM special_events WHERE date = ?', [eventDate]);
            specialEvents.push({ date: eventDate, note: null, action: '清除' });
          }
        }
      }

      // CSV → XLSX
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const sheetName = buildSheetName(prefix, csvFile, rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const xlsxPath = path.join(dataDir, targetXlsx);
      XLSX.writeFile(wb, xlsxPath);
      synced.push({ file: csvFile, target: targetXlsx, status: '已覆盖' });
    } catch (e) {
      synced.push({ file: csvFile, status: '失败: ' + e.message });
    }
  }

  // Trigger real-time sync from Tencent Docs API
  const liveScript = path.join(__dirname, 'scripts', 'sync_tencent_api.py');
  const pythonExe = process.platform === 'win32'
    ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
    : 'python3';

  execFile(pythonExe, [liveScript],
    { timeout: 180000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, DB_PATH: dbPath } },
    (error, stdout, stderr) => {
      if (error) {
        return res.json({ synced, specialEvents, sync: { status: '同步失败', error: stderr || error.message } });
      }
      // Extract JSON results from stdout
      const jsonMatch = stdout.match(/__JSON__START__([\s\S]*)__JSON__END__/);
      let syncResult = {};
      if (jsonMatch) {
        try { syncResult = JSON.parse(jsonMatch[1]); } catch {}
      }
      res.json({ synced, specialEvents, sync: { status: '完成', results: syncResult } });
    }
  );
});

// ============ Internal: query special events (localhost only, for frontend to proxy) ============
app.get('/api/special-events', (req, res) => {
  db.query('SELECT date, status, note FROM special_events ORDER BY date DESC')
    .then(([rows]) => res.json(rows))
    .catch(() => res.status(500).json({ error: '查询失败' }));
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UR Esports server running on port ${PORT}`));
