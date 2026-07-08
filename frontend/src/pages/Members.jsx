import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import PlayerEditModal from '../components/PlayerEditModal';
import './members-v4.css';

/* ════════════════════════════════════════════════════════════════
   赛训团队 v4（r69）· design 高保真 + 真实 /players 数据
   队员阵容：赛训团队(staff) / 服役队员(常规·外援金·试训青 + 空缺位, 最多5) / 历史队员(下放 + 离队甘特时间线)
   队员档案：hero + 字段网格 + BIO + 全员胶囊 + 编辑资料/合同(保留原功能)
   ════════════════════════════════════════════════════════════════ */

const ASSET = '/reshape/roster';
const LOGO_POOL = ['logo-teal.jpg', 'logo-black.jpg', 'logo-pink.jpg', 'logo-green.jpg'];
const pickLogo = (id) => { let h = 0; const s = String(id || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return `${ASSET}/${LOGO_POOL[h % LOGO_POOL.length]}`; };

// 昵称 → design 队员照片（DB avatar_url 优先）
const PHOTO_MAP = {
  aiwazap: { file: 'goatnikola.png', fit: 'contain' }, goatnikola: { file: 'goatnikola.png', fit: 'contain' },
  hz: { file: 'HZ.png' }, haha: { file: 'HZ.png' },
  smokkky: { file: 'smokky.png' }, smokky: { file: 'smokky.png' },
  '4ever': { file: '4ever.png' }, glong: { file: 'glong.png' },
  '0z': { file: '0z.png' }, drace: { file: 'drace.png' }, doomer: { file: 'doomer.png' },
};

const calcAge = (b) => {
  if (!b) return null;
  const d = new Date(b); if (isNaN(d)) return null;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() - d.getMonth() < 0 || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
};
const ageStr = (p) => { const a = calcAge(p.birth_date); return a != null ? `${a} 岁` : '—'; };

const ROLE_EN = (p) => {
  const r = String(p?.in_game_role || p?.role || '');
  if (r.includes('IGL') || r.includes('指挥')) return 'IGL';
  if (r.includes('狙')) return 'AWPER';
  if (r.includes('自由')) return 'LURKER';
  if (r.includes('步枪')) return 'RIFLER';
  return 'PLAYER';
};
const isImport = (p) => String(p?.role || '').includes('外援') || String(p?.in_game_role || '').includes('外援');
const isTrial = (p) => String(p?.role || '').includes('试训') || String(p?.in_game_role || '').includes('试训') || String(p?.roster_status || '') === 'trial';

// 照片解析：{src, kind:'cover'|'contain'|'logo'}
function resolvePhoto(p) {
  if (p.avatar_url) return { src: p.avatar_url, kind: 'cover' };
  const m = PHOTO_MAP[String(p.nickname || '').toLowerCase()];
  if (m) return { src: `${ASSET}/${m.file}`, kind: m.fit === 'contain' ? 'contain' : 'cover' };
  return { src: pickLogo(p.nickname), kind: 'logo' };
}

// 国旗小片（默认中国；蒙古国用于外援）
function Flag({ nat, w = 21, h = 14 }) {
  if (nat === '蒙古国' || nat === 'MN') {
    return (
      <span style={{ display: 'inline-flex', width: 15, height: 10, borderRadius: 2, overflow: 'hidden', flex: 'none' }}>
        <span style={{ flex: 1, background: '#c4272e' }} /><span style={{ flex: 1, background: '#015197' }} /><span style={{ flex: 1, background: '#c4272e' }} />
      </span>
    );
  }
  // 中国
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: w, height: h, borderRadius: 2, background: '#de2910', flex: 'none', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.4)' }}>
      <span style={{ position: 'absolute', left: 2, top: 2, color: '#ffde00', fontSize: 8, lineHeight: 1 }}>★</span>
      <span style={{ position: 'absolute', left: 7.5, top: 1, color: '#ffde00', fontSize: 3.5, lineHeight: 1 }}>★</span>
      <span style={{ position: 'absolute', left: 9, top: 3.5, color: '#ffde00', fontSize: 3.5, lineHeight: 1 }}>★</span>
      <span style={{ position: 'absolute', left: 8.5, top: 6.5, color: '#ffde00', fontSize: 3.5, lineHeight: 1 }}>★</span>
      <span style={{ position: 'absolute', left: 6.5, top: 8.5, color: '#ffde00', fontSize: 3.5, lineHeight: 1 }}>★</span>
    </span>
  );
}

// ── 卡内照片渲染（cover 铺满 / contain 居中 / logo 圆形）──
function CardMedia({ ph, bottom = 88 }) {
  if (ph.kind === 'cover') return <img src={ph.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', filter: 'contrast(1.05)' }} />;
  if (ph.kind === 'contain') return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={ph.src} alt="" style={{ maxWidth: '78%', maxHeight: '88%', objectFit: 'contain', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.5))' }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={ph.src} alt="" style={{ width: 128, height: 128, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 6px 22px rgba(0,0,0,.55)' }} />
    </div>
  );
}

/* ════════════ 离队甘特时间线 ════════════ */
function parseYM(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[-/年.](\d{1,2})/);
  if (!m) return null;
  return { y: +m[1], m: +m[2] };
}
function DepartureTimeline({ departed, onOpen }) {
  const tipRef = useRef(null);
  useEffect(() => {
    const tip = document.createElement('div');
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;opacity:0;transition:opacity .1s ease;padding:8px 12px;border-radius:9px;background:rgba(9,15,40,.97);border:1px solid rgba(90,130,255,.4);box-shadow:0 10px 26px rgba(0,0,0,.55);white-space:nowrap;font-family:inherit';
    document.body.appendChild(tip);
    tipRef.current = tip;
    const onMove = (e) => {
      const row = e.target.closest && e.target.closest('[data-tip-name]');
      if (!row) { tip.style.opacity = '0'; return; }
      tip.innerHTML =
        '<div style="font-size:13px;font-weight:800;color:#eef2ff">' + row.dataset.tipName +
        '<span style="font-size:10px;font-weight:700;letter-spacing:1px;color:#7dd3fc;margin-left:8px">' + row.dataset.tipRole + '</span></div>' +
        '<div style="font-size:11.5px;color:#9db0dd;margin-top:3px">' + row.dataset.tipMeta + '</div>' +
        '<div style="font-size:11px;color:#6f83b3;margin-top:2px">在队 ' + row.dataset.tipTenure + '</div>';
      tip.style.opacity = '1';
      let x = e.clientX + 14, y = e.clientY + 16;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    document.addEventListener('mousemove', onMove, true);
    return () => { document.removeEventListener('mousemove', onMove, true); tip.remove(); };
  }, []);

  // 组装每人区间；筛掉无法解析日期的
  const rows = departed.map((p) => {
    const A = parseYM(p.join_date), B = parseYM(p.leave_date);
    return { p, A, B };
  }).filter((r) => r.B);   // 只要有离队日期即上时间线；入队日期缺失则画离队标记点
  if (rows.length === 0) {
    return <div style={{ marginTop: 14, padding: '18px 0', textAlign: 'center', fontSize: 13, color: '#7288bd' }}>暂无可展示的离队数据（需离队日期）</div>;
  }

  const idx = (o) => o.y * 12 + (o.m - 1);
  const allIdx = rows.flatMap((r) => (r.A ? [idx(r.A), idx(r.B)] : [idx(r.B)]));
  // 动态区间：从最早在队月的前一个月，到最晚离队月的后一个月（不再从固定 2024-01 起）
  const lo = Math.min(...allIdx), hi = Math.max(...allIdx);
  const START = lo - 1, END = hi + 1;
  const TOTAL = Math.max(END - START, 1);
  const pct = (i) => ((i - START) / TOTAL) * 100;

  // 排序：离队时间降序
  const sorted = [...rows].sort((a, b) => idx(b.B) - idx(a.B));

  // 轴刻度 + 年度分隔线：区间内每季度(1/4/7/10月)刻度，1 月显示年份胶囊并画分隔线
  const ticks = [];
  const yearLines = [];
  for (let i = START; i <= END; i++) {
    const y = Math.floor(i / 12), m = (i % 12) + 1;
    if (m === 1 && i !== START) yearLines.push(pct(i));
    if (m === 1 || m === 4 || m === 7 || m === 10) {
      const isYear = m === 1;
      const label = isYear ? String(y) : ({ 4: 'Apr', 7: 'Jul', 10: 'Oct' })[m];
      ticks.push({ label, isYear, l: pct(i) });
    }
  }

  return (
    <div style={{ marginTop: 14, background: 'rgba(8,14,38,.5)', border: '1px solid rgba(90,130,255,.18)', borderRadius: 12, padding: '14px 18px 16px' }}>
      {/* 轴表头 */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: 150, flex: 'none' }} />
        <div style={{ position: 'relative', flex: 1, height: 24 }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ position: 'absolute', top: 0, left: `${t.l}%`, transform: 'translateX(-50%)' }}>
              {t.isYear
                ? <span style={{ display: 'inline-flex', padding: '2px 9px', border: '1px solid rgba(120,150,220,.35)', borderRadius: 5, fontSize: 12, fontWeight: 700, color: '#c7d4f5' }}>{t.label}</span>
                : <span style={{ fontSize: 11.5, color: '#6f83b3' }}>{t.label}</span>}
            </div>
          ))}
        </div>
      </div>
      {/* 轴主体 */}
      <div style={{ position: 'relative', marginTop: 4 }}>
        <div style={{ position: 'absolute', left: 150, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}>
          {yearLines.map((l, i) => (
            <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(120,150,220,.28)', left: `${l}%` }} />
          ))}
        </div>
        {sorted.map(({ p, A, B }) => {
          const bL = pct(idx(B));
          const meta = `${p.in_game_role || p.role || '—'} · ${ageStr(p)}`;
          const tenure = A
            ? `${A.y}/${String(A.m).padStart(2, '0')} – ${B.y}/${String(B.m).padStart(2, '0')}`
            : `? – ${B.y}/${String(B.m).padStart(2, '0')}（入队未记录）`;
          return (
            <div key={p.id} data-tip-name={p.nickname} data-tip-role={ROLE_EN(p)} data-tip-meta={meta} data-tip-tenure={tenure}
              className="rv4-tl-row" onClick={() => onOpen(p)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 27, cursor: 'pointer', borderRadius: 6 }}>
              <div style={{ width: 150, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                <Flag nat={p.nationality} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#c7d4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname}</span>
              </div>
              <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                {A ? (
                  <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: 9, borderRadius: 5, left: `${pct(idx(A)).toFixed(2)}%`, width: `${Math.max(bL - pct(idx(A)), 1.6).toFixed(2)}%`, background: 'linear-gradient(90deg,rgba(59,130,246,.9),rgba(56,189,248,.85))', boxShadow: '0 2px 8px rgba(56,189,248,.25)' }} />
                ) : (
                  <div title="仅记录离队时间（入队日期未录）" style={{ position: 'absolute', top: '50%', left: `${bL.toFixed(2)}%`, transform: 'translate(-50%,-50%) rotate(45deg)', width: 9, height: 9, borderRadius: 2, background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', boxShadow: '0 2px 8px rgba(251,191,36,.35)' }} />
                )}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, paddingLeft: 150, fontSize: 11, color: '#7288bd' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 6, borderRadius: 3, background: 'linear-gradient(90deg,rgba(59,130,246,.9),rgba(56,189,248,.85))' }} />在队周期（有入队+离队日期）</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, transform: 'rotate(45deg)', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }} />仅离队时间（入队未记录）</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════ 主组件 ════════════ */
export default function Members() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('roster');       // roster | archive
  const [selId, setSelId] = useState(null);
  const [editPlayer, setEditPlayer] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState(null);       // 档案：选中队员详情（GET /players/:id），供赛训数据速览

  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canEdit = ['admin', 'coach', 'team_lead'].includes(user.role);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/players').then(({ data }) => setPlayers(Array.isArray(data) ? data : [])).catch(() => setPlayers([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const staffRank = (p) => { const r = String(p.in_game_role || p.role || '').toLowerCase(); return r.includes('总监') ? 0 : r.includes('教练') ? 1 : r.includes('领队') ? 2 : 9; };
  const staffTag = (p) => { const r = String(p.in_game_role || p.role || ''); return r.includes('总监') ? 'DIRECTOR' : r.includes('教练') ? 'COACH' : r.includes('领队') ? 'LEADER' : 'STAFF'; };

  const staff = players.filter((p) => p.team_type === 'staff').sort((a, b) => staffRank(a) - staffRank(b));
  const rosterAll = players.filter((p) => p.team_type === 'roster');
  const startersBench = rosterAll.filter((p) => !p.roster_status || p.roster_status === 'starter' || p.roster_status === 'bench');
  // 服役区固定最多 5：外援/试训优先保留，其余按顺序填满
  const specialCount = startersBench.filter((p) => isImport(p) || isTrial(p)).length;
  const ntQuota = Math.max(0, 5 - specialCount);
  // 服役区固定最多 5：外援/试训必留，其余按名单顺序补满，保持原顺序
  let ntSeen = 0;
  const servingShown = startersBench.filter((p) => {
    if (isImport(p) || isTrial(p)) return true;
    ntSeen += 1; return ntSeen <= ntQuota;
  }).slice(0, 5);
  const vacancy = Math.max(0, 5 - servingShown.length);

  const benched = rosterAll.filter((p) => p.roster_status === 'demoted');
  const former = players.filter((p) => p.team_type === 'former');

  const sel = players.find((p) => p.id === selId) || players[0] || null;
  const openProfile = (p) => { setSelId(p.id); setTab('archive'); };

  // 档案页：拉取选中队员详情（含官方赛/训练赛记录）供「赛训数据速览」
  useEffect(() => {
    if (tab !== 'archive' || !sel) return;
    let alive = true;
    setDetail(null);
    api.get(`/players/${sel.id}`).then(({ data }) => { if (alive) setDetail(data); }).catch(() => { if (alive) setDetail(null); });
    return () => { alive = false; };
  }, [tab, sel && sel.id]); // eslint-disable-line

  const uploadContract = (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file || !sel) return;
    const fd = new FormData(); fd.append('file', file); setUploading(true);
    api.post(`/players/${sel.id}/contract`, fd).then(() => load()).catch((err) => alert('合同上传失败：' + (err.response?.data?.error || err.message))).finally(() => setUploading(false));
  };

  if (loading) return <div style={rootStyle}><div style={{ padding: '90px 0', textAlign: 'center', color: '#8fa5d8', fontSize: 15 }}>名单加载中…</div></div>;

  return (
    <div style={rootStyle}>
      {/* 页头 + 标签 + 新增 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '26px 28px 0' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#5f74b3', fontWeight: 700 }}>UR ESPORTS · CS2 DIVISION</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>赛训团队</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {[['roster', '队员阵容'], ['archive', '队员档案']].map(([k, label], i) => {
            const on = tab === k;
            return (
              <span key={k} onClick={() => { if (k === 'archive' && !selId && players[0]) setSelId(players[0].id); setTab(k); }}
                style={{ padding: '9px 26px', fontSize: 14, cursor: 'pointer', borderRadius: 10, marginLeft: i ? 0 : 0, ...(on
                  ? { background: 'linear-gradient(90deg,#3b82f6,#22d3ee)', color: '#04122c', fontWeight: 800, boxShadow: '0 0 18px rgba(59,130,246,.4)' }
                  : { background: 'rgba(18,28,72,.6)', border: '1px solid rgba(90,130,255,.25)', color: '#9db0dd', fontWeight: 600 }) }}>
                {label}
              </span>
            );
          })}
          {canEdit && <span onClick={() => setShowCreate(true)} style={{ padding: '9px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', borderRadius: 10, color: '#04122c', background: 'linear-gradient(90deg,#fbbf24,#ffd76a)' }}>+ 新增选手</span>}
        </div>
      </div>

      {tab === 'roster' && (
        <>
          {/* ── 第一排 赛训团队（居中）── */}
          <div style={{ padding: '22px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ width: 4, height: 18, borderRadius: 2, background: 'linear-gradient(180deg,#38bdf8,#7c3aed)' }} />
              <img src={`${ASSET}/icons/icon-hub.png`} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', mixBlendMode: 'screen' }} />
              <span style={{ fontSize: 18, fontWeight: 700 }}>赛训团队</span>
              <span style={{ fontSize: 13, color: '#7288bd' }}>{staff.length} 人</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
              {staff.map((p) => {
                const ph = resolvePhoto(p);
                return (
                  <div key={p.id} className="rv4-staff-card" onClick={() => openProfile(p)}
                    style={{ position: 'relative', width: 228, height: 288, overflow: 'hidden', background: 'linear-gradient(180deg,rgba(13,22,60,.85),rgba(8,13,38,.85))', cursor: 'pointer', border: '1px solid rgba(56,189,248,.35)', borderRadius: 14 }}>
                    <CardMedia ph={ph} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(3,6,15,.95) 88%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, pointerEvents: 'none' }}>
                      <div style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 6, background: 'rgba(5,10,29,.7)', border: '1px solid rgba(125,211,252,.5)', color: '#7dd3fc', fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, marginBottom: 7 }}>{staffTag(p)}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{p.nickname}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 11.5, color: '#9db0dd' }}><span style={{ color: '#7dd3fc', fontWeight: 700 }}>{p.in_game_role || p.role || '—'}</span><span>{ageStr(p)}{p.real_name ? ` · ${p.real_name}` : ''}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 第二排 服役队员（居中，最多5）── */}
          <div style={{ padding: '26px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 4, height: 18, borderRadius: 2, background: 'linear-gradient(180deg,#a855f7,#22d3ee)' }} />
              <img src={`${ASSET}/icons/icon-versus.png`} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', mixBlendMode: 'screen' }} />
              <span style={{ fontSize: 18, fontWeight: 700 }}>服役队员</span>
              <span style={{ fontSize: 13, color: '#7288bd' }}>{servingShown.length} / 5 人{vacancy > 0 ? ` · ${vacancy} 席空缺` : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
              {servingShown.map((p, i) => {
                const no = String(i + 1).padStart(2, '0');
                if (isImport(p)) {
                  const ph = resolvePhoto(p);
                  return (
                    <div key={p.id} className="rv4-gold-card" onClick={() => openProfile(p)}
                      style={{ position: 'relative', width: 228, height: 288, overflow: 'hidden', cursor: 'pointer', borderRadius: 14, background: 'linear-gradient(165deg,#3a2708 0%,#241804 55%,#160f02 100%)', border: '1px solid rgba(251,191,36,.7)', boxShadow: '0 0 0 1px rgba(251,191,36,.22),0 14px 34px rgba(251,146,60,.28)' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(140px 130px at 50% 36%,rgba(251,191,36,.4),transparent 70%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: 15, left: -36, transform: 'rotate(-45deg)', background: 'linear-gradient(90deg,#f59e0b,#fbbf24)', color: '#1c1403', fontSize: 10, fontWeight: 900, letterSpacing: 3, padding: '4px 42px', boxShadow: '0 4px 12px rgba(0,0,0,.45)', pointerEvents: 'none' }}>外援</div>
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={ph.src} alt="" style={{ width: 132, height: 132, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 34px rgba(251,191,36,.5)', border: '2px solid rgba(251,191,36,.65)' }} />
                      </div>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 46%,rgba(18,11,2,.96) 88%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 13, fontWeight: 800, letterSpacing: 1, color: 'rgba(251,191,36,.5)', pointerEvents: 'none' }}>{no}</div>
                      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 6, background: 'rgba(251,191,36,.16)', border: '1px solid rgba(251,191,36,.6)', color: '#fcd34d', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5 }}>★ {ROLE_EN(p)}</div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: 'rgba(5,10,29,.55)', border: '1px solid rgba(251,191,36,.4)' }}>
                            <Flag nat={p.nationality || '蒙古国'} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#fcd34d' }}>{p.nationality || '蒙古国'}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: '#fff' }}>{p.nickname}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 11.5, color: '#e7cfa0' }}><span style={{ color: '#fcd34d', fontWeight: 700 }}>{p.in_game_role || '—'}</span><span>{ageStr(p)}{p.real_name ? ` · ${p.real_name}` : ''}</span></div>
                      </div>
                    </div>
                  );
                }
                if (isTrial(p)) {
                  const ph = resolvePhoto(p);
                  return (
                    <div key={p.id} className="rv4-trial-card" onClick={() => openProfile(p)}
                      style={{ position: 'relative', width: 228, height: 288, overflow: 'hidden', cursor: 'pointer', borderRadius: 14, background: 'linear-gradient(165deg,#082c38 0%,#04202c 55%,#02141c 100%)', border: '1px solid rgba(34,211,238,.7)', boxShadow: '0 0 0 1px rgba(34,211,238,.22),0 14px 34px rgba(34,211,238,.26)' }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(140px 130px at 50% 36%,rgba(34,211,238,.38),transparent 70%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: 15, left: -36, transform: 'rotate(-45deg)', background: 'linear-gradient(90deg,#0891b2,#22d3ee)', color: '#03181f', fontSize: 10, fontWeight: 900, letterSpacing: 3, padding: '4px 42px', boxShadow: '0 4px 12px rgba(0,0,0,.45)', pointerEvents: 'none' }}>试训</div>
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={ph.src} alt="" style={{ width: 132, height: 132, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 34px rgba(34,211,238,.5)', border: '2px solid rgba(34,211,238,.65)' }} />
                      </div>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 46%,rgba(2,16,22,.96) 88%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 13, fontWeight: 800, letterSpacing: 1, color: 'rgba(34,211,238,.5)', pointerEvents: 'none' }}>{no}</div>
                      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, pointerEvents: 'none' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 6, background: 'rgba(34,211,238,.16)', border: '1px solid rgba(34,211,238,.6)', color: '#67e8f9', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, marginBottom: 7 }}>★ {ROLE_EN(p)}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: '#fff' }}>{p.nickname}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 11.5, color: '#a5d8e2' }}><span style={{ color: '#67e8f9', fontWeight: 700 }}>{p.in_game_role || '—'}</span><span>{ageStr(p)}{p.real_name ? ` · ${p.real_name}` : ''}</span></div>
                      </div>
                    </div>
                  );
                }
                // 常规服役卡（紫）
                const ph = resolvePhoto(p);
                return (
                  <div key={p.id} className="rv4-active-card" onClick={() => openProfile(p)}
                    style={{ position: 'relative', width: 228, height: 288, overflow: 'hidden', background: 'linear-gradient(180deg,rgba(13,22,60,.85),rgba(8,13,38,.85))', cursor: 'pointer', border: '1px solid rgba(168,85,247,.35)', borderRadius: 14 }}>
                    <CardMedia ph={ph} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(3,6,15,.95) 88%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 13, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,.3)', pointerEvents: 'none' }}>{no}</div>
                    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, pointerEvents: 'none' }}>
                      <div style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 6, background: 'rgba(5,10,29,.7)', border: '1px solid #22d3ee', color: '#22d3ee', fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, marginBottom: 7 }}>{ROLE_EN(p)}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{p.nickname}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 11.5, color: '#9db0dd' }}><span style={{ color: '#d8b4fe', fontWeight: 700 }}>{p.in_game_role || '—'}</span><span>{ageStr(p)}{p.real_name ? ` · ${p.real_name}` : ''}</span></div>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: vacancy }).map((_, i) => (
                <div key={'v' + i} style={{ position: 'relative', width: 228, height: 288, border: '1px dashed rgba(125,211,252,.45)', borderRadius: 14, background: 'rgba(10,18,50,.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <img src={`${ASSET}/HZ.png`} alt="" style={{ width: 78, height: 78, objectFit: 'cover', objectPosition: 'top', borderRadius: '50%', opacity: .45, filter: 'grayscale(50%)' }} />
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#7dd3fc' }}>空缺 · {vacancy} 席</div>
                  <div style={{ fontSize: 12, color: '#8fa5d8', textAlign: 'center', lineHeight: 1.6 }}>第五人待定<br />暂由主教练 <b style={{ color: '#eef2ff' }}>HZ</b> 顶上</div>
                  <div style={{ padding: '3px 12px', border: '1px solid rgba(125,211,252,.4)', borderRadius: 999, color: '#7dd3fc', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>STAND-IN</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 第三排 历史队员（下放 + 离队时间线）── */}
          <div style={{ margin: '24px 28px 28px', background: 'linear-gradient(180deg,rgba(13,22,60,.85),rgba(8,13,38,.85))', border: '1px solid rgba(80,120,255,.30)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 4, height: 16, borderRadius: 2, background: 'linear-gradient(180deg,#fbbf24,#f97316)' }} />
              <img src={`${ASSET}/icons/icon-schedule.png`} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover', mixBlendMode: 'screen' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#ffd76a' }}>历史队员 · 下放</span>
              <span style={{ fontSize: 12, color: '#7288bd' }}>{benched.length} 人 · 不活跃</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(255,214,106,.18)' }} />
            </div>
            {benched.length > 0 ? (
              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                {benched.map((p) => {
                  const ph = resolvePhoto(p);
                  return (
                    <div key={p.id} className="rv4-benched-card" onClick={() => openProfile(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(12,20,56,.6)', borderRadius: 12, padding: '8px 18px 8px 8px', cursor: 'pointer', border: '1px solid rgba(90,130,255,.18)' }}>
                      <img src={ph.src} alt="" style={{ width: 46, height: 46, objectFit: ph.kind === 'logo' ? 'contain' : 'cover', objectPosition: 'top', filter: 'saturate(.4)', borderRadius: 8 }} />
                      <div><div style={{ fontSize: 15, fontWeight: 800 }}>{p.nickname}</div><div style={{ fontSize: 11, color: '#8fa5d8', marginTop: 2 }}>{p.in_game_role || p.role || '—'} · {ageStr(p)}{p.real_name ? ` · ${p.real_name}` : ''}</div></div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ marginTop: 12, fontSize: 12, color: '#7288bd' }}>暂无下放队员</div>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              <span style={{ width: 4, height: 16, borderRadius: 2, background: 'linear-gradient(180deg,#64748b,#334155)' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#aebbe4' }}>离队时间线</span>
              <span style={{ fontSize: 12, color: '#7288bd' }}>Roster Timeline · 历任成员在队周期</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(100,116,139,.22)' }} />
            </div>
            <DepartureTimeline departed={former} onOpen={openProfile} />
          </div>
        </>
      )}

      {tab === 'archive' && sel && (
        <div style={{ padding: '26px 28px 34px', flex: 1 }}>
          <ProfileArchive sel={sel} detail={detail} canEdit={canEdit} uploading={uploading} onEdit={() => setEditPlayer(sel)} onContract={uploadContract} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {[...staff, ...servingShown, ...benched, ...former].map((p) => {
              const on = p.id === sel.id;
              return (
                <span key={p.id} onClick={() => setSelId(p.id)}
                  style={{ padding: '6px 18px', fontSize: 13, cursor: 'pointer', borderRadius: 999, ...(on
                    ? { background: 'linear-gradient(90deg,#3b82f6,#22d3ee)', color: '#04122c', fontWeight: 800 }
                    : { border: '1px solid rgba(100,116,139,.4)', color: '#aebbe4' }) }}>{p.nickname}</span>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && <CreatePlayerModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); load(); if (id) { setSelId(id); setTab('archive'); } }} />}
      {editPlayer && <PlayerEditModal player={editPlayer} onClose={() => setEditPlayer(null)} onSaved={() => { setEditPlayer(null); load(); }} />}
    </div>
  );
}

const rootStyle = {
  maxWidth: 1492, margin: '0 auto', minHeight: '60vh',
  background: 'transparent',
  color: '#eef2ff',
  fontFamily: "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif",
};

/* ════════════ 档案 hero ════════════ */
/* ════════════ 队员档案 v5（design 高保真：左大头像卡 + 右五分区 + 数据速览） ════════════ */
function ProfileArchive({ sel, detail, canEdit, uploading, onEdit, onContract }) {
  const ph = resolvePhoto(sel);
  const imp = isImport(sel), tri = isTrial(sel);
  const demoted = sel.roster_status === 'demoted';
  const grp = sel.team_type === 'staff' ? 'staff' : sel.team_type === 'former' ? 'former' : demoted ? 'benched' : 'roster';

  // 状态（左上徽章）
  const statusLabel = grp === 'staff' ? '在职' : grp === 'former' ? '已离队' : demoted ? '下放 · 不活跃' : tri ? '试训中 · 考察' : '现役 · 一队';
  const statusColor = grp === 'staff' ? '#7dd3fc' : grp === 'former' ? '#8fa5d8' : demoted ? '#ffd76a' : tri ? '#67e8f9' : '#d8b4fe';
  // 类型（右上徽章）
  const typeLabel = grp === 'staff' ? '赛训团队' : grp === 'former' ? '离队选手' : imp ? '外援' : tri ? '试训队员' : '职业选手';
  const typeColor = grp === 'staff' ? '#7dd3fc' : grp === 'former' ? '#8fa5d8' : imp ? '#fcd34d' : tri ? '#67e8f9' : '#d8b4fe';

  const nat = sel.nationality || (imp ? '蒙古国' : '中国');
  const roleCn = sel.in_game_role || sel.role || '—';
  const hltvHref = sel.hltv_url ? (String(sel.hltv_url).startsWith('http') ? sel.hltv_url : `https://${sel.hltv_url}`) : null;

  const card = { background: 'linear-gradient(180deg,rgba(13,22,60,.85),rgba(8,13,38,.85))', border: '1px solid rgba(80,120,255,.28)', borderRadius: 14, padding: '18px 22px' };
  const Bar = ({ g }) => <span style={{ width: 4, height: 16, borderRadius: 2, background: g, flex: 'none' }} />;
  const secHead = (g, title, sub) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <Bar g={g} /><span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: '#6f83b3', letterSpacing: 1 }}>{sub}</span>}
    </div>
  );

  // 基础资料 8 格
  const inService = !sel.leave_date;
  const statusCellKey = inService ? '在队状态' : '离队日期';
  const statusCellVal = inService ? (sel.status === 'inactive' ? '不活跃' : sel.status === 'left' ? '已离队' : '现役') : sel.leave_date;
  const statusCellColor = inService ? '#34d399' : '#f87171';
  const cells = [
    ['STEAM ID', sel.steam_id || '—', null, null],
    ['出生日期', sel.birth_date || '—', null, null],
    ['年龄', ageStr(sel), null, null],
    ['国籍', nat, '#eef2ff', 'flag'],
    ['入队日期', sel.join_date || '—', null, null],
    [statusCellKey, statusCellVal || '—', statusCellColor, null],
    ['类型', typeLabel, typeColor, null],
    ['场上位置', roleCn, '#7dd3fc', null],
  ];

  const tenureLabel = sel.leave_date ? '已结束' : '在队中';
  const contractName = sel.contract_url ? (decodeURIComponent(String(sel.contract_url).split('/').pop()) || `UR-合同-${sel.id}.pdf`) : '未上传';

  // 赛训数据速览（近30天）：GET /players/:id 的 official_matches / recent_scrims
  const stats = (() => {
    if (!detail) return { loading: true };
    const off = Array.isArray(detail.official_matches) ? detail.official_matches : [];
    const cut = new Date(); cut.setDate(cut.getDate() - 30);
    const base = off.filter((m) => { const d = new Date(m.match_date); return !isNaN(d) && d >= cut; });
    if (!base.length) return { empty: true };
    const avg = (k) => { const v = base.map((m) => Number(m[k])).filter((n) => !isNaN(n)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const scr = Array.isArray(detail.recent_scrims) ? detail.recent_scrims.length : 0;
    return { rating: avg('rating'), adr: avg('adr'), scrim: scr };
  })();
  const ratingColor = (r) => r == null ? '#eef2ff' : r >= 1.1 ? '#34d399' : r >= 1.0 ? '#22d3ee' : '#f87171';
  const StatCard = ({ v, k, color }) => (
    <div style={{ background: 'rgba(8,14,38,.55)', border: '1px solid rgba(90,130,255,.18)', borderRadius: 11, padding: '14px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: color || '#eef2ff' }}>{v}</div>
      <div style={{ fontSize: 11, color: '#8fa5d8', marginTop: 4 }}>{k}</div>
    </div>
  );
  const subBtn = { flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, background: 'rgba(12,20,54,.7)', border: '1px solid rgba(90,130,255,.28)', color: '#c7d4f5', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
      {/* ══ 左：大头像卡 ══ */}
      <div style={{ width: 372, flex: 'none', overflow: 'hidden', background: 'linear-gradient(180deg,rgba(13,22,60,.9),rgba(8,13,38,.92))', border: '1px solid rgba(80,120,255,.32)', borderRadius: 16 }}>
        <div style={{ position: 'relative', height: 400, background: 'radial-gradient(320px 260px at 50% 30%,rgba(37,60,180,.4),transparent 72%),linear-gradient(180deg,rgba(10,16,44,.6),rgba(6,10,30,.9))' }}>
          {ph.kind === 'logo'
            ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={ph.src} alt="" style={{ width: 186, height: 186, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(90,130,255,.3)' }} /></div>
            : <img src={ph.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: ph.kind === 'contain' ? 'contain' : 'cover', objectPosition: 'top', filter: 'contrast(1.05)' }} />}
          <div style={{ position: 'absolute', top: 14, left: 14, padding: '3px 12px', fontSize: 12, fontWeight: 700, border: `1px solid ${statusColor}`, color: statusColor, background: 'rgba(5,10,29,.55)', clipPath: 'polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)' }}>{statusLabel}</div>
          <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 11px', borderRadius: 8, background: 'rgba(5,10,29,.72)', border: `1px solid ${typeColor}`, color: typeColor, fontSize: 11, fontWeight: 700, letterSpacing: 1, backdropFilter: 'blur(4px)' }}>{typeLabel}</div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 52%,rgba(4,7,20,.96) 90%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 16 }}>
            <div style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 6, border: '1px solid rgba(125,211,252,.5)', color: '#7dd3fc', fontSize: 10.5, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>{ROLE_EN(sel)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{sel.nickname}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: 'rgba(5,10,29,.55)', border: '1px solid rgba(90,130,255,.3)' }}><Flag nat={nat} /><span style={{ fontSize: 11, fontWeight: 700, color: '#c7d4f5' }}>{nat}</span></span>
            </div>
            <div style={{ fontSize: 14, color: '#9db0dd', marginTop: 6 }}>{roleCn} · {ageStr(sel)}{sel.real_name ? ` · ${sel.real_name}` : ''}</div>
          </div>
        </div>
        <div style={{ padding: '16px 18px 18px' }}>
          {canEdit && (
            <div className="rv5-edit-btn" onClick={onEdit} style={{ height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(90deg,#3b82f6,#22d3ee)', color: '#04122c', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(59,130,246,.35)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#04122c" strokeWidth="2.2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              编辑档案
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: canEdit ? 11 : 0 }}>
            {hltvHref
              ? <a href={hltvHref} target="_blank" rel="noreferrer" className="rv5-sub-btn" style={subBtn}><span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>HLTV</span><span>主页 ↗</span></a>
              : <div className="rv5-sub-btn" style={{ ...subBtn, cursor: 'default' }}><span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>HLTV</span><span style={{ color: '#6f83b3' }}>未登记</span></div>}
            <div className="rv5-sub-btn" title="Steam" style={{ width: 44, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'rgba(12,20,54,.7)', border: '1px solid rgba(90,130,255,.28)', cursor: 'default' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#9db0dd"><path d="M12 2a10 10 0 0 0-9.9 8.6l5.3 2.2a2.8 2.8 0 0 1 1.6-.5l2.4-3.5v-.05a3.75 3.75 0 1 1 3.75 3.75h-.08l-3.45 2.46a2.8 2.8 0 0 1-5.56.5L2 17.6A10 10 0 1 0 12 2Zm-3.4 15.2 1.2.5a2.1 2.1 0 1 0 .8-4l-1.28-.53a2.8 2.8 0 0 1-.72 4.03Zm7.15-6.7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* ══ 右：信息分区 ══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={card}>
          {secHead('linear-gradient(180deg,#38bdf8,#7c3aed)', '基础资料', 'PROFILE')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px 20px' }}>
            {cells.map(([k, v, color, flag]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: '#5b6a8c', letterSpacing: 1.5 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: color || '#eef2ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {flag === 'flag' ? <Flag nat={v} /> : null}{v}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          {secHead('linear-gradient(180deg,#a855f7,#ec4899)', '场上角色 & 定位')}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.35)' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: '#7dd3fc' }}>{ROLE_EN(sel)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c7d4f5' }}>{roleCn}</span>
          </div>
          <div style={{ fontSize: 13.5, color: '#c7d4f5', lineHeight: 1.75, marginTop: 12 }}>{sel.bio || '暂无简介，可在编辑档案中补充。'}</div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ ...card, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Bar g="linear-gradient(180deg,#38bdf8,#7c3aed)" /><span style={{ fontSize: 15, fontWeight: 700 }}>在队生涯</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#7dd3fc' }}>{tenureLabel}</span>
            </div>
            <div style={{ position: 'relative', margin: '18px 8px 4px' }}>
              <div style={{ position: 'absolute', left: 7, right: 7, top: 6, height: 3, borderRadius: 2, background: 'linear-gradient(90deg,#3b82f6,#22d3ee)' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
                {[['入队', sel.join_date || '—', '#38bdf8'], [sel.leave_date ? '离队' : '状态', sel.leave_date || (sel.status === 'active' ? '现役' : '在役'), sel.leave_date ? '#f87171' : '#34d399']].map(([lb, dt, c], i) => (
                  <div key={i} style={{ textAlign: i ? 'right' : 'left' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}`, marginBottom: 8, marginLeft: i ? 'auto' : 0 }} />
                    <div style={{ fontSize: 11, color: '#8fa5d8' }}>{lb}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#c7d4f5', marginTop: 2 }}>{dt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ ...card, width: 300, flex: 'none' }}>
            {secHead('linear-gradient(180deg,#fbbf24,#f97316)', '合同文件')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, border: '1px dashed rgba(251,191,36,.4)', background: 'rgba(251,191,36,.05)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="1.8" style={{ flex: 'none' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                {sel.contract_url
                  ? <a href={sel.contract_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#fcd34d', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contractName} ↗</a>
                  : <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8fa5d8' }}>未上传</div>}
                <div style={{ fontSize: 10.5, color: '#6f83b3', marginTop: 2 }}>PDF · 仅管理员可见</div>
              </div>
              {canEdit && (
                <label style={{ fontSize: 11.5, fontWeight: 800, color: '#1c1403', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', borderRadius: 8, padding: '6px 12px', cursor: uploading ? 'wait' : 'pointer', flex: 'none' }}>
                  {uploading ? '…' : '上传'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={onContract} disabled={uploading} />
                </label>
              )}
            </div>
          </div>
        </div>

        <div style={card}>
          {secHead('linear-gradient(180deg,#34d399,#22d3ee)', '赛训数据速览', '近 30 天')}
          {stats.loading ? (
            <div style={{ fontSize: 13, color: '#6f83b3', padding: '6px 0' }}>数据加载中…</div>
          ) : stats.empty ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6f83b3', padding: '4px 0' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6f83b3" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 12v4" /></svg>
              暂无该成员近 30 天的赛训数据记录
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
              <StatCard v={stats.rating != null ? stats.rating.toFixed(2) : '—'} k="Rating 2.1" color={ratingColor(stats.rating)} />
              <StatCard v={stats.adr != null ? Math.round(stats.adr) : '—'} k="ADR" color="#eef2ff" />
              <StatCard v="—" k="KAST" color="#d8b4fe" />
              <StatCard v={stats.scrim} k="训练场次" color="#fcd34d" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════ 新增选手弹窗（保留 r58 功能） ════════════ */
function CreatePlayerModal({ onClose, onCreated }) {
  const [f, setF] = useState({ nickname: '', real_name: '', steam_id: '', game_steam_id: '', role: '选手', in_game_role: '', join_date: '', team_type: 'roster', bio: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = () => {
    if (!f.nickname.trim()) { setErr('昵称必填'); return; }
    setSaving(true); setErr(null);
    api.post('/players', { ...f, nickname: f.nickname.trim(), status: 'active' }).then(({ data }) => onCreated(data && data.id)).catch((e) => setErr(e.response?.data?.error || '创建失败')).finally(() => setSaving(false));
  };
  const inSt = { width: '100%', background: 'rgba(12,20,54,.9)', border: '1px solid rgba(90,130,255,.3)', borderRadius: 8, color: '#e9efff', fontSize: 13, padding: '9px 12px', outline: 'none' };
  const lb = { display: 'block', fontSize: 11, fontWeight: 700, color: '#7ea4ff', marginBottom: 4 };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,6,18,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '94vw', border: '1px solid rgba(90,130,255,.4)', borderRadius: 14, background: 'linear-gradient(180deg,rgba(13,22,60,.97),rgba(8,13,38,.97))', padding: '16px 18px', boxShadow: '0 0 40px rgba(40,70,200,.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginBottom: 12 }}><span>新增选手</span><span onClick={onClose} style={{ cursor: 'pointer', color: '#8fa5d8', padding: '2px 8px' }}>✕</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lb}>昵称 *</label><input style={inSt} value={f.nickname} onChange={set('nickname')} placeholder="游戏ID" /></div>
            <div><label style={lb}>真实姓名</label><input style={inSt} value={f.real_name} onChange={set('real_name')} placeholder="选填" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lb}>Steam ID</label><input style={inSt} value={f.steam_id} onChange={set('steam_id')} placeholder="7656…" /></div>
            <div><label style={lb}>游戏内 SteamID</label><input style={inSt} value={f.game_steam_id} onChange={set('game_steam_id')} placeholder="选填" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lb}>身份</label><select style={inSt} value={f.role} onChange={set('role')}><option value="选手">正式选手</option><option value="试训">试训</option><option value="外援">外援</option></select></div>
            <div><label style={lb}>位置</label><input style={inSt} value={f.in_game_role} onChange={set('in_game_role')} placeholder="步枪手 / 狙击手 / IGL" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lb}>入队日期</label><input type="date" style={inSt} value={f.join_date} onChange={set('join_date')} /></div>
            <div><label style={lb}>归属</label><select style={inSt} value={f.team_type} onChange={set('team_type')}><option value="roster">现役队员</option><option value="staff">赛训组</option></select></div>
          </div>
          <div><label style={lb}>简介</label><input style={inSt} value={f.bio} onChange={set('bio')} placeholder="选填" /></div>
          {err && <div style={{ fontSize: 12, color: '#f87171' }}>✗ {err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <span onClick={onClose} style={{ fontSize: 12, fontWeight: 700, color: '#9db0dd', border: '1px solid rgba(114,136,189,.4)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>取消</span>
            <span onClick={saving ? null : submit} style={{ fontSize: 12, fontWeight: 800, color: '#04122c', background: 'linear-gradient(90deg,#3b82f6,#22d3ee)', borderRadius: 8, padding: '8px 22px', cursor: 'pointer' }}>{saving ? '创建中…' : '创建并进入档案'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


