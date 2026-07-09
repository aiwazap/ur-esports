const router = require('express').Router();
const db = require('../config/db');
const { auth, adminAuth } = require('../middleware/auth');
// [安全] PII 收窄: 非管理员隐藏敏感字段
const PII_ADMIN_ROLES = ["admin","管理员","coach","team_lead","教练","领队","manager","ceo","经理"];
const PII_FIELDS = ["id_card","phone","id_pw","id_5e","id_faceit_sea","id_faceit_eu","steam_id64","contract_url"];
function stripPII(row, user){ if(!row) return row; if(user && PII_ADMIN_ROLES.includes(user.role)) return row; const r={...row}; for(const f of PII_FIELDS) delete r[f]; return r; }
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
// [安全] 上传扩展名白名单, 阻断 html/svg/js 等可执行文件
const IMG_EXT = ['.png','.jpg','.jpeg','.gif','.webp'];
const DOC_EXT = ['.pdf'].concat(IMG_EXT);
function extFilter(allow){ return (req,file,cb)=>{ const ext=(path.extname(file.originalname||'')).toLowerCase(); if(allow.includes(ext)) cb(null,true); else cb(new Error('不允许的文件类型: '+ext)); }; }

// 保留原始文件扩展名
const uploadStorage = multer.diskStorage({
  destination: 'uploads/tmp/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage: uploadStorage });

// 选手表字段映射（Excel 列名 → DB 字段）
const PLAYER_FIELDS = {
  '游戏昵称': 'nickname', '昵称': 'nickname', 'nickname': 'nickname',
  '真实姓名': 'real_name', '姓名': 'real_name', 'real_name': 'real_name',
  'Steam ID': 'steam_id', 'steam_id': 'steam_id', 'steam': 'steam_id',
  '职位': 'role', 'role': 'role',
  '场上角色': 'in_game_role', '位置': 'in_game_role', 'in_game_role': 'in_game_role',
  '入队日期': 'join_date', '日期': 'join_date', 'join_date': 'join_date',
  '离队日期': 'leave_date', 'leave_date': 'leave_date',
  '状态': 'status', 'status': 'status',
  '类型': 'team_type', 'team_type': 'team_type',
  '选手介绍': 'bio', '简介': 'bio', 'bio': 'bio',
  '头像': 'avatar_url', 'avatar_url': 'avatar_url',
};

// 获取所有选手
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM players WHERE division = 'cs2'
       ORDER BY CASE team_type WHEN 'staff' THEN 1 WHEN 'roster' THEN 2 WHEN 'former' THEN 3 END,
       CASE WHEN team_type = 'roster' THEN (CASE roster_status WHEN 'starter' THEN 1 WHEN 'bench' THEN 2 WHEN 'demoted' THEN 3 ELSE 1 END) ELSE 0 END,
       CASE team_type WHEN 'former' THEN leave_date END DESC,
       CASE team_type WHEN 'former' THEN NULL ELSE join_date END ASC,
       real_name ASC`
    );
    res.json(rows.map(r => stripPII(r, req.user)));
  } catch (e) {
    console.error('GET /players error:', e.message);
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// ========== 下载选手导入模板 ==========
router.get('/template', adminAuth, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = ['游戏昵称*', '真实姓名', 'Steam ID', '职位', '场上角色', '入队日期', '离队日期', '类型', '状态', '选手介绍'];
  const example = ['0z', '辜龙', '76561198000000001', '选手', 'IGL/指挥', '2025-01-01', '', 'roster', 'active', '队伍核心指挥'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 2 + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, '选手名单');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fileName = 'UR_Players_Import_Template.xlsx';
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 获取单个选手详情（含赛事记录）
router.get('/:id', auth, async (req, res) => {
  try {
    const [player] = await db.query('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player.length) return res.status(404).json({ error: '选手不存在' });

    const [official] = await db.query(`
      SELECT m.*, ps.kills, ps.deaths, ps.adr, ps.rating
      FROM matches m
      JOIN player_stats ps ON m.id = ps.match_id
      WHERE ps.player_id = ? AND m.match_type = 'official'
      ORDER BY m.match_date DESC`, [req.params.id]);

    const [scrim] = await db.query(`
      SELECT m.match_date, m.opponent, m.map_name, m.our_score, m.their_score, m.result
      FROM matches m
      JOIN player_stats ps ON m.id = ps.match_id
      WHERE ps.player_id = ? AND m.match_type = 'scrim'
      ORDER BY m.match_date DESC LIMIT 6`, [req.params.id]);

    res.json({ ...stripPII(player[0], req.user), official_matches: official, recent_scrims: scrim });
  } catch (e) {
    console.error('GET /players/:id error:', e.message);
    res.status(500).json({ error: '获取失败: ' + e.message });
  }
});

// 创建选手（管理员）
router.post('/', adminAuth, async (req, res) => {
  const { nickname, real_name, steam_id, game_steam_id, role, in_game_role, join_date, status, team_type, bio, id_5e, id_pw, id_faceit_sea, id_faceit_eu } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO players (nickname, real_name, steam_id, game_steam_id, role, in_game_role, join_date, status, team_type, bio, id_5e, id_pw, id_faceit_sea, id_faceit_eu, division)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cs2')`,
      [nickname, real_name, steam_id, game_steam_id, role, in_game_role, join_date, status || 'active', team_type || 'roster', bio, id_5e || null, id_pw || null, id_faceit_sea || null, id_faceit_eu || null]
    );
    // 同步到 player_id_mappings
    if (game_steam_id && game_steam_id.trim()) {
      try {
        await db.query('INSERT OR IGNORE INTO player_id_mappings (player_id, game_id) VALUES (?, ?)',
          [result.insertId, game_steam_id.trim()]);
      } catch { /* ignore */ }
    }
    res.json({ id: result.insertId, message: '选手创建成功' });
  } catch { res.status(500).json({ error: '创建失败' }); }
});

// PUT /players/reorder — 拖拽排序（必须在 /:id 之前注册）
router.put('/reorder', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 必传' });
    ids.forEach((id, idx) => {
      db.query('UPDATE players SET sort_order = ? WHERE id = ?', [idx, id]);
    });
    res.json({ message: '排序已保存' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /players/:id — 更新选手信息（admin专用，含全部字段）
router.put('/:id', adminAuth, async (req, res) => {
  const fields = ['nickname','real_name','steam_id','game_steam_id','role','in_game_role','join_date','leave_date','status','team_type','roster_status','bio','birth_date','avatar_url','leave_reason','id_5e','id_pw','id_faceit_sea','id_faceit_eu'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: '无更新内容' });
  try {
    await db.query(
      `UPDATE players SET ${updates.map(f => `${f}=?`).join(',')} WHERE id=?`,
      [...updates.map(f => req.body[f]), req.params.id]
    );
    // 同步 game_steam_id 到 player_id_mappings
    if (req.body.game_steam_id && req.body.game_steam_id.trim()) {
      try {
        await db.query(
          'INSERT OR IGNORE INTO player_id_mappings (player_id, game_id) VALUES (?, ?)',
          [req.params.id, req.body.game_steam_id.trim()]
        );
      } catch { /* 映射表更新失败不影响主流程 */ }
    }
    res.json({ message: '更新成功' });
  } catch { res.status(500).json({ error: '更新失败' }); }
});

// ========== 批量导入选手 (Excel) ==========
router.post('/import', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传选手名单文件 (.xlsx)' });

  const filePath = req.file.path;
  try {
    // 检测文件类型
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.xlsm') {
      try { fs.unlinkSync(filePath); } catch {}
      return res.status(400).json({ error: '不支持的文件格式，请上传 .xlsx 文件' });
    }

    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows.length) {
      try { fs.unlinkSync(filePath); } catch {}
      return res.status(400).json({ error: 'Excel 文件中没有数据' });
    }

    // 从表头映射字段
    const headerRow = rows[0];
    const colMap = {}; // DB字段 → Excel列索引(数字)
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '').trim().replace(/\*$/g, ''); // 去掉必填标记 *
      const dbField = PLAYER_FIELDS[h] || PLAYER_FIELDS[h.toLowerCase()];
      if (dbField) colMap[dbField] = i;
    }

    // 至少需要 nickname
    if (colMap['nickname'] === undefined) {
      try { fs.unlinkSync(filePath); } catch {}
      return res.status(400).json({ error: 'Excel 表头缺少"游戏昵称"或"nickname"列' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const nickname = colMap['nickname'] !== undefined
        ? String(row[colMap['nickname']] || '').trim()
        : '';
      if (!nickname) { skipped++; continue; }

      // 映射各字段
      const mapVal = (field) => {
        if (colMap[field] === undefined) return null;
        const v = String(row[colMap[field]] || '').trim();
        return v || null;
      };

      const real_name = mapVal('real_name');
      const steam_id = mapVal('steam_id');
      const role = mapVal('role');
      const in_game_role = mapVal('in_game_role');
      const join_date = mapVal('join_date');
      const leave_date = mapVal('leave_date');
      let team_type = mapVal('team_type');
      let status = mapVal('status');

      // 规范化 team_type
      if (team_type && !['roster', 'staff', 'former'].includes(team_type.toLowerCase())) {
        const tl = team_type.toLowerCase();
        if (tl.includes('选手') || tl.includes('现役') || tl.includes('active') || tl.includes('主力')) team_type = 'roster';
        else if (tl.includes('教练') || tl.includes('分析') || tl.includes('管理') || tl.includes('领队') || tl.includes('经理')) team_type = 'staff';
        else if (tl.includes('离队') || tl.includes('退役') || tl.includes('前') || tl.includes('former') || tl.includes('inactive')) team_type = 'former';
        else team_type = 'roster';
      } else {
        team_type = team_type?.toLowerCase() || 'roster';
      }

      // 规范化 status
      if (status && !['active', 'inactive', 'left'].includes(status.toLowerCase())) {
        const sl = status.toLowerCase();
        if (sl.includes('在') || sl.includes('active')) status = 'active';
        else if (sl.includes('休') || sl.includes('inactive')) status = 'inactive';
        else if (sl.includes('离') || sl.includes('left')) status = 'left';
        else status = 'active';
      } else {
        status = status?.toLowerCase() || 'active';
      }

      // join_date 格式处理
      let jd = join_date;
      if (jd) {
        // 尝试解析 Excel 日期（可能是数字）
        const parsed = Date.parse(jd);
        if (!isNaN(parsed)) {
          jd = new Date(parsed).toISOString().split('T')[0];
        }
      }

      let ld = leave_date;
      if (ld) {
        const parsed2 = Date.parse(ld);
        if (!isNaN(parsed2)) {
          ld = new Date(parsed2).toISOString().split('T')[0];
        }
      }

      const bio = mapVal('bio');
      const avatar_url = mapVal('avatar_url');

      try {
        // UPSERT: 如果 nickname 已存在则更新
        const [existing] = await db.query('SELECT id FROM players WHERE nickname = ?', [nickname]);
        if (existing.length) {
          await db.query(
            `UPDATE players SET real_name=?, steam_id=?, role=?, in_game_role=?, join_date=?, leave_date=?,
             status=?, team_type=?, bio=?, avatar_url=?, updated_at=datetime('now','localtime')
             WHERE id=?`,
            [real_name, steam_id, role, in_game_role, jd, ld, status, team_type, bio, avatar_url, existing[0].id]
          );
        } else {
          await db.query(
            `INSERT INTO players (nickname, real_name, steam_id, role, in_game_role, join_date, leave_date,
             status, team_type, bio, avatar_url, division)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cs2')`,
            [nickname, real_name, steam_id, role, in_game_role, jd, ld, status, team_type, bio, avatar_url]
          );
        }
        imported++;
      } catch (e) {
        skipped++;
        errors.push(`第${i + 2}行 "${nickname}": ${e.message}`);
      }
    }

    res.json({
      message: '导入完成',
      imported,
      skipped,
      total: rows.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

// DELETE /players/:id — 删除选手
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const [existing] = await db.query('SELECT id FROM players WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: '选手不存在' });
    await db.query('DELETE FROM players WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (e) {
    console.error('DELETE /players/:id error:', e.message);
    res.status(500).json({ error: '删除失败: ' + e.message });
  }
});

// POST /players/:id/avatar — 上传头像
const avatarUpload = multer({
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: extFilter(IMG_EXT),
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'avatars'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `avatar_${req.params.id}_${Date.now()}${ext}`);
    },
  }),
});
router.post('/:id/avatar', auth, avatarUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const url = `/uploads/avatars/${req.file.filename}`;
    await db.query('UPDATE players SET avatar_url = ? WHERE id = ?', [url, req.params.id]);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /players/:id/contract — 上传合同（r52，含试训队员；PDF/图片）
const contractUpload = multer({
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: extFilter(DOC_EXT),
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', 'contracts'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `contract_${req.params.id}_${Date.now()}${ext}`);
    },
  }),
});
router.post('/:id/contract', adminAuth, contractUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传合同文件' });
    const url = `/uploads/contracts/${req.file.filename}`;
    await db.query('UPDATE players SET contract_url = ? WHERE id = ?', [url, req.params.id]);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
