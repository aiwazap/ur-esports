import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './overview-v8.css';
import EventDetailModal from '../components/EventDetailModal';

/* ════════════════════════════════════════════════════════════════
   首页 r22 · 按 2026-07-05 最新 design 重建
   数据红线：页面只显示真实数据（/dashboard/overview + /training-plans/review-report）
   无任何示例队名/写死数值；无数据一律显示"暂无XX"
   ════════════════════════════════════════════════════════════════ */

// ─── 工具函数 ────────────────────────────────────────────────
const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toDateStr(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toDateStr(d); };

// 退役地图（与现有代码口径一致，勿改）
const HIDDEN_MAPS = ['Inferno', 'Train'];
const mapImg = (name) => {
  const k = String(name || '').toLowerCase();
  const ok = ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'];
  return ok.includes(k) ? `/reshape/home/maps/${k}.png` : null;
};

// 比分解析："13:16" / "13 - 16" → [13,16]；解析失败返回 null
const parseScore = (s) => {
  const m = String(s || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

// 队名首字母徽章的渐变（按首字符稳定取色，非随机）
const BADGE_GRADS = [
  'linear-gradient(135deg,#7c3aed,#3b82f6)', 'linear-gradient(135deg,#0ea5e9,#2563eb)',
  'linear-gradient(135deg,#f97316,#dc2626)', 'linear-gradient(135deg,#22d3ee,#3b82f6)',
  'linear-gradient(135deg,#10b981,#0ea5e9)', 'linear-gradient(135deg,#eab308,#f97316)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)', 'linear-gradient(135deg,#06b6d4,#3b82f6)',
];
const badgeGrad = (name) => BADGE_GRADS[(String(name || '?').charCodeAt(0) || 0) % BADGE_GRADS.length];

// 失误六大类固定配色（与 review-report by_type 类别一一对应）
const ERR_TYPES = [
  { key: '道具', color: '#7c3aed' },
  { key: '走位', color: '#3b82f6' },
  { key: '枪法', color: '#22d3ee' },
  { key: '沟通', color: '#a3e635' },
  { key: '战术', color: '#f59e0b' },
  { key: '经济', color: '#f472b6' },
];

// 赛事开始时间 → 展示文案 + 是否临近(24h内)
const upcomingTimeInfo = (dateStr, timeStr, now) => {
  if (!dateStr) return { label: '—', soon: false };
  const t = new Date(`${dateStr}T${timeStr || '00:00:00'}`);
  if (isNaN(t.getTime())) return { label: dateStr, soon: false };
  const diffMs = t - now;
  const hm = (timeStr || '').slice(0, 5);
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((new Date(`${dateStr}T00:00:00`) - d0) / 86400000);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  let label;
  if (dayDiff === 0) label = `今天 ${hm}`;
  else if (dayDiff === 1) label = `明天 ${hm}`;
  else if (dayDiff > 1 && dayDiff < 7) label = `${week[t.getDay()]} ${hm}`;
  else label = `${dateStr.slice(5)} ${hm}`;
  const soon = diffMs > 0 && diffMs <= 24 * 3600000;
  const soonLabel = soon ? (diffMs <= 3600000 ? '1小时内' : `${Math.ceil(diffMs / 3600000)}小时后`) : '';
  return { label, soon, soonLabel };
};

// ─── 通用小组件 ──────────────────────────────────────────────
function Empty({ text }) {
  return <div className="ov8-empty">{text}</div>;
}

function CardHead({ icon, title, badge, right }) {
  return (
    <div className="ov8-card-head">
      <div className="ov8-card-title">
        {icon}
        <span>{title}</span>
        {badge != null && <span className="ov8-badge">{badge}</span>}
      </div>
      {right && <div className="ov8-card-right">{right}</div>}
    </div>
  );
}

// 比赛记录行（训练赛/正赛通用）
function MatchRow({ opp, mapName, ours, theirs, dateLabel, won, eventChip, onClick }) {
  const draw = ours != null && theirs != null && String(ours) === String(theirs);
  return (
    <div className={'ov8-match-row ' + (won ? 'ov8-won' : draw ? 'ov8-draw' : 'ov8-lost')} onClick={onClick} title="点击查看比赛记录">
      <span className="ov8-team-badge" style={{ background: badgeGrad(opp) }}>{String(opp || '?')[0]}</span>
      <div className="ov8-match-name">
        <span className="ov8-match-opp">{opp}</span>
        {eventChip && <span className="ov8-event-chip">{eventChip}</span>}
      </div>
      <div className="ov8-match-map">
        {mapImg(mapName) && <img src={mapImg(mapName)} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
        <span>{mapName || '—'}</span>
      </div>
      <div className="ov8-match-score">
        <span className={'ov8-score-ours ' + (won ? 'ov8-score-win' : draw ? 'ov8-score-draw' : 'ov8-score-loss')}>{ours}</span>
        <span className="ov8-score-sep">:</span>
        <span className="ov8-score-their">{theirs}</span>
      </div>
      <div className="ov8-match-date">{dateLabel}</div>
    </div>
  );
}

// W/L 速览条
function DotsBar({ rows }) {
  if (!rows.length) return null;
  const isD = (r) => r.ours != null && r.theirs != null && String(r.ours) === String(r.theirs);
  const w = rows.filter((r) => r.won).length;
  const d = rows.filter(isD).length;
  const l = rows.length - w - d;
  return (
    <div className="ov8-dots-bar">
      <span className="ov8-dots-label">近{rows.length}场</span>
      <div className="ov8-dots">
        {rows.map((r, i) => (
          <span key={i} className={'ov8-dot ' + (r.won ? 'ov8-dot-w' : isD(r) ? 'ov8-dot-d' : 'ov8-dot-l')}>{r.won ? 'W' : isD(r) ? 'D' : 'L'}</span>
        ))}
      </div>
      <span className="ov8-dots-record">{w}胜 {d > 0 ? d + '平 ' : ''}{l}负</span>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export default function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errDist, setErrDist] = useState(null);   // review-report by_type（近14天）
  const [now, setNow] = useState(new Date());
  const [heroOpen, setHeroOpen] = useState(true);
  const heroTouched = useRef(false);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);
  const [mapPool, setMapPool] = useState(null);           // 地图池配置 {active, firstBan}
  const [mapModal, setMapModal] = useState(null);        // 当前弹窗地图名
  const [mapPeriod, setMapPeriod] = useState('14');      // 14 | 30 | 90 | all
  const [periodStats, setPeriodStats] = useState({});    // {周期key: {maps, details}}，取过即缓存
  const [expandedId, setExpandedId] = useState(null);    // 弹窗内展开详情的比赛 id

  const RANGE = useMemo(() => ({ start: daysAgo(13), end: today() }), []);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/dashboard/overview', { params: { start: RANGE.start, end: RANGE.end } })
      .then((r) => setData(r.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
    api.get('/training-plans/review-report', { params: { from: RANGE.start, to: RANGE.end } })
      .then((r) => setErrDist(r.data?.summary?.by_type || null))
      .catch(() => setErrDist(null));
  }, [RANGE]);

  useEffect(() => {
    fetchAll();
    api.get('/admin/map-pool').then((r) => setMapPool(r.data || null)).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // Hero：加载 3s 后自动收起（design 规格）；手动点过则不再自动
  useEffect(() => {
    const t = setTimeout(() => { if (!heroTouched.current) setHeroOpen(false); }, 3000);
    return () => clearTimeout(t);
  }, []);

  const curUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canEditEvent = curUser.role === 'admin' || curUser.role === 'team_lead';

  if (loading && !data) {
    return <div className="ov8-root"><div className="ov8-loading">加载中…</div></div>;
  }
  if (error && !data) {
    return <div className="ov8-root"><div className="ov8-loading" style={{ color: '#f87171' }}>数据加载失败：{error}</div></div>;
  }
  if (!data) return null;

  const {
    kpi = {}, upcomingMatch, upcomingMatches, recentMatches = [], recentOfficial = [],
    teamAverages = {}, mapStats = [], trainingPlan = [], matchDetails = [],
  } = data;

  // ── 即将开始赛事：未结束 + 开赛时间未过 ──
  const evtRaw = (Array.isArray(upcomingMatches) && upcomingMatches.length) ? upcomingMatches : (upcomingMatch ? [upcomingMatch] : []);
  const upcoming = evtRaw
    .filter((e) => e && !e.is_finished && e.match_date)
    .filter((e) => new Date(`${e.match_date}T${e.match_time || '23:59:59'}`) >= now)
    .slice(0, 4);

  // ── 训练赛/正赛（won 判定：优先 result 字段，缺失则比比分）──
  const asWon = (m) => {
    if (m.result != null) return /win|胜|^w$/i.test(String(m.result));
    const p = parseScore(m.score);
    return p ? p[0] > p[1] : false;
  };
  const trainRows = (recentMatches || []).map((m) => {
    const p = parseScore(m.score) || ['—', '—'];
    return { opp: m.opponent, mapName: m.map, ours: p[0], theirs: p[1], dateLabel: (m.date || '').slice(5), won: asWon(m) };
  });
  const offRows = (recentOfficial || []).map((m) => ({
    opp: m.opponent, mapName: m.map_name, ours: m.our_score, theirs: m.their_score,
    dateLabel: (m.match_date || '').slice(5),
    won: m.result != null ? /win|胜|^w$/i.test(String(m.result)) : (m.our_score > m.their_score),
  }));

  // ── 数据速览（全部真实计算）──
  const totalGames = kpi.totalRecentMatches ?? trainRows.length;
  const winRate = kpi.recentWinRate ?? null;
  const roundAgg = (recentMatches || []).reduce((a, m) => {
    const p = parseScore(m.score);
    if (p) { a.our += p[0]; a.their += p[1]; }
    return a;
  }, { our: 0, their: 0 });
  const roundWinRate = (roundAgg.our + roundAgg.their) > 0
    ? +((roundAgg.our / (roundAgg.our + roundAgg.their)) * 100).toFixed(1) : null;
  const teamRating = teamAverages?.rating != null ? Number(teamAverages.rating).toFixed(2) : null;

  // ── Hero 右侧浮动卡：胜率走势（近8场滚动胜率，真实）+ 回合胜率圆环 ──
  const sparkRows = trainRows.slice(0, 8).reverse(); // 旧→新
  let accW = 0;
  const sparkRates = sparkRows.map((r, i) => { if (r.won) accW += 1; return (accW / (i + 1)) * 100; });
  const winSpark = sparkRates.length >= 2 ? sparkRates.map((v, i) => {
    const x = 4 + i * (128 / (sparkRates.length - 1));
    const y = 38 - ((Math.max(0, Math.min(100, v)) / 100) * 34);
    return `${x.toFixed(1)},${Math.max(4, Math.min(38, y)).toFixed(1)}`;
  }).join(' ') : '';
  const gaugeVal = roundWinRate;
  const gaugeDash = gaugeVal != null ? `${((gaugeVal / 100) * 226).toFixed(0)} 226` : '0 226';

  // ── 近14天训练趋势：训练赛按日聚合真实场次 ──
  const trendDays = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i));
  const perDay = trendDays.map((d) => (recentMatches || []).filter((m) => m.date === d).length);
  const trendMax = Math.max(3, ...perDay);
  const trendPts = perDay.map((v, i) => ({ x: 40 + i * (422 / 13), y: 138 - (v / trendMax) * 116 }));
  const trendLine = trendPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const trendHasData = perDay.some((v) => v > 0);

  // ── 失误类型分布（近14天，review-report 真实计数）──
  const errRows = ERR_TYPES
    .map((t) => ({ ...t, count: (errDist && errDist[t.key]) || 0 }))
    .filter((t) => t.count > 0);
  const errTotal = errRows.reduce((s, t) => s + t.count, 0);
  const CIRC = 2 * Math.PI * 58; // 364.4
  let accLen = 0;
  const donutSegs = errRows.map((t) => {
    const len = (t.count / errTotal) * CIRC;
    const seg = { color: t.color, dash: `${len.toFixed(1)} ${CIRC.toFixed(1)}`, offset: -accLen };
    accLen += len;
    return seg;
  });

  // ── 地图胜率（隐藏退役图，口径与现有代码一致）──
  const poolActive = mapPool && Array.isArray(mapPool.active) && mapPool.active.length ? mapPool.active : null;
  const visMaps = poolActive
    ? (mapStats || []).filter((m) => poolActive.includes(m.map_name))
    : (mapStats || []).filter((m) => !HIDDEN_MAPS.includes(m.map_name));

  // ── 今日训练安排：按当前时间实时推算状态 ──
  const planStatus = (tp) => {
    const d = today();
    const s = new Date(`${d}T${tp.start_time || '00:00'}:00`.replace(/:00:00$/, ':00'));
    const e = new Date(`${d}T${tp.end_time || tp.start_time || '23:59'}:00`.replace(/:00:00$/, ':00'));
    if (!isNaN(e) && now > e) return { text: '已完成', cls: 'ov8-st-done' };
    if (!isNaN(s) && now >= s && now <= e) return { text: '进行中', cls: 'ov8-st-live' };
    return { text: '未开始', cls: 'ov8-st-wait' };
  };

  const openDetail = (e) => { setDetailEvent(e); setShowEventDetail(true); };

  // ── 地图胜率弹窗：周期 14/30/90/ALL，复用 /dashboard/overview 的 mapStats ──
  const MAP_PERIODS = [
    { key: '14',  label: '14天', days: 14 },
    { key: '30',  label: '30天', days: 30 },
    { key: '90',  label: '90天', days: 90 },
    { key: 'all', label: 'ALL',  days: null },
  ];
  const fetchMapPeriod = (key) => {
    setPeriodStats((s) => (s[key] !== undefined ? s : { ...s, [key]: null })); // null=加载中
    const p = MAP_PERIODS.find((x) => x.key === key);
    const start = p.days ? daysAgo(p.days - 1) : '2020-01-01';
    api.get('/dashboard/overview', { params: { start, end: today() } })
      .then((r) => setPeriodStats((s) => ({ ...s, [key]: { maps: r.data?.mapStats || [], details: r.data?.matchDetails || [] } })))
      .catch(() => setPeriodStats((s) => ({ ...s, [key]: { maps: [], details: [] } })));
  };
  const openMapModal = (name) => {
    setMapModal(name);
    setMapPeriod('14');
    setExpandedId(null);
    setPeriodStats((s) => ({ ...s, '14': { maps: mapStats || [], details: matchDetails || [] } })); // 14天直接用已加载数据
  };
  const switchMapPeriod = (key) => {
    setMapPeriod(key);
    setExpandedId(null);
    if (periodStats[key] === undefined) fetchMapPeriod(key);
  };

  const wrColor = (wr) => (wr >= 60 ? 'var(--ov8-grad-green)' : wr >= 51 ? 'var(--ov8-grad-orange)' : 'var(--ov8-grad-red)');

  return (
    <div className="ov8-root">

      {/* ══════════ HERO（可折叠：加载展开，3s 自动收起，点击切换）══════════ */}
      <div className="ov8-hero" onClick={() => { heroTouched.current = true; setHeroOpen((o) => !o); }}>
        <div className="ov8-hero-bar">
          <div className="ov8-hero-bar-title"><span className="ov8-hero-tick" />UR Esports 赛训数据中心</div>
          <div className="ov8-hero-hint">{heroOpen ? '点击任意位置收起 ▲' : '点击任意位置展开 ▼'}</div>
        </div>
        <div className="ov8-hero-content" style={{ maxHeight: heroOpen ? 480 : 0, opacity: heroOpen ? 1 : 0 }}>
          <div className="ov8-hero-inner">
            <div className="ov8-hero-copy">
              <div className="ov8-hero-title">
                <span>UR Esports </span><span className="ov8-hero-grad">赛训数据中心</span>
              </div>
              <div className="ov8-hero-desc">整合训练、比赛、战术与分析数据，构建科学赛训体系，<br />助力团队持续提升竞技表现与战术执行力。</div>
              <div className="ov8-hero-btns">
                <div className="ov8-btn-primary" onClick={(e) => { e.stopPropagation(); heroTouched.current = true; setHeroOpen(false); }}>进入数据中心 <span>→</span></div>
                <div className="ov8-btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/training-report'); }}>查看赛训分析 <span>→</span></div>
              </div>
            </div>
            <div className="ov8-hero-art">
              <img src="/reshape/home/hero.png" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <div className="ov8-hero-floats">
              <div className="ov8-float-card">
                <div className="ov8-float-label">WIN RATE {winRate != null && winRate >= 50 && <span className="ov8-up">↗</span>}</div>
                <div className="ov8-float-value">{winRate != null ? `${winRate}%` : '—'}</div>
                {winSpark ? (
                  <svg width="136" height="42" viewBox="0 0 136 42"><polyline points={winSpark} fill="none" stroke="#a78bfa" strokeWidth="2" /></svg>
                ) : <div className="ov8-float-none">暂无走势</div>}
              </div>
              <div className="ov8-float-card">
                <div className="ov8-float-label">回合胜率</div>
                <div className="ov8-gauge">
                  <svg width="88" height="88" viewBox="0 0 88 88">
                    <defs><linearGradient id="ov8GaugeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
                    <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(70,110,255,.25)" strokeWidth="7" />
                    <circle cx="44" cy="44" r="36" fill="none" stroke="url(#ov8GaugeGrad)" strokeWidth="7" strokeLinecap="round" strokeDasharray={gaugeDash} transform="rotate(-90 44 44)" />
                    <text x="44" y="51" textAnchor="middle" fill="#ffffff" fontSize="19" fontWeight="700">{gaugeVal != null ? `${Math.round(gaugeVal)}%` : '—'}</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ 顶部三卡（560 / 1fr / 400，与主区列缝对齐）══════════ */}
      <div className="ov8-toprow">

        {/* 即将开始赛事 */}
        <div className="ov8-card ov8-upc">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>}
            title="即将开始赛事" badge={upcoming.length}
          />
          <div className="ov8-upc-list">
            {upcoming.length === 0 ? <Empty text="暂无即将开始的赛事" /> : upcoming.map((e, i) => {
              const t = upcomingTimeInfo(e.match_date, e.match_time, now);
              return (
                <div key={i} className="ov8-upc-row" onClick={() => openDetail(e)} title="点击查看赛事详情">
                  <span className="ov8-team-badge" style={{ background: badgeGrad(e.opponent) }}>{String(e.opponent || '?')[0]}</span>
                  <span className="ov8-upc-opp">{e.opponent || e.event_name || '—'}</span>
                  <span className="ov8-upc-stage">{e.stage_bo || e.stage || '—'}</span>
                  <span className="ov8-upc-time">{t.label}</span>
                  {t.soon
                    ? <span className="ov8-upc-status ov8-soon">{t.soonLabel}</span>
                    : <span className="ov8-upc-status">{e.status || '已确认'}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 近14天数据速览 2×2 */}
        <div className="ov8-card ov8-glance">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>}
            title="近14天数据速览" right={<span className="ov8-dim-note">{RANGE.start.slice(5)} ~ {RANGE.end.slice(5)}</span>}
          />
          <div className="ov8-glance-grid">
            <div className="ov8-tile ov8-click" onClick={() => navigate('/matches')} title="点击查看近期赛事"><div className="ov8-tile-label">已完成比赛</div><div className="ov8-tile-value">{totalGames ?? '—'}</div></div>
            <div className="ov8-tile ov8-click" onClick={() => navigate('/matches')} title="点击查看近期赛事"><div className="ov8-tile-label">胜率</div><div className="ov8-tile-value">{winRate != null ? `${winRate}%` : '—'}</div></div>
            <div className="ov8-tile ov8-click" onClick={() => navigate('/matches')} title="点击查看近期赛事"><div className="ov8-tile-label">回合胜率</div><div className="ov8-tile-value">{roundWinRate != null ? `${roundWinRate}%` : '—'}</div></div>
            <div className="ov8-tile ov8-click" onClick={() => navigate('/training-report')} title="点击查看赛训分析"><div className="ov8-tile-label">团队平均 Rating</div><div className="ov8-tile-value">{teamRating ?? '—'}</div></div>
          </div>
        </div>

        {/* 今日训练安排 */}
        <div className="ov8-card ov8-todayplan">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>}
            title="今日训练安排"
          />
          <div className="ov8-plan-list">
            {(trainingPlan || []).length === 0 ? <Empty text="暂无今日训练安排" /> : trainingPlan.map((tp, i) => {
              const st = planStatus(tp);
              return (
                <div key={tp.id || i} className="ov8-plan-row ov8-click" onClick={() => navigate('/workstation?tab=daily')} title="点击进入工作站·每日赛训">
                  <span className="ov8-plan-time">{tp.start_time || '—'}</span>
                  <span className={'ov8-plan-tick ' + st.cls} />
                  <span className="ov8-plan-title">{tp.title}{tp.subtitle ? ` · ${tp.subtitle}` : ''}</span>
                  <span className={'ov8-plan-status ' + st.cls}>{st.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════ 主区 grid（560 / 1fr / 400，左列跨两行）══════════ */}
      <div className="ov8-main">

        {/* 训练赛 */}
        <div className="ov8-card ov8-panel ov8-col1-r1">
          <div className="ov8-panel-head">
            <div className="ov8-panel-title">训练赛</div>
            <div className="ov8-link" onClick={() => navigate('/matches')}>查看全部 →</div>
          </div>
          {trainRows.length === 0 ? <Empty text="暂无训练赛记录" /> : (
            <>
              <DotsBar rows={trainRows.slice(0, 8)} />
              <div className="ov8-match-list">
                {trainRows.slice(0, 4).map((r, i) => <MatchRow key={i} {...r} onClick={() => navigate('/matches')} />)}
              </div>
            </>
          )}
        </div>

        {/* 正赛 */}
        <div className="ov8-card ov8-panel ov8-col1-r2">
          <div className="ov8-panel-head">
            <div className="ov8-panel-title">正赛</div>
            <div className="ov8-link" onClick={() => navigate('/matches?tab=official')}>查看全部 →</div>
          </div>
          {offRows.length === 0 ? <Empty text="暂无正赛记录" /> : (
            <>
              <DotsBar rows={offRows.slice(0, 8)} />
              <div className="ov8-match-list">
                {offRows.slice(0, 4).map((r, i) => <MatchRow key={i} {...r} onClick={() => navigate('/matches?tab=official')} />)}
              </div>
            </>
          )}
        </div>

        {/* 近14天训练趋势（真实：训练赛按日场次） */}
        <div className="ov8-card ov8-panel ov8-click" onClick={() => navigate('/matches')} title="点击查看近期赛事">
          <div className="ov8-panel-head"><div className="ov8-panel-title" style={{ fontSize: 17 }}>近14天训练趋势 <span className="ov8-dim-note">（场次/日）</span></div></div>
          {!trendHasData ? <Empty text="近14天暂无训练赛数据" /> : (
            <svg width="100%" height="170" viewBox="0 0 470 170" preserveAspectRatio="none" style={{ marginTop: 10 }}>
              <defs>
                <linearGradient id="ov8Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(124,58,237,.45)" /><stop offset="1" stopColor="rgba(124,58,237,0)" /></linearGradient>
              </defs>
              <g stroke="rgba(70,110,255,.15)" strokeWidth="1">
                <line x1="34" y1="18" x2="466" y2="18" /><line x1="34" y1="58" x2="466" y2="58" />
                <line x1="34" y1="98" x2="466" y2="98" /><line x1="34" y1="138" x2="466" y2="138" />
              </g>
              <g fill="#7288bd" fontSize="10">
                <text x="4" y="21">{trendMax}</text>
                <text x="4" y="61">{Math.round(trendMax * 2 / 3)}</text>
                <text x="4" y="101">{Math.round(trendMax / 3)}</text>
                <text x="4" y="141">0</text>
              </g>
              <path d={`${trendLine} L462 138 L40 138 Z`} fill="url(#ov8Area)" />
              <path d={trendLine} fill="none" stroke="#8b5cf6" strokeWidth="2.5" />
              {trendPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#e0e7ff" stroke="#8b5cf6" strokeWidth="1.5" />)}
              <g fill="#7288bd" fontSize="10" textAnchor="middle">
                {trendDays.map((d, i) => (i % 2 === 0 ? <text key={d} x={40 + i * (422 / 13)} y="160">{d.slice(5)}</text> : null))}
              </g>
            </svg>
          )}
        </div>

        {/* 失误类型分布（近14天） */}
        <div className="ov8-card ov8-panel ov8-click" onClick={() => navigate('/training-report')} title="点击查看赛训分析">
          <div className="ov8-panel-head">
            <div className="ov8-panel-title" style={{ fontSize: 17 }}>失误类型分布 <span className="ov8-dim-note">（近14天）</span></div>
          </div>
          {errTotal === 0 ? <Empty text="近14天暂无失误数据" /> : (
            <div className="ov8-err-wrap">
              <svg width="152" height="152" viewBox="0 0 160 160">
                <g transform="rotate(-90 80 80)">
                  {donutSegs.map((s, i) => (
                    <circle key={i} cx="80" cy="80" r="58" fill="none" stroke={s.color} strokeWidth="26"
                      strokeDasharray={s.dash} strokeDashoffset={s.offset} />
                  ))}
                </g>
                <text x="80" y="74" textAnchor="middle" fill="#8fa5d8" fontSize="13">总计</text>
                <text x="80" y="98" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="800">{errTotal}</text>
              </svg>
              <div className="ov8-err-legend">
                {errRows.map((t) => (
                  <div key={t.key} className="ov8-err-row">
                    <span className="ov8-err-dot" style={{ background: t.color }} />
                    <span className="ov8-err-name">{t.key}</span>
                    <b>{Math.round((t.count / errTotal) * 100)}%</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 地图胜率（跨中+右两列） */}
        <div className="ov8-card ov8-panel ov8-mapspan">
          <div className="ov8-panel-head">
            <div className="ov8-panel-title" style={{ fontSize: 17 }}>地图胜率 <span className="ov8-dim-note">（近14天 · {totalGames ?? 0} 场）</span></div>
            <div className="ov8-map-legend">
              <span><i style={{ background: 'linear-gradient(90deg,#22c55e,#10b981)' }} />≥60%</span>
              <span><i style={{ background: 'linear-gradient(90deg,#f59e0b,#f97316)' }} />51–59%</span>
              <span><i style={{ background: 'linear-gradient(90deg,#ef4444,#b91c1c)' }} />≤50%</span>
            </div>
          </div>
          {visMaps.length === 0 ? <Empty text="暂无地图数据" /> : (
            <div className="ov8-map-grid" style={{ gridTemplateColumns: `repeat(${visMaps.length}, 1fr)` }}>
              {visMaps.map((m) => {
                const wr = m.win_rate || 0;
                const has = (m.played || 0) > 0;
                return (
                  <div key={m.map_name} className="ov8-map-card ov8-click" onClick={() => openMapModal(m.map_name)} title="点击查看该图各周期胜率">
                    {mapImg(m.map_name) && <img className="ov8-map-img" src={mapImg(m.map_name)} alt={m.map_name} onError={(e) => { e.target.style.display = 'none'; }} />}
                    <div className="ov8-map-name">{m.map_name}{mapPool?.firstBan === m.map_name && <span className="ov8-firstban">首Ban</span>}</div>
                    <div className="ov8-map-rate">{has ? `${wr}%` : '—'}</div>
                    <div className="ov8-map-record">{has ? `${m.wins}胜 ${m.losses}负` : '暂无数据'}</div>
                    <div className="ov8-map-bar"><div style={{ width: `${has ? wr : 0}%`, background: wrColor(wr) }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* ══════════ 底部：核心功能 + 快捷操作 ══════════ */}
      <div className="ov8-bottom">
        <div>
          <div className="ov8-sec-title"><span className="ov8-sec-tick" />核心功能</div>
          <div className="ov8-entry-grid">
            <div className="ov8-entry ov8-click" onClick={() => navigate('/members')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-versus.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">赛训名单</div><div className="ov8-entry-sub">阵容与选手数据</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/matches')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-schedule.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">近期赛事</div><div className="ov8-entry-sub">比赛记录与结果</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/training-report')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-trend.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">赛训分析</div><div className="ov8-entry-sub">多维数据分析</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=daily&sub=log')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-log.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">训练日志</div><div className="ov8-entry-sub">日常训练记录</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
          </div>
        </div>
        <div>
          <div className="ov8-sec-title"><span className="ov8-sec-tick" />快捷操作</div>
          <div className="ov8-entry-grid">
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=daily&sub=log')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-quick.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">新建训练日志</div><div className="ov8-entry-sub">记录训练与复盘</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=daily&sub=briefing')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-dashboard.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">上传简报</div><div className="ov8-entry-sub">分享训练总结</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=daily&sub=tactics')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-log.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">导入战术</div><div className="ov8-entry-sub">管理战术库</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=archives')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-hub.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">查看资料库</div><div className="ov8-entry-sub">浏览历史资料</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ 地图交手记录弹窗 ══════════ */}
      {mapModal && (() => {
        const ps = periodStats[mapPeriod];
        const row = ps && Array.isArray(ps.maps) ? ps.maps.find((m) => m.map_name === mapModal) : null;
        const recs = row?.recentMatches || [];
        const details = ps?.details || [];
        return (
          <div className="ov8-modal-mask" onClick={() => setMapModal(null)}>
            <div className="ov8-modal ov8-modal-map" onClick={(e) => e.stopPropagation()}>
              {/* 表头：地图 LOGO */}
              <div className="ov8-modal-maphead">
                {mapImg(mapModal) && <img src={mapImg(mapModal)} alt={mapModal} />}
                <div className="ov8-modal-mapname">
                  <div className="ov8-modal-mapname-main">{mapModal}</div>
                  {row && (row.played || 0) > 0 && (
                    <div className="ov8-modal-mapname-sub">{row.played}场 · {row.wins}胜 {row.losses}负 · 胜率 {row.win_rate}%</div>
                  )}
                </div>
                <span className="ov8-modal-close" onClick={() => setMapModal(null)}>✕</span>
              </div>
              {/* 周期标签 */}
              <div className="ov8-mtabs">
                {MAP_PERIODS.map((p) => (
                  <span key={p.key} className={'ov8-mtab ' + (mapPeriod === p.key ? 'ov8-mtab-on' : '')}
                    onClick={() => switchMapPeriod(p.key)}>{p.label}</span>
                ))}
              </div>
              {/* 交手记录 */}
              {ps === null || ps === undefined ? (
                <div className="ov8-empty" style={{ marginTop: 14 }}>加载中…</div>
              ) : recs.length === 0 ? (
                <div className="ov8-empty" style={{ marginTop: 14 }}>该周期暂无交手记录</div>
              ) : (
                <div className="ov8-rec-list">
                  <div className="ov8-rec-title">交手记录 <span className="ov8-dim-note">· 共 {recs.length} 场 · 点击展开数据详情</span></div>
                  <div className="ov8-rec-scroll">
                  {recs.map((m) => {
                    const won = m.result === 'win';
                    const draw = m.result === 'draw';
                    const detail = details.find((x) => x.id === m.id);
                    const open = expandedId === m.id;
                    return (
                      <div key={m.id} className="ov8-rec-item">
                        {(() => {
                          const sp = String(m.score || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
                          const evName = m.event_name || m.tournament_name || detail?.event_name || detail?.tournament_name || '';
                          const evStage = m.stage_name || m.stage || detail?.stage_name || detail?.stage || '';
                          const isOfficial = !!evName || m.match_type === 'official' || detail?.match_type === 'official';
                          return (
                            <div className={'ov8-rec-row ' + (won ? 'ov8-won' : draw ? 'ov8-draw' : 'ov8-lost')}
                              onClick={() => detail && setExpandedId(open ? null : m.id)}
                              style={{ cursor: detail ? 'pointer' : 'default' }}>
                              <span className="ov8-rec-date">{(m.date || '').slice(5)}</span>
                              <span className="ov8-rec-opp">{m.opponent}</span>
                              <span className="ov8-rec-evcol">
                                {isOfficial && (
                                  <span className="ov8-rec-event">{evName ? `${evName}${evStage ? ' · ' + evStage : ''}` : '正赛'}</span>
                                )}
                              </span>
                              <span className="ov8-rec-score">
                                <span className={'ov8-rec-ours ' + (won ? 'ov8-score-win' : draw ? 'ov8-score-draw' : 'ov8-score-loss')}>{sp ? sp[1] : '—'}</span>
                                <span className="ov8-rec-sep">:</span>
                                <span className="ov8-rec-theirs">{sp ? sp[2] : '—'}</span>
                              </span>
                              <span className="ov8-rec-caret">{detail ? (open ? '▾' : '›') : ''}</span>
                            </div>
                          );
                        })()}
                        {open && detail && (
                          <div className="ov8-rec-detail">
                            <div className="ov8-det-title">UR 选手数据</div>
                            <table className="ov8-det-table">
                              <colgroup><col /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 56 }} /></colgroup>
                              <thead><tr><th style={{ textAlign: 'left' }}>选手</th><th>Rating</th><th>K-D</th><th>ADR</th><th>HS</th></tr></thead>
                              <tbody>
                                {[...(detail.players || [])].sort((a, b) => (b.rating || 0) - (a.rating || 0)).map((p) => (
                                  <tr key={p.name}>
                                    <td style={{ textAlign: 'left', fontWeight: 700 }}>{p.name}</td>
                                    <td style={{ color: (p.rating || 0) >= 1.0 ? '#34d399' : '#f87171' }}>{p.rating != null ? Number(p.rating).toFixed(2) : '—'}</td>
                                    <td>{p.kd || '—'}</td>
                                    <td>{p.adr != null ? Number(p.adr).toFixed(1) : '—'}</td>
                                    <td>{p.hs || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(detail.oppPlayers || []).length > 0 && (
                              <>
                                <div className="ov8-det-title" style={{ color: '#f87171', marginTop: 10 }}>{detail.opponent} 选手数据</div>
                                <table className="ov8-det-table">
                                  <colgroup><col /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 56 }} /></colgroup>
                                  <thead><tr><th style={{ textAlign: 'left' }}>选手</th><th>Rating</th><th>K-D</th><th>ADR</th><th>HS</th></tr></thead>
                                  <tbody>
                                    {[...detail.oppPlayers].sort((a, b) => (b.rating || 0) - (a.rating || 0)).map((p) => (
                                      <tr key={p.name}>
                                        <td style={{ textAlign: 'left', color: '#aebbe4', fontWeight: 700 }}>{p.name}</td>
                                        <td style={{ color: (p.rating || 0) >= 1.0 ? '#34d399' : '#f87171' }}>{p.rating != null ? Number(p.rating).toFixed(2) : '—'}</td>
                                        <td>{p.kd || '—'}</td>
                                        <td>{p.adr != null ? Number(p.adr).toFixed(1) : '—'}</td>
                                        <td>{p.hs || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════ 赛事详情弹窗（复用现有组件）══════════ */}
      {showEventDetail && detailEvent && (
        <EventDetailModal event={detailEvent} canEdit={canEditEvent} onClose={() => setShowEventDetail(false)} />
      )}
    </div>
  );
}


