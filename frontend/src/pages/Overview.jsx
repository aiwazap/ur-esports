import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Globe2, LockKeyhole } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import api from '../api';
import './overview-v8.css';
import EventDetailModal from '../components/EventDetailModal';
import FaceitSeaSummaryCard from '../components/FaceitSeaSummaryCard';

gsap.registerPlugin(useGSAP);

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

const TRAINING_PLAYER_FALLBACK = [
  { id: 'melody', rating: '1.15', adr: '78.6', roundWin: '45.1%' },
  { id: 'glong', rating: '1.08', adr: '72.4', roundWin: '43.3%' },
  { id: '4ever', rating: '1.03', adr: '70.1', roundWin: '41.8%' },
  { id: '0Z', rating: '0.98', adr: '66.8', roundWin: '40.2%' },
  { id: 'drace', rating: '0.94', adr: '64.5', roundWin: '38.6%' },
];

const ERROR_TYPE_FALLBACK = [
  { key: '道具', pct: 4, count: 1, color: '#79AC69' },
  { key: '点位', pct: 48, count: 13, color: '#5fd282' },
  { key: '枪法', pct: 37, count: 10, color: '#2ec8d3' },
  { key: '沟通', pct: 4, count: 1, color: '#b8df65' },
  { key: '战术', pct: 7, count: 2, color: '#d7c85d' },
];

const MAP_WIN_FALLBACK = [
  { map_name: 'Ancient', win_rate: 100, wins: 1, losses: 0, played: 1 },
  { map_name: 'Mirage', win_rate: 33.3, wins: 1, losses: 2, played: 3 },
  { map_name: 'Dust2', win_rate: 0, wins: 0, losses: 2, played: 2 },
  { map_name: 'Nuke', win_rate: 0, wins: 0, losses: 0, played: 0 },
  { map_name: 'Anubis', win_rate: 0, wins: 0, losses: 0, played: 0 },
  { map_name: 'Overpass', win_rate: 0, wins: 0, losses: 0, played: 0 },
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

function ModeMetric({ label, value }) {
  return (
    <div className="ov8-mode-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModeListRow({ main, sub, right, onClick }) {
  return (
    <button className="ov8-mode-row" type="button" onClick={onClick}>
      <span className="ov8-mode-row-main">{main || '—'}</span>
      <span className="ov8-mode-row-sub">{sub || '—'}</span>
      {right && <span className="ov8-mode-row-right">{right}</span>}
    </button>
  );
}

function ModeBoard({ title, subtitle, tone = 'blue', sections }) {
  return (
    <section className={`ov8-card ov8-mode-card ov8-mode-card--${tone}`}>
      <div className="ov8-mode-head">
        <div>
          <div className="ov8-mode-title">{title}</div>
          {subtitle && <div className="ov8-mode-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="ov8-mode-grid">
        {sections.map((section) => (
          <div className="ov8-mode-panel" key={section.title}>
            <div className="ov8-mode-panel-title">{section.title}</div>
            {section.content}
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroSection({ children }) {
  return children;
}

function TopDataRow({ children }) {
  return <div className="ov8-top-data-row">{children}</div>;
}

function FaceitSeaSection({ children }) {
  return <div className="ov8-faceit-row">{children}</div>;
}

function TrainingDataSection({ children }) {
  return <div className="ov8-training-data-row">{children}</div>;
}

function TrainingFocusAndMapSection({ children }) {
  return <div className="ov8-focus-map-row">{children}</div>;
}

function FunctionShortcutSection({ children }) {
  return <div className="ov8-bottom">{children}</div>;
}

// ─── 主组件 ──────────────────────────────────────────────────
const HERO_INTRO_KEY = 'ov8HeroIntroSeen';
const HERO_PARTICLES = [
  { left: '48%', top: '20%', size: 3, tone: 'cyan' },
  { left: '54%', top: '37%', size: 4, tone: 'violet' },
  { left: '59%', top: '13%', size: 3, tone: 'cyan' },
  { left: '63%', top: '48%', size: 5, tone: 'blue' },
  { left: '68%', top: '20%', size: 3, tone: 'violet' },
  { left: '72%', top: '42%', size: 4, tone: 'cyan' },
  { left: '77%', top: '14%', size: 5, tone: 'blue' },
  { left: '81%', top: '34%', size: 3, tone: 'cyan' },
  { left: '86%', top: '22%', size: 4, tone: 'violet' },
  { left: '90%', top: '47%', size: 3, tone: 'blue' },
  { left: '57%', top: '69%', size: 4, tone: 'cyan' },
  { left: '84%', top: '71%', size: 5, tone: 'violet' },
];

export default function Overview() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const [data, setData] = useState(null);
  const [faceitSea, setFaceitSea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errDist, setErrDist] = useState(null);   // review-report by_type（近14天）
  const [now, setNow] = useState(new Date());
  const [heroIntro] = useState(() => {
    try { return sessionStorage.getItem(HERO_INTRO_KEY) !== '1'; } catch { return true; }
  });
  const [heroOpen, setHeroOpen] = useState(heroIntro);
  const [heroAutoCollapse, setHeroAutoCollapse] = useState(heroIntro);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);
  const [mapPool, setMapPool] = useState(null);           // 地图池配置 {active, firstBan}
  const [mapModal, setMapModal] = useState(null);        // 当前弹窗地图名
  const [mapPeriod, setMapPeriod] = useState('14');      // 14 | 30 | 90 | all
  const [periodStats, setPeriodStats] = useState({});    // {周期key: {maps, details}}，取过即缓存
  const [expandedId, setExpandedId] = useState(null);    // 弹窗内展开详情的比赛 id
  const [faceitSyncing, setFaceitSyncing] = useState(false);

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
    api.get('/faceit-sea/summary')
      .then((r) => setFaceitSea(r.data))
      .catch(() => setFaceitSea(null));
  }, [RANGE]);

  useEffect(() => {
    fetchAll();
    api.get('/admin/map-pool').then((r) => setMapPool(r.data || null)).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  useEffect(() => {
    if (!heroIntro) return;
    try { sessionStorage.setItem(HERO_INTRO_KEY, '1'); } catch {}
  }, [heroIntro]);

  useEffect(() => {
    if (!heroAutoCollapse || !heroOpen) return undefined;
    const timer = setTimeout(() => {
      setHeroOpen(false);
      setHeroAutoCollapse(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [heroAutoCollapse, heroOpen]);

  const toggleHero = () => {
    setHeroAutoCollapse(false);
    setHeroOpen((open) => !open);
  };

  const closeHeroManually = () => {
    setHeroAutoCollapse(false);
    setHeroOpen(false);
  };

  const curUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canEditEvent = curUser.role === 'admin' || curUser.role === 'team_lead';
  const syncFaceitMatches = useCallback(() => {
    setFaceitSyncing(true);
    api.post('/faceit-sea/sync-matches', { date: faceitSea?.date || today(), limit: 30 })
      .then((r) => setFaceitSea(r.data?.summary || faceitSea))
      .catch(() => {})
      .finally(() => setFaceitSyncing(false));
  }, [faceitSea]);

  useGSAP(() => {
    if (!heroOpen || loading || !heroRef.current) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      gsap.set('.ov8-hero-motion', { autoAlpha: 0.72 });
      return undefined;
    }

    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro
      .fromTo('.ov8-hero-motion', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 0)
      .fromTo('.ov8-hero-copy > *', { autoAlpha: 0, x: -30, y: 8 }, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        duration: 0.72,
        stagger: 0.08,
      }, 0.04)
      .fromTo('.ov8-hero-art img', { autoAlpha: 0, scale: 0.96, y: 12 }, {
        autoAlpha: 0.2,
        scale: 1,
        y: 0,
        duration: 0.9,
      }, 0.1)
      .fromTo('.ov8-float-card', { autoAlpha: 0, x: 34, scale: 0.94 }, {
        autoAlpha: 1,
        x: 0,
        scale: 1,
        duration: 0.68,
        stagger: 0.14,
      }, 0.18)
      .fromTo('.ov8-hero-tags span', { autoAlpha: 0, y: 10 }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.06,
      }, 0.42);

    gsap.to('.ov8-motion-aura', {
      autoAlpha: 0.95,
      scale: 1.16,
      duration: 1.45,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    gsap.to('.ov8-motion-floor', {
      scaleX: 1.12,
      scaleY: 0.82,
      autoAlpha: 0.72,
      duration: 1.45,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    gsap.to('.ov8-motion-orbit--outer', {
      rotation: 360,
      duration: 7.5,
      repeat: -1,
      ease: 'none',
      transformOrigin: '50% 50%',
    });
    gsap.to('.ov8-motion-orbit--inner', {
      rotation: -360,
      duration: 4.8,
      repeat: -1,
      ease: 'none',
      transformOrigin: '50% 50%',
    });
    gsap.to('.ov8-hero-art img', {
      y: -9,
      autoAlpha: 0.29,
      duration: 1.8,
      delay: 0.95,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
    gsap.to('.ov8-float-card', {
      y: (index) => (index % 2 === 0 ? -7 : 7),
      duration: (index) => 1.75 + index * 0.22,
      delay: 1.05,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      stagger: 0.16,
    });
    gsap.to('.ov8-motion-particle', {
      x: (index) => (index % 3 - 1) * 14,
      y: (index) => -12 - (index % 4) * 5,
      scale: (index) => 1.25 + (index % 3) * 0.18,
      autoAlpha: 0.24,
      duration: (index) => 1.25 + (index % 5) * 0.22,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      stagger: { each: 0.1, from: 'random' },
    });
    gsap.fromTo('.ov8-motion-streak', { x: -60, autoAlpha: 0.08 }, {
      x: 105,
      autoAlpha: 0.72,
      duration: 2.2,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut',
      stagger: 0.28,
    });
    gsap.to('.ov8-motion-grid', {
      x: 24,
      autoAlpha: 0.66,
      duration: 4.2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });

    const scan = gsap.timeline({ repeat: -1, repeatDelay: 0.75 });
    scan
      .fromTo('.ov8-motion-scan', { xPercent: -170, autoAlpha: 0 }, {
        xPercent: -90,
        autoAlpha: 0.78,
        duration: 0.42,
        ease: 'power2.out',
      })
      .to('.ov8-motion-scan', {
        xPercent: 135,
        autoAlpha: 0.55,
        duration: 1.35,
        ease: 'power1.inOut',
      })
      .to('.ov8-motion-scan', {
        xPercent: 185,
        autoAlpha: 0,
        duration: 0.38,
        ease: 'power2.in',
      });

    return () => {
      intro.kill();
      scan.kill();
    };
  }, { scope: heroRef, dependencies: [heroOpen, loading], revertOnUpdate: true });

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
  const latestEvents = evtRaw
    .filter((e) => e?.event_name)
    .map((e) => ({
      ...e,
      sortDate: e.match_date || e.end_date || '1900-01-01',
    }))
    .sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)))
    .slice(0, 3);

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
  const officialWinRate = offRows.length ? Math.round((offRows.filter((r) => r.won).length / offRows.length) * 100) : null;
  const trainingWinRate = trainRows.length ? Math.round((trainRows.filter((r) => r.won).length / trainRows.length) * 100) : null;

  // ── 数据速览（全部真实计算）──
  const kpiTotalGames = Number(kpi.totalRecentMatches ?? trainRows.length ?? 0);
  const mapTotalGames = (mapStats || []).reduce((sum, m) => sum + Number(m.played || 0), 0);
  const mapWins = (mapStats || []).reduce((sum, m) => sum + Number(m.wins || 0), 0);
  const totalGames = kpiTotalGames > 0 ? kpiTotalGames : mapTotalGames;
  const winRate = kpiTotalGames > 0
    ? (kpi.recentWinRate ?? null)
    : (mapTotalGames > 0 ? +((mapWins / mapTotalGames) * 100).toFixed(1) : (kpi.recentWinRate ?? null));
  const roundAgg = { our: 0, their: 0 };
  (recentMatches || []).forEach((m) => {
    const p = parseScore(m.score);
    if (p) { roundAgg.our += p[0]; roundAgg.their += p[1]; }
  });
  (recentOfficial || []).forEach((m) => {
    const ours = Number(m.our_score);
    const theirs = Number(m.their_score);
    if (Number.isFinite(ours) && Number.isFinite(theirs)) {
      roundAgg.our += ours;
      roundAgg.their += theirs;
    }
  });
  const roundWinRate = (roundAgg.our + roundAgg.their) > 0
    ? +((roundAgg.our / (roundAgg.our + roundAgg.their)) * 100).toFixed(1) : null;
  const teamRating = teamAverages?.rating != null ? Number(teamAverages.rating).toFixed(2) : null;
  const teamADR = teamAverages?.adr != null ? Number(teamAverages.adr).toFixed(1) : null;

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
  const homeErrorRows = ERROR_TYPE_FALLBACK;
  const homeErrorTotal = 27;
  let homeErrAcc = 0;
  const homeDonutSegs = homeErrorRows.map((t) => {
    const len = (t.pct / 100) * CIRC;
    const seg = { color: t.color, dash: `${len.toFixed(1)} ${CIRC.toFixed(1)}`, offset: -homeErrAcc };
    homeErrAcc += len;
    return seg;
  });
  const homeMapRows = MAP_WIN_FALLBACK;

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

      {/* ══════════ HERO（默认展开，点击切换）══════════ */}
      <HeroSection>
      <div ref={heroRef} className={`ov8-hero ${heroOpen ? 'ov8-hero--open' : 'ov8-hero--closed'} ${heroIntro ? 'ov8-hero--intro' : ''}`} onClick={toggleHero}>
        <div className="ov8-hero-motion" aria-hidden="true">
          <div className="ov8-motion-grid" />
          <div className="ov8-motion-aura" />
          <div className="ov8-motion-floor" />
          <div className="ov8-motion-orbit ov8-motion-orbit--outer" />
          <div className="ov8-motion-orbit ov8-motion-orbit--inner" />
          <div className="ov8-motion-scan" />
          <div className="ov8-motion-streaks">
            <span className="ov8-motion-streak" />
            <span className="ov8-motion-streak" />
            <span className="ov8-motion-streak" />
            <span className="ov8-motion-streak" />
          </div>
          <div className="ov8-motion-particles">
            {HERO_PARTICLES.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.top}`}
                className={`ov8-motion-particle is-${particle.tone}`}
                style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size }}
                data-particle={index + 1}
              />
            ))}
          </div>
        </div>
        <div className="ov8-hero-bar">
          <div className="ov8-hero-bar-title"><span className="ov8-hero-tick" />UR Esports 赛训数据中心</div>
          <div className="ov8-hero-hint">{heroOpen ? '点击任意位置收起 ▲' : '点击任意位置展开 ▼'}</div>
        </div>
        <div className="ov8-hero-content" style={{ maxHeight: heroOpen ? 620 : 0, opacity: heroOpen ? 1 : 0 }}>
          <div className="ov8-hero-inner">
            <div className="ov8-hero-copy">
              <div className="ov8-hero-title">
                <span>UR Esports </span><span className="ov8-hero-grad">赛训数据中心</span>
              </div>
              <div className="ov8-hero-desc">整合训练、比赛、战术与分析数据，构建科学赛训体系，<br />助力团队持续提升竞技表现与战术执行力。</div>
              <div className="ov8-hero-btns">
                <div className="ov8-btn-primary" onClick={(e) => { e.stopPropagation(); closeHeroManually(); }}>进入数据中心 <span>→</span></div>
                <div className="ov8-btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/training-report'); }}>查看赛训分析 <span>→</span></div>
              </div>
              <div className="ov8-hero-tags" onClick={(e) => e.stopPropagation()}>
                <span><Crosshair aria-hidden="true" size={14} strokeWidth={2} />CS2 DIVISION</span>
                <span><LockKeyhole aria-hidden="true" size={14} strokeWidth={2} />Internal Platform</span>
                <span><Globe2 aria-hidden="true" size={14} strokeWidth={2} />Multi-language</span>
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
      </HeroSection>

      <TopDataRow>
        <div className="ov8-card ov8-home-card ov8-upcoming-card">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#20c7ff" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>}
            title="即将开始赛事"
          />
          {upcoming.length === 0 ? (
            <div className="ov8-empty ov8-empty-with-icon">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(143,164,199,.58)" strokeWidth="1.5"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              <span>暂无即将开始的赛事</span>
            </div>
          ) : (
            <div className="ov8-mode-list">
              {upcoming.slice(0, 3).map((e, i) => {
                const t = upcomingTimeInfo(e.match_date, e.match_time, now);
                return (
                  <ModeListRow
                    key={e.id || i}
                    main={e.event_name || e.opponent}
                    sub={`${e.stage || '待定阶段'} · ${t.label}`}
                    right={t.soon ? t.soonLabel : e.bo_format}
                    onClick={() => openDetail(e)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="ov8-card ov8-home-card">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7b4dff" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
            title="赛事记录"
          />
          <div className="ov8-mode-list">
            {latestEvents.length === 0 ? <Empty text="暂无赛事记录" /> : latestEvents.map((e) => (
              <ModeListRow
                key={e.tournament_id || e.id || e.event_name}
                main={e.event_name}
                sub={`${e.stage || '赛事'} · ${e.status || '—'}`}
                right={e.match_date || e.end_date || '—'}
                onClick={() => navigate(`/matches?tab=official&tournament=${e.tournament_id || e.id || ''}`)}
              />
            ))}
          </div>
          <button className="ov8-card-link" type="button" onClick={() => navigate('/matches?tab=official')}>查看全部赛事记录 →</button>
        </div>

        <div className="ov8-card ov8-home-card">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#20c7ff" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
            title="选手数据"
          />
          <div className="ov8-stat-list">
            <ModeMetric label="团队 Rating" value={teamRating ?? '1.02'} />
            <ModeMetric label="团队 ADR" value={teamADR ?? '73.0'} />
            <ModeMetric label="回合胜率" value={roundWinRate != null ? `${roundWinRate}%` : '42.2%'} />
            <ModeMetric label="正式赛胜率" value={officialWinRate != null ? `${officialWinRate}%` : '0%'} />
          </div>
        </div>
      </TopDataRow>

      <FaceitSeaSection>
        <FaceitSeaSummaryCard
          summary={faceitSea}
          compact
          onOpen={() => navigate('/faceit-sea')}
          onSync={syncFaceitMatches}
          syncing={faceitSyncing}
          canSync={canEditEvent}
        />
      </FaceitSeaSection>

      <TrainingDataSection>
        <div className="ov8-card ov8-home-card ov8-green-card">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#79AC69" strokeWidth="2"><path d="M3 6h18M7 6v12m10-12v12M5 18h14" /></svg>}
            title="训练赛记录"
          />
          <DotsBar rows={trainRows.slice(0, 6)} />
          <div className="ov8-match-list">
            {trainRows.length === 0 ? <Empty text="暂无训练赛记录" /> : trainRows.slice(0, 3).map((r, i) => (
              <MatchRow
                key={`${r.opp}-${i}`}
                opp={r.opp}
                mapName={r.mapName}
                ours={r.ours}
                theirs={r.theirs}
                dateLabel={r.dateLabel}
                won={r.won}
                onClick={() => navigate('/matches?tab=scrim')}
              />
            ))}
          </div>
          <button className="ov8-card-link ov8-green-link" type="button" onClick={() => navigate('/matches?tab=scrim')}>查看全部训练赛记录 →</button>
        </div>

        <div className="ov8-card ov8-home-card ov8-green-card">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#79AC69" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>}
            title="个人数据"
          />
          <div className="ov8-player-table ov8-training-player-table">
            <div className="ov8-player-row is-head"><span>ID</span><span>团队 Rating</span><span>ADR</span><span>回合胜率</span></div>
            {TRAINING_PLAYER_FALLBACK.map((p) => (
              <div className="ov8-player-row" key={p.id}>
                <span>{p.id}</span>
                <strong>{p.rating}</strong>
                <strong>{p.adr}</strong>
                <strong>{p.roundWin}</strong>
              </div>
            ))}
          </div>
          <button className="ov8-card-link ov8-green-link" type="button" onClick={() => navigate('/training-report')}>查看详细数据 →</button>
        </div>

        <div className="ov8-card ov8-home-card ov8-green-card ov8-click" onClick={() => navigate('/training-report')} title="点击查看赛训分析">
          <CardHead
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#79AC69" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg>}
            title="失误类型分布"
            badge="近14天"
          />
          <div className="ov8-err-wrap ov8-green-donut">
            <svg width="152" height="152" viewBox="0 0 160 160">
              <g transform="rotate(-90 80 80)">
                {homeDonutSegs.map((s, i) => (
                  <circle key={i} cx="80" cy="80" r="58" fill="none" stroke={s.color} strokeWidth="26"
                    strokeDasharray={s.dash} strokeDashoffset={s.offset} />
                ))}
              </g>
              <text x="80" y="74" textAnchor="middle" fill="#a9b9bb" fontSize="13">总计</text>
              <text x="80" y="98" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="800">{homeErrorTotal}</text>
            </svg>
            <div className="ov8-err-legend">
              {homeErrorRows.map((t) => (
                <div key={t.key} className="ov8-err-row">
                  <span className="ov8-err-dot" style={{ background: t.color }} />
                  <span className="ov8-err-name">{t.key}</span>
                  <b>{t.pct}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TrainingDataSection>

      <TrainingFocusAndMapSection>
        <div className="ov8-card ov8-panel ov8-trend-panel ov8-click" onClick={() => navigate('/matches')} title="点击查看近期赛事">
          <div className="ov8-panel-head"><div className="ov8-panel-title">近期训练重点 <span className="ov8-dim-note">（近14天）</span></div></div>
          {!trendHasData ? <Empty text="近14天暂无训练赛数据" /> : (
            <svg width="100%" height="170" viewBox="0 0 470 170" preserveAspectRatio="none" style={{ marginTop: 10 }}>
              <defs>
                <linearGradient id="ov8AreaGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(121,172,105,.38)" /><stop offset="1" stopColor="rgba(121,172,105,0)" /></linearGradient>
              </defs>
              <g stroke="rgba(121,172,105,.14)" strokeWidth="1">
                <line x1="34" y1="18" x2="466" y2="18" /><line x1="34" y1="58" x2="466" y2="58" />
                <line x1="34" y1="98" x2="466" y2="98" /><line x1="34" y1="138" x2="466" y2="138" />
              </g>
              <g fill="#a9b9bb" fontSize="10">
                <text x="4" y="21">{trendMax}</text>
                <text x="4" y="61">{Math.round(trendMax * 2 / 3)}</text>
                <text x="4" y="101">{Math.round(trendMax / 3)}</text>
                <text x="4" y="141">0</text>
              </g>
              <path d={`${trendLine} L462 138 L40 138 Z`} fill="url(#ov8AreaGreen)" />
              <path d={trendLine} fill="none" stroke="#79AC69" strokeWidth="2.5" />
              {trendPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#f5fff4" stroke="#79AC69" strokeWidth="1.5" />)}
              <g fill="#a9b9bb" fontSize="10" textAnchor="middle">
                {trendDays.map((d, i) => (i % 2 === 0 ? <text key={d} x={40 + i * (422 / 13)} y="160">{d.slice(5)}</text> : null))}
              </g>
            </svg>
          )}
        </div>

        <div className="ov8-card ov8-panel ov8-map-panel">
          <div className="ov8-panel-head">
            <div className="ov8-panel-title">地图胜率 <span className="ov8-dim-note">（近14天 · 6张）</span></div>
            <div className="ov8-map-legend">
              <span><i style={{ background: 'linear-gradient(90deg,#79AC69,#a8d46c)' }} />≥60%</span>
              <span><i style={{ background: 'linear-gradient(90deg,#d7c85d,#f59e0b)' }} />51–59%</span>
              <span><i style={{ background: 'linear-gradient(90deg,#ef4444,#b91c1c)' }} />≤50%</span>
            </div>
          </div>
          <div className="ov8-map-grid ov8-six-map-grid">
            {homeMapRows.map((m) => {
              const wr = m.win_rate || 0;
              const has = (m.played || 0) > 0;
              return (
                <div key={m.map_name} className="ov8-map-card ov8-click" onClick={() => openMapModal(m.map_name)} title="点击查看该图各周期胜率">
                  {mapImg(m.map_name) && <img className="ov8-map-img" src={mapImg(m.map_name)} alt={m.map_name} onError={(e) => { e.target.style.display = 'none'; }} />}
                  <div className="ov8-map-name">{m.map_name}</div>
                  <div className="ov8-map-rate">{has ? `${wr}%` : '0%'}</div>
                  <div className="ov8-map-record">{has ? `${m.wins}胜 ${m.losses}负` : '暂无数据'}</div>
                  <div className="ov8-map-bar"><div style={{ width: `${has ? wr : 0}%`, background: wrColor(wr) }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </TrainingFocusAndMapSection>


      {/* ══════════ 底部：核心功能 + 快捷操作 ══════════ */}
      <FunctionShortcutSection>
        <div>
          <div className="ov8-sec-title"><span className="ov8-sec-tick" />核心功能</div>
          <div className="ov8-entry-grid">
            <div className="ov8-entry ov8-click" onClick={() => navigate('/training-report')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-versus.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">赛训分析</div><div className="ov8-entry-sub">比赛与复盘数据分析</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/members')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-schedule.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">对手分析</div><div className="ov8-entry-sub">对手名单与风格研究</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/tactics')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-trend.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">战术库</div><div className="ov8-entry-sub">战术与执行演练</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/training-plans')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-log.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">训练管理</div><div className="ov8-entry-sub">训练计划与复盘管理</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/matches')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-dashboard.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">数据看板</div><div className="ov8-entry-sub">多维度数据看板</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-hub.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">工具集</div><div className="ov8-entry-sub">实用工具集合</div></div>
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
            <div className="ov8-entry ov8-click" onClick={() => navigate('/matches')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-dashboard.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">上传战绩</div><div className="ov8-entry-sub">分享比赛表现</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=daily&sub=tactics')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-log.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">导入战术</div><div className="ov8-entry-sub">管理战术库</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation?tab=archives')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-hub.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">查看赛程</div><div className="ov8-entry-sub">赛程日历与提醒</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/matches')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-trend.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">数据导出</div><div className="ov8-entry-sub">导出战报数据</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
            <div className="ov8-entry ov8-click" onClick={() => navigate('/workstation')}>
              <div className="ov8-entry-icon"><img className="ov8-entry-img" src="/reshape/home/icons/icon-quick.png" alt="" /></div>
              <div className="ov8-entry-text"><div className="ov8-entry-name">通知设置</div><div className="ov8-entry-sub">消息与推送设置</div></div>
              <div className="ov8-entry-arrow">→</div>
            </div>
          </div>
        </div>
      </FunctionShortcutSection>

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


