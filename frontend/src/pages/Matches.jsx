import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';

/* ── 常量 ── */
const MATCH_TYPES = [
  { key: 'scrim', label: '训练赛', color: 'var(--accent-cyan)' },
  { key: 'official', label: '正式赛', color: '#D4AF37' },
  { key: 'all', label: '全部', color: '#eef6ff' },
];

const DATE_TABS = [
  { label: '3天', days: 3 },
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
  { label: '自定义', days: -1 },
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
  const [availableMaps, setAvailableMaps] = useState([]);
  const searchTimer = useRef(null);

  const useCustomDate = days === -1;

  // 加载数据
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { matchType };
      if (useCustomDate) {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
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

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── 标题 ── */}
      <h2 className="font-display text-2xl font-bold text-white mb-1">近期比赛</h2>
      <p className="text-gray-500 text-sm mb-5">
        {matchType === 'scrim' ? '训练赛' : matchType === 'official' ? '正式赛' : '全部比赛'} · 点击展开地图详情
      </p>

      {/* ── 统计横幅 ── */}
      {stats && stats.totalMaps > 0 && <StatsBar stats={stats} matchType={matchType} />}

      {/* ── 比赛类型 Tab ── */}
      <div className="flex gap-2 mb-4">
        {MATCH_TYPES.map(t => (
          <button key={t.key} onClick={() => { setMatchType(t.key); setSelected(null); }}
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

      {/* ── 比赛列表 ── */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
              <span className="text-gray-500 text-sm">加载中...</span>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 opacity-30">⚔️</div>
            <p className="text-gray-500 text-sm">暂无比赛数据</p>
            <p className="text-gray-600 text-xs mt-1">切换筛选条件或比赛类型试试</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g, gi) => (
              <MatchCard key={`${g.key}-${gi}`} group={g}
                selected={selected?.key === g.key}
                onClick={() => setSelected(selected?.key === g.key ? null : g)}
                onSaved={() => load()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 统计横幅 ── */
function StatsBar({ stats, matchType }) {
  const cards = [
    { label: '比赛场次', value: stats.totalMatches, sub: `${stats.matchWins}W ${stats.matchLosses}L`,
      rate: stats.matchWinRate, color: '#D4AF37' },
    { label: '总地图数', value: stats.totalMaps, sub: `${stats.totalWins}W ${stats.totalLosses}L ${stats.totalDraws}D`,
      rate: stats.winRate, color: '#68e8ff' },
    { label: '地图胜率', value: `${stats.winRate}%`,
      sub: stats.totalMaps > 0 ? `${stats.totalWins}/${stats.totalMaps}` : '-', rate: stats.winRate, color: '#35e59d' },
    { label: '交战对手', value: stats.uniqueOpponents,
      sub: stats.periodDays > 0 ? `近${stats.periodDays}天` : '自定义范围', rate: null, color: '#8b5cff' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {cards.map((c, i) => (
        <div key={i} className="relative overflow-hidden rounded-xl p-3.5 animate-fade-up"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), rgba(11,17,28,0.85)',
            border: `1px solid ${c.color}18`,
            animationDelay: `${i * 80}ms`,
            backdropFilter: 'blur(12px)',
          }}>
          {/* 顶部色条 */}
          <div className="absolute top-0 left-3 right-3 h-px rounded-full opacity-40"
            style={{ background: `linear-gradient(90deg, transparent, ${c.color}, transparent)` }} />
          <div className="text-gray-500 text-xs mb-1 font-display tracking-wide">{c.label}</div>
          <div className="text-xl font-bold font-display" style={{ color: c.color }}>
            {c.value}
          </div>
          <div className="text-gray-600 text-xs mt-0.5">{c.sub}</div>
          {c.rate !== null && c.rate > 0 && (
            <div className="mt-2 h-0.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 animate-grow"
                style={{ width: `${c.rate}%`, background: `linear-gradient(90deg, ${c.color}80, ${c.color})` }} />
            </div>
          )}
        </div>
      ))}
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
          <button key={t.label} onClick={() => onDays(t.days)}
            className={`px-3 py-1.5 text-xs font-display rounded-lg transition-all duration-200 ${
              days === t.days
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
function MatchCard({ group, selected, onClick, onSaved }) {
  const maps = group.maps || [];
  const totalW = maps.filter(m => m.result === 'win').length;
  const totalL = maps.filter(m => m.result === 'loss').length;
  const bo = group.bo || 'BO1';
  const boColor = BO_COLORS[bo] || BO_COLORS.BO1;
  const isWin = totalW > totalL;
  const isLoss = totalL > totalW;
  const statusColor = isWin ? '#35e59d' : isLoss ? '#ff597d' : '#ffc45c';
  const statusIcon = isWin ? '✅' : isLoss ? '❌' : '➖';

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
        className="flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-all group">

        {/* BO 徽章 */}
        <div className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-display text-xs font-bold"
          style={{ background: boColor.bg, color: boColor.text, border: `1px solid ${boColor.border}` }}>
          {bo}
        </div>

        {/* 对手信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-white group-hover:text-[#D4AF37] transition-colors">
              {group.opponent}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded font-display"
              style={{
                background: group.match_type === 'official' ? 'rgba(212,175,55,0.12)' : 'rgba(104,232,255,0.08)',
                color: group.match_type === 'official' ? '#D4AF37' : '#68e8ff',
                border: `1px solid ${group.match_type === 'official' ? 'rgba(212,175,55,0.2)' : 'rgba(104,232,255,0.15)'}`,
              }}>
              {group.match_type === 'official' ? '正式赛' : '训练赛'}
            </span>
          </div>
          <span className="text-gray-600 text-xs">{group.match_date}</span>
        </div>

        {/* 地图标签 */}
        <div className="hidden sm:flex flex-wrap gap-1.5 max-w-[240px]">
          {maps.map((m, i) => {
            const mapColor = MAP_COLORS[m.map_name] || '#8494a8';
            return (
              <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono"
                style={{
                  background: `${mapColor}18`,
                  color: mapColor,
                  border: `1px solid ${mapColor}30`,
                }}>
                <span className="font-display text-[10px]">{m.map_name?.substring(0, 4)}</span>
                <span className={`${m.result === 'win' ? 'opacity-100' : 'opacity-60'}`}>
                  {m.our_score}-{m.their_score}
                </span>
              </span>
            );
          })}
        </div>

        {/* 图数 + 战绩 */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-gray-600 text-xs font-mono">{maps.length}图</span>
          {totalW + totalL > 0 && (
            <span className="text-sm font-mono font-bold" style={{ color: statusColor }}>
              {totalW}W {totalL}L
            </span>
          )}
          <span className="text-sm">{statusIcon}</span>
          {/* 展开指示 */}
          <svg className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${selected ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── 展开详情 ── */}
      {selected && <MatchDetail group={group} onSaved={onSaved} />}
    </div>
  );
}

/* ── n位数格式化 ── */
const n = (v, d) => (v != null ? Number(v).toFixed(d) : '-');

/* ── 地图详情面板 ── */
function MatchDetail({ group, onSaved }) {
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ t_score: 0, ct_score: 0, pistol_rounds: '' });
  const [saving, setSaving] = useState(false);
  const maps = group.maps || [];

  // 聚合所有地图的选手数据（去重，取最高 rating）
  const allPlayers = [];
  const seen = new Set();
  for (const m of maps) {
    if (m.players) {
      for (const p of m.players) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          allPlayers.push(p);
        }
      }
    }
  }
  allPlayers.sort((a, b) => (b.rating || 0) - (a.rating || 0));

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
      {/* ═══ 选手数据 ═══ */}
      {allPlayers.length > 0 && (
        <>
          <h4 className="font-display text-xs font-semibold text-gray-500 mb-3 tracking-wide uppercase">选手数据</h4>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-600 text-xs border-b border-white/5">
                  <th className="text-left py-2 font-medium">选手</th>
                  <th className="text-right py-2 font-medium">Rating</th>
                  <th className="text-right py-2 font-medium">K-D</th>
                  <th className="text-right py-2 font-medium">ADR</th>
                  <th className="text-right py-2 font-medium">KAST%</th>
                  <th className="text-right py-2 font-medium">HS%</th>
                </tr>
              </thead>
              <tbody>
                {allPlayers.map(p => {
                  const r = p.rating || 0;
                  const kastPct = p.kast != null ? Math.round(p.kast) + '%' : '—';
                  const [k, d] = (p.kd || '0-0').split('-').map(Number);
                  const hsPct = p.hs > 0 && k > 0 ? Math.round((p.hs / k) * 100) + '%' : '—';
                  return (
                    <tr key={p.name} className="border-b border-white/5">
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-xs font-display text-[#D4AF37]">
                            {p.name[0]}
                          </div>
                          <div>
                            <span className="font-display text-white text-xs">{p.name}</span>
                            {p.role && <span className="text-gray-600 text-[10px] ml-1">{p.role}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-10 h-1 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: Math.min(r / 1.5 * 100, 100) + '%',
                              background: r >= 1.15 ? '#35e59d' : r >= 0.95 ? '#f59e0b' : '#ff597d',
                            }} />
                          </div>
                          <span className="font-mono text-xs font-semibold" style={{
                            color: r >= 1.1 ? '#35e59d' : r >= 0.9 ? '#f59e0b' : '#ff597d'
                          }}>{n(r, 2)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{p.kd}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-300">{n(p.adr, 1)}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-400">{kastPct}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-gray-400">{hsPct}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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
                  <td className="py-2.5 text-center font-mono text-gray-300">{m.our_score}-{m.their_score}</td>
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
                  <td className="py-2.5 text-center font-mono text-gray-300">{m.our_score}-{m.their_score}</td>
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
