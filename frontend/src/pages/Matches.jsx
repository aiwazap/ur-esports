import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';

/* ── 常量 ── */
const MATCH_TYPES = [
  { key: 'scrim', label: '训练赛', color: 'var(--accent-cyan)' },
  { key: 'official', label: '正式赛', color: '#D4AF37' },
  { key: 'all', label: '全部', color: '#eef6ff' },
];

const DATE_TABS = [
  { label: '昨天',   val: 'yesterday' },
  { label: '今天',   val: 'today' },
  { label: '近7天',  val: 7 },
  { label: '近30天', val: 30 },
  { label: '自定义', val: -1 },
];

const MAP_COLORS = {
  Mirage: '#f59e0b', Dust2: '#ef4444', Inferno: '#22d3ee', Nuke: '#10b981',
  Ancient: '#6366f1', Anubis: '#a855f7', Overpass: '#fb923c', Vertigo: '#84cc16', Train: '#ec4899',
  Cache: '#14b8a6', Office: '#eab308', Italy: '#f472b6',
};

const BO_COLORS = {
  BO1: { bg: 'rgba(212,175,55,0.12)', text: '#D4AF37', border: 'rgba(212,175,55,0.3)' },
  BO3: { bg: 'rgba(83,121,255,0.12)', text: '#5379ff', border: 'rgba(83,121,255,0.3)' },
  BO5: { bg: 'rgba(255,89,125,0.12)', text: '#ff597d', border: 'rgba(255,89,125,0.3)' },
};

/* ── 主组件 ── */
export default function Matches() {
  const [data, setData] = useState({ groups: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [matchType, setMatchType] = useState('scrim');
  const [search, setSearch] = useState('');
  const [mapFilter, setMapFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [resultFilter, setResultFilter] = useState(null);  // 10a: 胜负平筛选
  const [availableMaps, setAvailableMaps] = useState([]);
  const [upcoming, setUpcoming] = useState([]); // 即将开赛 / 对手分析
  const searchTimer = useRef(null);
  const [focusTid, setFocusTid] = useState(null); // 从赛事管理跳转来 ?tournament=<id> 时自动展开该赛事

  // 读取 URL ?tournament=<id>：自动切到正式赛 + 记录要展开的赛事
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('tournament');
    if (tid) {
      setMatchType('official');
      setFocusTid(tid);
    }
    if (params.get('tab') === 'official') setMatchType('official');
  }, []);

  const useCustomDate = days === -1;

  // 加载数据
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { matchType };
      if (useCustomDate) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      } else if (days === 'today' || days === 'yesterday') {
        const d = new Date(); d.setDate(d.getDate() - (days === 'yesterday' ? 1 : 0));
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        params.dateFrom = iso; params.dateTo = iso;
      } else {
        params.days = days;
      }
      if (search) params.search = search;
      if (mapFilter) params.map = mapFilter;

      const { data: res } = await api.get('/matches/grouped', { params });
      setData(res);
    } catch { /* silently handle */ }
    setLoading(false);
  }, [days, matchType, useCustomDate, dateFrom, dateTo, search, mapFilter]);

  // 初始化加载
  useEffect(() => {
    load();
    api.get('/matches/maps').then(({ data: maps }) => setAvailableMaps(maps || [])).catch(() => {});
    api.get('/admin/upcoming').then(({ data: ups }) => setUpcoming(ups || [])).catch(() => {});
  }, []);

  // 筛选变化时重新加载（搜索带防抖）
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [days, matchType, mapFilter, dateFrom, dateTo, useCustomDate]);

  // 搜索即时防抖
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(), 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const { groups, stats } = data;

  // 即将开赛（正式赛 + 今天及以后）→ 对手分析卡
  const _today = new Date().toISOString().slice(0, 10);
  const upMatches = (upcoming || [])
    .filter(m => m.match_type === 'official' && (m.match_date || '') >= _today)
    .sort((a, b) => ((a.match_date || '') + (a.match_time || '')).localeCompare((b.match_date || '') + (b.match_time || '')));

  // 胜负平筛选（按地图）：显示含有该结果地图的对阵
  const shownGroups = resultFilter
    ? groups.filter(g => (g.maps || []).some(m => m.result === resultFilter))
    : groups;

  // 需求③：正式赛标签下，把比赛按"赛事"分组（赛事 → 该赛事下多场比赛）
  const tournamentGroups = (() => {
    if (matchType !== 'official') return null;
    const byTour = {};
    const order = [];
    for (const g of shownGroups) {
      const tid = g.tournament_id || 'none';
      if (!byTour[tid]) {
        byTour[tid] = {
          tournament_id: g.tournament_id,
          tournament_name: g.tournament_name || '未归类赛事',
          tournament_bo: g.tournament_bo || '',
          matches: [],
        };
        order.push(tid);
      }
      byTour[tid].matches.push(g);
    }
    return order.map(tid => byTour[tid]);
  })();

  return (
    <div className="w-full">
      {/* ── 标题 ── */}
      <h2 className="font-display text-2xl font-bold text-white mb-1">近期比赛</h2>
      <p className="text-gray-500 text-sm mb-5">
        {matchType === 'scrim' ? '训练赛' : matchType === 'official' ? '正式赛' : '全部比赛'} · 点击展开地图详情
      </p>

      {/* ── 即将开赛 · 对手分析 ── */}
      {upMatches.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-5 rounded" style={{ background: '#D4AF37' }} />
            <h3 className="text-white font-bold text-base">⚔️ 即将开赛 · 对手分析</h3>
            <span className="text-xs text-gray-600">{upMatches.length} 场</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upMatches.map(m => <UpcomingCard key={m.id} m={m} />)}
          </div>
        </div>
      )}

      {/* ── 比赛类型 Tab ── */}
      <div className="flex gap-2 mb-4">
        {MATCH_TYPES.map(t => (
          <button key={t.key} onClick={() => { setMatchType(t.key); setSelected(null); setResultFilter(null); }}
            className="relative px-4 py-1.5 text-sm font-display rounded-lg transition-all duration-200"
            style={{
              background: matchType === t.key ? `${t.color}15` : 'var(--ur-card)',
              color: matchType === t.key ? t.color : '#8494a8',
              border: `1px solid ${matchType === t.key ? t.color + '40' : 'var(--glass-border)'}`,
              boxShadow: matchType === t.key ? `0 0 16px ${t.color}18` : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 筛选栏 ── */}
      <FilterBar
        search={search} onSearch={setSearch}
        mapFilter={mapFilter} onMapFilter={setMapFilter}
        maps={availableMaps}
        days={days} onDays={setDays}
        dateFrom={dateFrom} onDateFrom={setDateFrom}
        dateTo={dateTo} onDateTo={setDateTo}
      />

      {/* ── 统计横幅 ── */}
      <div className="mt-5">
        {stats && stats.totalMaps > 0 && <StatsBar stats={stats} resultFilter={resultFilter} onFilter={setResultFilter} matchType={matchType} />}
      </div>

      {/* ── 比赛列表 ── */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
              <span className="text-gray-500 text-sm">加载中...</span>
            </div>
          </div>
        ) : shownGroups.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-30">⚔️</div>
            <p className="text-gray-500 text-sm">{resultFilter ? '该结果下暂无对阵' : '暂无比赛数据'}</p>
            <p className="text-gray-600 text-xs mt-1">切换筛选条件或比赛类型试试</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matchType === 'official' && tournamentGroups ? (
              // 正式赛：按赛事分组展示，点赛事展开看比赛
              tournamentGroups.map((tg, ti) => (
                <TournamentGroup key={`${tg.tournament_id || 'none'}-${ti}`} tg={tg}
                  selected={selected} setSelected={setSelected} onSaved={() => load()}
                  defaultOpen={focusTid != null && String(tg.tournament_id) === String(focusTid)} />
              ))
            ) : (
              // 训练赛/全部：直接列比赛
              shownGroups.map((g, gi) => (
                <MatchCard key={`${g.key}-${gi}`} group={g}
                  selected={selected?.key === g.key}
                  onClick={() => setSelected(selected?.key === g.key ? null : g)}
                  onSaved={() => load()} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 即将开赛 · 对手分析卡 ── */
function UpcomingCard({ m }) {
  const rank = m.opponent_rank ? String(m.opponent_rank).replace(/^#/, '') : null;
  const loc = { online: '线上', offline: '线下', hybrid: '混合' }[m.location_type] || m.location_type || '';
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: 'rgba(212,175,55,0.25)', background: 'linear-gradient(180deg, rgba(212,175,55,0.06), rgba(11,17,28,0.55))' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-white font-bold text-base truncate">{m.event_name || '未命名赛事'}</div>
          {m.stage && <span className="text-[11px]" style={{ color: 'rgba(212,175,55,0.85)' }}>{m.stage}</span>}
        </div>
        {m.bo_format && <span className="shrink-0 text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>{m.bo_format}</span>}
      </div>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="text-gray-500 text-xs">对手</span>
        <span className="text-white font-semibold text-lg">{m.opponent}</span>
        {rank && <span className="text-[11px] px-1.5 py-0.5 rounded border" style={{ background: 'rgba(244,63,94,0.15)', color: '#fda4af', borderColor: 'rgba(251,113,133,0.3)' }}>VRS #{rank}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-2">
        <span>📅 {m.match_date}{m.match_time ? ' ' + m.match_time : ''}</span>
        {loc && <span>📍 {loc}</span>}
        {m.region && <span>🌐 {m.region}</span>}
        {m.signup_deadline && <span style={{ color: '#fbbf24' }}>报名截止 {m.signup_deadline}</span>}
        {m.signup_method && <span>报名 {m.signup_method}</span>}
      </div>
      {m.notes && <div className="text-xs text-gray-500 mb-2 whitespace-pre-wrap">{m.notes}</div>}
      {m.source_link && (
        <a href={m.source_link} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#D4AF37]/10"
          style={{ borderColor: 'rgba(212,175,55,0.4)', color: '#D4AF37' }}>
          🔗 对手详情 / BP / 熟练图(HLTV · Liquipedia)
        </a>
      )}
    </div>
  );
}

/* ── 统计横幅 ── */
function StatsBar({ stats, resultFilter, onFilter, matchType }) {
  const cntLabel = matchType === 'official' ? '正赛场次' : matchType === 'all' ? '总场次' : '训练场次';
  const cards = [
    { label: cntLabel, value: stats.totalMatches, color: '#D4AF37' },
    { label: '胜',      value: stats.totalWins,   color: '#35e59d', filter: 'win'  },
    { label: '负',      value: stats.totalLosses, color: '#ff597d', filter: 'loss' },
    { label: '平',      value: stats.totalDraws,  color: '#f97316', filter: 'draw' },
    { label: '胜率', value: `${stats.winRate}%`, color: '#68e8ff',
      sub: stats.totalMaps > 0 ? `${stats.totalWins}/${stats.totalMaps}` : '-', rate: stats.winRate },
  ];

  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {cards.map((c, i) => {
        const clickable = !!c.filter;
        const active = clickable && resultFilter === c.filter;
        return (
          <div key={i}
            onClick={clickable ? () => onFilter(active ? null : c.filter) : undefined}
            className={`relative overflow-hidden rounded-xl p-3.5 animate-fade-up ${clickable ? 'cursor-pointer' : ''} transition-all duration-200`}
            style={{
              background: active
                ? `linear-gradient(180deg, ${c.color}22, ${c.color}08), rgba(11,17,28,0.85)`
                : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), rgba(11,17,28,0.85)',
              border: `1px solid ${active ? c.color + '66' : c.color + '18'}`,
              boxShadow: active ? `0 0 20px ${c.color}26` : 'none',
              animationDelay: `${i * 80}ms`,
              backdropFilter: 'blur(12px)',
            }}>
            {/* 顶部色条 */}
            <div className="absolute top-0 left-3 right-3 h-px rounded-full opacity-40"
              style={{ background: `linear-gradient(90deg, transparent, ${c.color}, transparent)` }} />
            {/* 点击筛选提示: 右上角绝对定位, 不影响主居中布局 */}
            {clickable && (
              <span className="absolute right-3 top-3 text-[10px] font-display"
                style={{ color: active ? c.color : '#5a6a85' }}>
                {active ? '筛选中 ✕' : '点击筛选'}
              </span>
            )}
            <div className="text-center">
              <div className="text-sm font-display font-semibold tracking-wide mb-1.5"
                style={{ color: c.color }}>{c.label}</div>
              <div className="text-4xl font-bold font-display" style={{ color: c.color }}>{c.value}</div>
              <div className="text-gray-600 text-xs mt-0.5 h-4">{c.sub || ''}</div>
            </div>
            {c.rate != null && c.rate > 0 && (
              <div className="mt-2 h-0.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 animate-grow"
                  style={{ width: `${c.rate}%`, background: `linear-gradient(90deg, ${c.color}80, ${c.color})` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 筛选栏 ── */
function FilterBar({ search, onSearch, mapFilter, onMapFilter, maps, days, onDays, dateFrom, onDateFrom, dateTo, onDateTo }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* 日期快捷选择 */}
      <div className="flex gap-1.5">
        {DATE_TABS.map(t => (
          <button key={t.label} onClick={() => onDays(t.val)}
            className={`px-3 py-1.5 text-xs font-display rounded-lg transition-all duration-200 ${
              days === t.val
                ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30'
                : 'bg-ur-card text-gray-500 border border-ur-border hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 自定义日期范围 */}
      {days === -1 && (
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)}
            className="bg-ur-card border border-ur-border text-white text-xs rounded-lg px-2.5 py-1.5 w-34
                       focus:border-[#D4AF37]/40 focus:outline-none [color-scheme:dark]"
            placeholder="起始" />
          <span className="text-gray-600 text-xs">至</span>
          <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)}
            className="bg-ur-card border border-ur-border text-white text-xs rounded-lg px-2.5 py-1.5 w-34
                       focus:border-[#D4AF37]/40 focus:outline-none [color-scheme:dark]"
            placeholder="结束" />
        </div>
      )}

      {/* 分隔 */}
      <div className="w-px h-6 bg-ur-border/60 hidden sm:block" />

      {/* 搜索框 */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="搜索对手..."
          className="bg-ur-card border border-ur-border text-white text-xs rounded-lg pl-8 pr-3 py-1.5 w-40
                     focus:border-[#D4AF37]/40 focus:outline-none placeholder-gray-600" />
      </div>

      {/* 地图筛选 */}
      <select value={mapFilter} onChange={e => onMapFilter(e.target.value)}
        className="bg-ur-card border border-ur-border text-gray-300 text-xs rounded-lg px-2.5 py-1.5
                   focus:border-[#D4AF37]/40 focus:outline-none appearance-none cursor-pointer
                   bg-no-repeat pr-7"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238494a8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 8px center' }}>
        <option value="">全部地图</option>
        {maps.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

/* ── 比赛卡片 ── */
/* ── 赛事分组卡片（需求③：正式赛按赛事分组，点击展开看该赛事比赛）── */
function TournamentGroup({ tg, selected, setSelected, onSaved, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  // 从赛事管理跳转来时自动展开并滚动定位到本赛事
  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
      setTimeout(() => { rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
    }
  }, [defaultOpen]);
  // 赛事内多场比赛按日期降序; 同日按id降序(最后打的在最上面)
  const sortedMatches = [...(tg.matches || [])].sort((a, b) => {
    const d = (b.match_date || '').localeCompare(a.match_date || '');
    if (d !== 0) return d;
    return (b._maxId || 0) - (a._maxId || 0);
  });
  // 该赛事下的比赛日期范围
  const dates = tg.matches.map(m => m.match_date).filter(Boolean).sort();
  const dateRange = dates.length
    ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`)
    : '';
  // 该赛事涉及的阶段名（去重）
  const stages = [...new Set(tg.matches.map(m => m.stage_name).filter(Boolean))];

  return (
    <div ref={rootRef} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.22)', background: 'rgba(212,175,55,0.04)' }}>
      {/* 赛事头部：名称 + 阶段 + 赛制 + 日期，点击展开/收起 */}
      <div onClick={() => setOpen(!open)} className="cursor-pointer px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
        <span className="text-xl">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-base font-bold text-white">{tg.tournament_name}</span>
            {tg.tournament_bo && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}>{tg.tournament_bo}</span>
            )}
            {tg.matches.some(m => m.tournament_is_finished === 1 || m.tournament_is_finished === '1') ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(132,148,168,0.18)', color: '#9aa6b8', border: '1px solid rgba(132,148,168,0.3)' }}>已结束</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(53,229,157,0.15)', color: '#35e59d', border: '1px solid rgba(53,229,157,0.3)' }}>进行中</span>
            )}
            <span className="text-xs text-gray-500">· {tg.matches.length} 场比赛</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
            {stages.length > 0 && <span className="text-[#D4AF37]/80">{stages.join(' / ')}</span>}
            {dateRange && <span>· {dateRange}</span>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {/* 展开后：该赛事下的比赛列表（点击单场再展开地图/选手详情） */}
      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {sortedMatches.map((g, gi) => (
            <MatchCard key={`${g.key}-${gi}`} group={g}
              selected={selected?.key === g.key}
              onClick={() => setSelected(selected?.key === g.key ? null : g)}
              onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ group, selected, onClick, onSaved }) {
  const maps = group.maps || [];
  const totalW = maps.filter(m => m.result === 'win').length;
  const totalL = maps.filter(m => m.result === 'loss').length;
  const totalD = maps.filter(m => m.result === 'draw').length;

  return (
    <div className="relative rounded-xl overflow-hidden transition-all duration-300 animate-fade-up"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015)), rgba(11,17,28,0.8)',
        border: selected ? '1px solid rgba(212,175,55,0.25)' : '1px solid var(--glass-border)',
        backdropFilter: 'blur(14px)',
        boxShadow: selected ? '0 0 32px rgba(212,175,55,0.08)' : '0 8px 32px rgba(0,0,0,0.2)',
      }}>

      {/* ── 卡片头部 ── */}
      <div onClick={onClick}
        className="grid items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-all group"
        style={{ gridTemplateColumns: '56px 100px 168px 1fr auto 132px 20px' }}>

        {/* 类型 */}
        <span className="justify-self-start text-xs px-1.5 py-0.5 rounded font-display whitespace-nowrap"
          style={{
            background: group.match_type === 'official' ? 'rgba(212,175,55,0.12)' : 'rgba(104,232,255,0.08)',
            color: group.match_type === 'official' ? '#D4AF37' : '#68e8ff',
            border: `1px solid ${group.match_type === 'official' ? 'rgba(212,175,55,0.2)' : 'rgba(104,232,255,0.15)'}`,
          }}>
          {group.match_type === 'official' ? '正式赛' : '训练赛'}
        </span>

        {/* 日期 */}
        <span className="text-gray-500 text-xs font-mono whitespace-nowrap">{group.match_date}</span>

        {/* 对手 */}
        <span className="min-w-0 truncate font-display text-base font-bold text-white group-hover:text-[#D4AF37] transition-colors">
          {group.opponent}
        </span>

        {/* 弹性间距 1 */}
        <div />

        {/* 全部地图（按胜负着色）— 循环显示，支持BO3三张+ */}
        <div className="flex items-center gap-2 justify-self-end flex-wrap">
          {maps.map((mp, mi) => (
            <span key={mi} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap"
              style={{ background: mp.result === 'win' ? 'rgba(53,229,157,0.10)' : mp.result === 'loss' ? 'rgba(255,89,125,0.10)' : 'rgba(249,115,22,0.10)', color: mp.result === 'win' ? '#35e59d' : mp.result === 'loss' ? '#ff597d' : '#f97316', border: `1px solid ${mp.result === 'win' ? 'rgba(53,229,157,0.28)' : mp.result === 'loss' ? 'rgba(255,89,125,0.28)' : 'rgba(249,115,22,0.28)'}` }}>
              <span className="font-display text-[11px]">{mp.map_name}</span>
              <span>{mp.our_score}-{mp.their_score}</span>
            </span>
          ))}
        </div>

        {/* 汇总：图数 + 地图胜负平 */}
        <div className="flex items-center gap-2 justify-self-end whitespace-nowrap font-mono text-xs">
          <span className="text-gray-600">{maps.length}图</span>
          <span style={{ color: '#35e59d' }}>{totalW}W</span>
          <span style={{ color: '#ff597d' }}>{totalL}L</span>
          <span style={{ color: '#f97316' }}>{totalD}D</span>
        </div>

        {/* 箭头 */}
        <svg className={`justify-self-end w-4 h-4 text-gray-600 transition-transform duration-300 ${selected ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* ── 展开详情 ── */}
      {selected && <MatchDetail group={group} onSaved={onSaved} />}
    </div>
  );
}

/* ── n位数格式化 ── */
const n = (v, d) => (v != null ? Number(v).toFixed(d) : '-');

/* ── 选手 UR Rating (3.0 风格内部评分, 不冒充 HLTV)
   公式: 0.40 × (KPR/0.68) + 0.30 × (2 − DPR/0.68) + 0.30 × (ADR/80)
   基准: KPR 0.68 / DPR 0.68 / ADR 80 时输出 = 1.00 (平均水平)
   均值 ≈ 1.0, 优秀 ≥ 1.2, 顶级 ≥ 1.4
   注: 简化版 (没有 assists/entry/clutch/multikill 字段)
       完整版需扩 player_stats 表 ── */
function calcRating(p, rounds) {
  const [k, d] = (p?.kd || '0-0').split('-').map(Number);
  const adr = p?.adr || 0;
  if (k === 0 && d === 0 && adr === 0) return 0;
  // 回合数兜底: 没传或 0 时用 24 (训练赛标准每图 12+12)
  const r = rounds && rounds > 0 ? rounds : 24;
  const kpr = k / r;
  const dpr = d / r;
  const adrScore = adr / 80;
  // 三项加权 (DPR 反向: 死越少越好, 基准 = 1.0)
  const rating = 0.40 * (kpr / 0.68) + 0.30 * (2 - dpr / 0.68) + 0.30 * adrScore;
  return Math.max(0, rating);
}

/* ── 地图详情面板 ── */
function MatchDetail({ group, onSaved }) {
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ t_score: 0, ct_score: 0, pistol_rounds: '' });
  const [saving, setSaving] = useState(false);
  const [activeMapIdx, setActiveMapIdx] = useState(0);   // 10b: 当前查看的地图（默认图1=我方选图）
  const maps = group.maps || [];
  const activeMap = maps[activeMapIdx] || maps[0] || null;
  const activePlayers = [...(activeMap?.players || [])]
    .filter(p => {  // 数据全为 0 的不显示（教练/领队/观察者）
      const [k, d] = (p.kd || '0-0').split('-').map(Number);
      return (p.adr || 0) > 0 || k > 0 || d > 0;
    })
    .map(p => ({
      ...p,
      // 优先用库里填写的真实 rating（正赛手填）；没有则按回合实时计算（训练赛）
      _rating: (p.rating != null && p.rating !== '' && Number(p.rating) > 0)
        ? Number(p.rating)
        : calcRating(p, (activeMap?.our_score || 0) + (activeMap?.their_score || 0))
    }))
    .sort((a, b) => b._rating - a._rating);

  const startEdit = (m) => {
    setEditId(m.id);
    setEditForm({
      t_score: m.t_score || 0,
      ct_score: m.ct_score || 0,
      pistol_rounds: m.pistol_rounds || '',
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await api.put(`/matches/${editId}`, editForm);
      setEditId(null);
      onSaved();
    } catch { /* silently handle */ }
    setSaving(false);
  };

  return (
    <div className="border-t border-white/5 px-4 py-3 text-sm animate-fade-up">
      {/* ═══ 选手数据（按地图切换：我方选图 / 对方选图）═══ */}
      {maps.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h4 className="font-display text-xs font-semibold text-gray-500 tracking-wide uppercase mr-1">选手数据</h4>
            {maps.map((m, i) => {
              const on = activeMapIdx === i;
              const pickLabel = i === 0 ? '我方选图' : '对方选图';
              const pickColor = i === 0 ? '#68e8ff' : '#ff9d5c';
              return (
                <button key={i} onClick={() => setActiveMapIdx(i)}
                  className="px-2.5 py-1 rounded-lg text-xs font-display transition-all"
                  style={{
                    background: on ? `${pickColor}1f` : 'var(--ur-card)',
                    color: on ? pickColor : '#8494a8',
                    border: `1px solid ${on ? pickColor + '55' : 'var(--glass-border)'}`,
                  }}>
                  {pickLabel} · {m.map_name}
                </button>
              );
            })}
          </div>
          {activePlayers.length > 0 ? (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-600 text-xs border-b border-white/5">
                  <th className="text-left py-2 font-medium">选手</th>
                  <th className="text-right py-2 font-medium w-[70px]">杀</th>
                  <th className="text-right py-2 font-medium w-[70px]">死</th>
                  <th className="text-right py-2 font-medium w-[70px]">助攻</th>
                  <th className="text-right py-2 font-medium w-[90px]">ADR</th>
                  <th className="text-right py-2 font-medium w-[90px] pr-3">Rating</th>
                </tr>
              </thead>
              <tbody>
                {activePlayers.map(p => (
                    <tr key={p.name} className="border-b border-white/5">
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-xs font-display text-[#D4AF37]">
                            {p.name[0]}
                          </div>
                          <div>
                            <span className="font-display text-white text-xs">{p.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.kills != null ? p.kills : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.deaths != null ? p.deaths : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.assists != null ? p.assists : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{n(p.adr, 1)}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300 pr-3">{p.rating != null && p.rating !== '' ? Number(p.rating).toFixed(2) : '-'}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="text-center py-6 text-gray-600 text-xs mb-4">该地图暂无选手数据</div>
          )}
        </>
      )}

      {/* ═══ 对手选手数据（当前地图）═══ 完全照录入字段: 选手|杀|死|助攻|ADR|Rating */}
      {(() => {
        let oppList = [];
        try {
          const raw = activeMap?.opponent_players;
          if (raw) oppList = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch { oppList = []; }
        if (!Array.isArray(oppList) || oppList.length === 0) return null;
        const oppRows = oppList.map(p => ({ ...p, _r: (p.rating != null && p.rating !== '') ? Number(p.rating) : 0 }))
          .sort((a, b) => b._r - a._r);
        return (
          <div className="mb-4">
            <h4 className="font-display text-xs font-semibold text-gray-500 mb-3 tracking-wide uppercase">
              对手选手数据 · {activeMap?.map_name || ''}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 text-xs border-b border-white/5">
                    <th className="text-left py-2 font-medium">选手</th>
                    <th className="text-right py-2 font-medium w-[70px]">杀</th>
                    <th className="text-right py-2 font-medium w-[70px]">死</th>
                    <th className="text-right py-2 font-medium w-[70px]">助攻</th>
                    <th className="text-right py-2 font-medium w-[90px]">ADR</th>
                    <th className="text-right py-2 font-medium w-[90px] pr-3">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {oppRows.map((p, pi) => (
                    <tr key={pi} className="border-b border-white/5">
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#ff9d5c]/15 flex items-center justify-center text-xs font-display text-[#ff9d5c]">
                            {(p.name || p.nickname || '?')[0]}
                          </div>
                          <span className="font-display text-white text-xs">{p.name || p.nickname || '-'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.kills != null ? p.kills : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.deaths != null ? p.deaths : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.assists != null ? p.assists : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.adr != null ? Number(p.adr).toFixed(1) : '-'}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300 pr-3">{p.rating != null && p.rating !== '' ? Number(p.rating).toFixed(2) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ═══ 地图数据 ═══ */}
      <h4 className="font-display text-xs font-semibold text-gray-500 mb-3 tracking-wide uppercase">地图数据</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-600 text-xs border-b border-white/5">
              <th className="text-left py-2 font-medium">地图</th>
              <th className="text-center py-2 font-medium">比分</th>
              <th className="text-center py-2 font-medium">T得分</th>
              <th className="text-center py-2 font-medium">CT得分</th>
              <th className="text-center py-2 font-medium">手枪局</th>
              <th className="text-center py-2 font-medium">结果</th>
              <th className="text-right py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {maps.map(m => (
              editId === m.id ? (
                <tr key={m.id} className="border-b border-white/5 bg-white/[0.02]">
                  <td className="py-2.5 pl-3">
                    <span className="font-display text-white">{m.map_name}</span>
                  </td>
                  <td className="py-2.5 text-center font-mono" style={{ color: m.result === 'win' ? '#35e59d' : m.result === 'loss' ? '#ff597d' : '#f97316' }}>{m.our_score}-{m.their_score}</td>
                  <td className="py-2.5 text-center">
                    <input type="number" min="0" value={editForm.t_score}
                      onChange={e => setEditForm({...editForm, t_score: Number(e.target.value)})}
                      className="w-14 bg-ur-card border border-[#D4AF37]/30 text-white text-center rounded px-1.5 py-0.5 text-sm
                                 focus:border-[#D4AF37]/60 focus:outline-none" />
                  </td>
                  <td className="py-2.5 text-center">
                    <input type="number" min="0" value={editForm.ct_score}
                      onChange={e => setEditForm({...editForm, ct_score: Number(e.target.value)})}
                      className="w-14 bg-ur-card border border-[#D4AF37]/30 text-white text-center rounded px-1.5 py-0.5 text-sm
                                 focus:border-[#D4AF37]/60 focus:outline-none" />
                  </td>
                  <td className="py-2.5 text-center">
                    <input type="text" value={editForm.pistol_rounds}
                      onChange={e => setEditForm({...editForm, pistol_rounds: e.target.value})}
                      placeholder="W/L"
                      className="w-16 bg-ur-card border border-[#D4AF37]/30 text-white text-center rounded px-1.5 py-0.5 text-sm
                                 focus:border-[#D4AF37]/60 focus:outline-none placeholder-gray-700" />
                  </td>
                  <td className="py-2.5 text-center">
                    <span className={`tag text-xs ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                      {m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right pr-3">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-2.5 py-0.5 text-xs bg-[#D4AF37] text-black rounded hover:bg-[#D4AF37]/80 font-display font-semibold transition-colors">
                        保存
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-2.5 py-0.5 text-xs bg-white/5 text-gray-400 rounded hover:bg-white/10 transition-colors">
                        取消
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  onClick={() => startEdit(m)}>
                  <td className="py-2.5 pl-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{
                        backgroundColor: MAP_COLORS[m.map_name] || '#8494a8',
                      }} />
                      <span className="font-display text-white">{m.map_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-center font-mono" style={{ color: m.result === 'win' ? '#35e59d' : m.result === 'loss' ? '#ff597d' : '#f97316' }}>{m.our_score}-{m.their_score}</td>
                  <td className="py-2.5 text-center font-mono text-gray-500">{m.t_score || '-'}</td>
                  <td className="py-2.5 text-center font-mono text-gray-500">{m.ct_score || '-'}</td>
                  <td className="py-2.5 text-center text-gray-500 text-xs">{m.pistol_rounds || '-'}</td>
                  <td className="py-2.5 text-center">
                    <span className={`tag text-xs ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                      {m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right pr-3">
                    <button onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                      className="px-2 py-0.5 text-xs text-gray-600 hover:text-[#D4AF37] transition-colors">
                      编辑
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


