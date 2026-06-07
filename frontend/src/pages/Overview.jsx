import { useState, useEffect } from 'react';
import api from '../api';
import {
  Trophy, TrendingUp, Activity, Calendar, MapIcon, Users, Target,
  ChevronRight, X, AlertTriangle, Info, Loader2, Swords,
  Monitor, Package, Clock, Eye, Edit3, Save, Plus, Trash2,
  ExternalLink,
} from 'lucide-react';

const n = (v, d = 0) => (v != null ? Number(v).toFixed(d) : '—');
const pct = (v) => (v != null ? Number(v).toFixed(1) + '%' : '—');

const MAP_IMAGES = {
  'Inferno': '/images/maps/inferno.png', 'Mirage': '/images/maps/mirage.png',
  'Nuke': '/images/maps/nuke.png', 'Ancient': '/images/maps/ancient.png',
  'Anubis': '/images/maps/anubis.png', 'Overpass': '/images/maps/overpass.png',
  'Dust2': '/images/maps/dust2.png', 'Train': '/images/maps/train.png',
  'Vertigo': '/images/maps/vertigo.png',
};

const WIN = 'text-emerald-400'; const LOSS = 'text-rose-400';

function daysSince(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);
  // Admin editing states
  const [editingPeriph, setEditingPeriph] = useState(false);
  const [editingInv, setEditingInv] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [periphForm, setPeriphForm] = useState({});
  const [invForm, setInvForm] = useState([]);
  const [planForm, setPlanForm] = useState({ date: '', items: [] });
  const [saving, setSaving] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'coach' || user?.role === 'team_lead' || user?.role === 'analyst';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/dashboard/overview')
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Peripherals save ──
  const savePeripherals = async () => {
    setSaving(true);
    try {
      for (const [playerId, fields] of Object.entries(periphForm)) {
        await api.put(`/peripherals/${playerId}`, fields);
      }
      setEditingPeriph(false);
      window.location.reload();
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  // ── Inventory save ──
  const saveInventory = async () => {
    setSaving(true);
    try {
      await api.put('/inventory/batch', { items: invForm });
      setEditingInv(false);
      window.location.reload();
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  // ── Training plan save ──
  const saveTrainingPlan = async () => {
    setSaving(true);
    try {
      await api.put('/training-plans/batch', planForm);
      setEditingPlan(false);
      window.location.reload();
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  // ── Coach notes quick save ──
  const saveCoachNote = async (matchId, notes) => {
    try {
      await api.put(`/matches/${matchId}`, { notes });
      alert('已保存');
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-400 mx-auto" />
        <p className="text-slate-400 text-sm">加载数据总览...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="data-card text-center py-16 max-w-lg mx-auto">
      <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
      <h3 className="text-lg font-bold text-white mb-2">数据加载失败</h3>
      <p className="text-slate-400 text-sm mb-4">{error}</p>
      <button onClick={() => window.location.reload()} className="btn-primary cursor-pointer">重新加载</button>
    </div>
  );

  if (!data) return null;

  const { kpi, upcomingMatch, recentMatches, playerStats, hsStats, teamAverages,
          mapStats, matchDetails, peripherals, inventory, trainingPlan,
          coachNotes, opponentIntel, h2hFromDb, systemConfig, missingData } = data;

  const totalMapGames = mapStats.reduce((s, m) => s + m.played, 0);
  const totalMapWins = mapStats.reduce((s, m) => s + m.wins, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5 fade-in pb-12">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">数据总览</h2>
          <p className="text-xs text-slate-500 mt-0.5">赛训数据概览 · {new Date().toLocaleDateString('zh-CN')}</p>
        </div>
      </div>

      {/* ═══ KPI Row ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* VRS 排名 */}
        <div className="data-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">VRS Asia 排名</p>
              <p className="text-3xl font-bold text-cyan-400 mt-1 font-mono">
                {kpi.vrsRank ? '#' + kpi.vrsRank : '—'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            {kpi.vrsRank ? '实时排名' : '需配置'}
            {isAdmin && (
              <button onClick={async () => {
                const rank = prompt('输入 VRS Asia 排名:');
                if (rank && !isNaN(rank)) {
                  await api.post('/config/vrs-rank', { rank: parseInt(rank) });
                  window.location.reload();
                }
              }} className="ml-2 text-cyan-400 hover:underline">编辑</button>
            )}
          </p>
        </div>

        {/* 近十场胜率 */}
        <div className="data-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">近十场胜率</p>
              <p className={`text-3xl font-bold mt-1 ${kpi.recentWinRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {kpi.recentWinRate}%
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">{kpi.recentWins}胜 / {kpi.totalRecentMatches - kpi.recentWins}负</p>
        </div>

        {/* 训练质量 */}
        <div className="data-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">训练质量</p>
              <p className={`text-3xl font-bold mt-1 ${kpi.trainingQuality >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                {kpi.trainingQuality}%
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">{kpi.totalRounds} 回合 · {kpi.issueRounds} 失误</p>
        </div>

        {/* 分部已成立天数 */}
        <div className="data-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">分部已成立</p>
              <p className="text-3xl font-bold text-cyan-400 mt-1 font-mono">
                {kpi.foundedDate ? daysSince(kpi.foundedDate) + '天' : '—'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-violet-400" />
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            {kpi.foundedDate ? kpi.foundedDate + ' 成立' : '未配置'}
          </p>
        </div>
      </div>

      {/* ═══ Upcoming + Player Stats ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── 即将赛事 ── */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">即将赛事</h3>
            {upcomingMatch?.source_link && (
              <a href={upcomingMatch.source_link} target="_blank" rel="noreferrer"
                 className="ml-auto text-[10px] text-cyan-400 hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> 来源
              </a>
            )}
          </div>
          {upcomingMatch ? (
            <div className="text-center py-3 space-y-3">
              <p className="text-lg font-bold text-cyan-400">{upcomingMatch.event_name || '赛事'}</p>
              <p className="text-sm text-slate-400">{upcomingMatch.stage || ''}</p>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-cyan-400">UR</p>
                  <p className="text-[10px] text-slate-500">VRS #{kpi.vrsRank || '—'}</p>
                </div>
                <span className="text-lg font-bold text-slate-600 font-mono">VS</span>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{upcomingMatch.opponent}</p>
                  <p className="text-[10px] text-slate-500">
                    {opponentIntel?.vrs_rank ? '#' + opponentIntel.vrs_rank : ''}
                    {upcomingMatch.match_type === 'official' ? ' · 正式赛' : ' · 训练赛'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {upcomingMatch.match_date}{upcomingMatch.match_time ? ' ' + upcomingMatch.match_time : ''}
                {upcomingMatch.bo_format && <span className="chip text-[10px] ml-2">{upcomingMatch.bo_format}</span>}
              </p>
              {/* H2H */}
              <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
                <span>历史交手:</span>
                <span className="text-emerald-400">{h2hFromDb?.wins || 0}W</span>
                <span className="text-slate-600">/</span>
                <span className="text-rose-400">{h2hFromDb?.losses || 0}L</span>
                {(h2hFromDb?.draws || 0) > 0 && <><span className="text-slate-600">/</span><span className="text-amber-400">{h2hFromDb.draws}D</span></>}
              </div>
              {/* Opponent intel */}
              {opponentIntel && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-left space-y-1.5">
                  {opponentIntel.map_preference && (
                    <p className="text-[10px] text-slate-400"><strong className="text-slate-300">地图倾向:</strong> {opponentIntel.map_preference}</p>
                  )}
                  {opponentIntel.core_players && (
                    <p className="text-[10px] text-slate-400"><strong className="text-slate-300">核心选手:</strong> {opponentIntel.core_players}</p>
                  )}
                  {opponentIntel.notes && (
                    <p className="text-[10px] text-slate-500">{opponentIntel.notes}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
              <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">近期暂无正赛规划</p>
              <p className="text-[10px] text-slate-600 mt-1">在「数据管理」中录入赛程</p>
            </div>
          )}
        </div>

        {/* ── 选手综合数据 + HS% ── */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">现役选手综合数据</h3>
            {hsStats?.length > 0 && <span className="text-[10px] text-slate-500 ml-auto">含近3天 HS%</span>}
          </div>
          {playerStats.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-2 px-1 text-slate-500 font-medium">选手</th>
                      <th className="text-right py-2 px-1 text-slate-500 font-medium">Rating</th>
                      <th className="text-right py-2 px-1 text-slate-500 font-medium">K-D</th>
                      <th className="text-right py-2 px-1 text-slate-500 font-medium">ADR</th>
                      <th className="text-right py-2 px-1 text-slate-500 font-medium">HS%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map(p => {
                      const hsRow = hsStats?.find(h => h.nickname === p.nickname);
                      return (
                        <tr key={p.nickname} className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors">
                          <td className="py-2.5 px-1">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/20 flex items-center justify-center text-[11px] font-bold text-cyan-400">
                                {p.nickname[0]}
                              </div>
                              <div>
                                <span className="font-semibold text-white">{p.nickname}</span>
                                {p.in_game_role && <span className="text-[10px] text-slate-500 ml-1.5">{p.in_game_role}</span>}
                              </div>
                            </div>
                          </td>
                          <td className={`py-2.5 px-1 text-right font-mono font-bold ${(p.avg_rating || 0) >= 1.05 ? WIN : (p.avg_rating || 0) >= 0.95 ? 'text-amber-400' : LOSS}`}>
                            {n(p.avg_rating, 2)}
                          </td>
                          <td className="py-2.5 px-1 text-right text-slate-300 font-mono">{p.total_kills}-{p.total_deaths}</td>
                          <td className="py-2.5 px-1 text-right text-slate-300 font-mono">{n(p.avg_adr, 1)}</td>
                          <td className={`py-2.5 px-1 text-right font-mono font-bold ${hsRow ? (parseFloat(hsRow.hs_pct) >= 45 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-600'}`}>
                            {hsRow ? hsRow.hs_pct + '%' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex gap-4 text-xs text-slate-500">
                <span>团队 Rating: <strong className="text-cyan-400">{n(teamAverages?.rating, 2)}</strong></span>
                <span>团队 ADR: <strong className="text-cyan-400">{n(teamAverages?.adr, 1)}</strong></span>
              </div>
            </>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
              <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">暂无选手数据</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 近期比赛 + 地图统计 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Swords className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">近期赛事记录</h3>
          </div>
          {recentMatches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left py-2 px-1 text-slate-500 font-medium">日期</th>
                    <th className="text-left py-2 px-1 text-slate-500 font-medium">对手</th>
                    <th className="text-left py-2 px-1 text-slate-500 font-medium">地图</th>
                    <th className="text-right py-2 px-1 text-slate-500 font-medium">比分</th>
                    <th className="text-center py-2 px-1 text-slate-500 font-medium">结果</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMatches.map(m => (
                    <tr key={m.id} onClick={() => {
                      const detail = matchDetails?.find(d => d.id === m.id);
                      if (detail) setSelectedMatch(detail);
                    }} className="border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer">
                      <td className="py-2.5 px-1 text-slate-400">{m.date}</td>
                      <td className="py-2.5 px-1 font-semibold text-white">{m.opponent}</td>
                      <td className="py-2.5 px-1 text-slate-300">{m.map}</td>
                      <td className="py-2.5 px-1 text-right font-mono font-bold text-slate-200">{m.score}</td>
                      <td className="py-2.5 px-1 text-center">
                        <span className={`tag ${m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                          {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
              <Swords className="w-8 h-8 text-slate-600 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无比赛数据</p>
            </div>
          )}
        </div>

        {/* 地图统计 */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <MapIcon className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">赛训地图统计</h3>
          </div>
          {mapStats.length > 0 ? (
            <div className="space-y-2.5">
              {mapStats.map(map => {
                const wr = map.win_rate || 0;
                const barColor = wr >= 65 ? 'bg-emerald-500' : wr >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                const textColor = wr >= 65 ? 'text-emerald-400' : wr >= 50 ? 'text-amber-400' : 'text-rose-400';
                return (
                  <div key={map.map_name} onClick={() => setSelectedMap(map)}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group">
                    <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
                      {MAP_IMAGES[map.map_name] ? (
                        <img src={MAP_IMAGES[map.map_name]} alt={map.map_name}
                          className="w-full h-full object-contain p-0.5 opacity-80 group-hover:opacity-100"
                          onError={e => { e.target.style.display = 'none'; }} />
                      ) : <Target className="w-5 h-5 text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-white">{map.map_name}</span>
                        <span className={`text-xs font-mono font-bold ${textColor}`}>{wr}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(wr, 100)}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-slate-600">{map.played} 场</span>
                        <span className="text-[10px] text-slate-600">{map.wins}W / {map.losses}L</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
              <MapIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" /><p className="text-sm text-slate-500">暂无地图数据</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 选手外设 + 库存备用 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── 选手外设 ── */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">选手外设使用汇总</h3>
            {isAdmin && (
              <button onClick={() => {
                if (!editingPeriph) {
                  const form = {};
                  (peripherals || []).forEach(p => {
                    form[p.player_id] = { keyboard: p.keyboard || '', mouse: p.mouse || '', headset: p.headset || '', mousepad: p.mousepad || '', monitor: p.monitor || '' };
                  });
                  // Also add players without periph entries
                  (data.playerStats || []).forEach(ps => {
                    const periph = (peripherals || []).find(p => p.nickname === ps.nickname);
                    if (!periph) {
                      // Find player ID from peripherals
                    }
                  });
                  setPeriphForm(form);
                }
                setEditingPeriph(!editingPeriph);
              }} className="ml-auto text-[10px] text-cyan-400 hover:underline flex items-center gap-1">
                {editingPeriph ? <><X className="w-3 h-3" />取消</> : <><Edit3 className="w-3 h-3" />编辑</>}
              </button>
            )}
          </div>
          {!editingPeriph ? (
            (peripherals || []).length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {peripherals.map(p => (
                  <div key={p.player_id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400 flex-shrink-0">
                      {p.nickname?.[0] || '?'}
                    </div>
                    <div className="min-w-0 text-[11px]">
                      <p className="font-semibold text-white truncate">{p.nickname}</p>
                      <p className="text-slate-500 truncate text-[10px]">
                        {[p.keyboard, p.mouse, p.headset].filter(Boolean).join(' · ') || '未设置'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-slate-700/50 rounded-lg">
                <Monitor className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">外设数据未录入</p>
                {isAdmin && <p className="text-[10px] text-slate-600 mt-1">点击右上角「编辑」录入</p>}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {peripherals.map(p => {
                const pf = periphForm[p.player_id] || {};
                return (
                  <div key={p.player_id} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    <p className="text-xs font-bold text-white mb-2">{p.nickname} <span className="text-[10px] text-slate-500">{p.in_game_role}</span></p>
                    <div className="grid grid-cols-5 gap-2">
                      {['keyboard', 'mouse', 'headset', 'mousepad', 'monitor'].map(field => (
                        <div key={field}>
                          <label className="text-[9px] text-slate-600 block mb-0.5">{field}</label>
                          <input className="w-full text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none focus:border-cyan-500/50"
                            value={pf[field] || ''} onChange={e => setPeriphForm(prev => ({
                              ...prev, [p.player_id]: { ...pf, [field]: e.target.value }
                            }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button onClick={savePeripherals} disabled={saving}
                className="w-full py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存外设'}
              </button>
            </div>
          )}
        </div>

        {/* ── 库存备用 ── */}
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">库存备用外设汇总</h3>
            {isAdmin && (
              <button onClick={() => {
                if (!editingInv) {
                  setInvForm((inventory || []).map(i => ({ id: i.id, item_type: i.item_type, current_count: i.current_count, max_count: i.max_count })));
                }
                setEditingInv(!editingInv);
              }} className="ml-auto text-[10px] text-cyan-400 hover:underline flex items-center gap-1">
                {editingInv ? <><X className="w-3 h-3" />取消</> : <><Edit3 className="w-3 h-3" />编辑</>}
              </button>
            )}
          </div>
          {!editingInv ? (
            (inventory || []).length > 0 ? (
              <div className="space-y-3">
                {inventory.map(item => {
                  const pct = item.max_count > 0 ? (item.current_count / item.max_count * 100) : 0;
                  const barColor = pct >= 50 ? 'bg-emerald-500' : pct >= 20 ? 'bg-amber-500' : 'bg-rose-500';
                  const textColor = pct >= 50 ? 'text-emerald-400' : pct >= 20 ? 'text-amber-400' : 'text-rose-400';
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-14">{item.item_type}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs font-mono font-bold ${textColor} w-10 text-right`}>{item.current_count}/{item.max_count}</span>
                    </div>
                  );
                })}
                {/* Warning for low stock */}
                {inventory.some(i => i.max_count > 0 && i.current_count / i.max_count < 0.25) && (
                  <p className="text-[11px] text-rose-400 text-center mt-2">
                    ⚠️ 部分库存不足，需尽快采购
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-slate-700/50 rounded-lg">
                <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">库存数据未录入</p>
                {isAdmin && <p className="text-[10px] text-slate-600 mt-1">点击右上角「编辑」录入</p>}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {invForm.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5">
                  <input className="w-16 text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none"
                    value={item.item_type} onChange={e => {
                      const updated = [...invForm]; updated[idx].item_type = e.target.value; setInvForm(updated);
                    }} />
                  <span className="text-[10px] text-slate-500">库存</span>
                  <input className="w-12 text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none text-center"
                    type="number" value={item.current_count}
                    onChange={e => {
                      const updated = [...invForm]; updated[idx].current_count = parseInt(e.target.value) || 0; setInvForm(updated);
                    }} />
                  <span className="text-[10px] text-slate-500">/</span>
                  <input className="w-12 text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none text-center"
                    type="number" value={item.max_count}
                    onChange={e => {
                      const updated = [...invForm]; updated[idx].max_count = parseInt(e.target.value) || 0; setInvForm(updated);
                    }} />
                </div>
              ))}
              <button onClick={saveInventory} disabled={saving}
                className="w-full py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存库存'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 今日训练计划 ═══ */}
      <div className="data-card">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">今日训练计划</h3>
          <span className="text-[10px] text-slate-500">{new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
          {isAdmin && (
            <button onClick={() => {
              if (!editingPlan) {
                setPlanForm({
                  date: new Date().toISOString().slice(0, 10),
                  items: (trainingPlan || []).length > 0
                    ? trainingPlan.map(t => ({ id: t.id, start_time: t.start_time || '', end_time: t.end_time || '', title: t.title, subtitle: t.subtitle || '', tags: t.tags || '' }))
                    : [{ start_time: '', end_time: '', title: '', subtitle: '', tags: '' }],
                });
              }
              setEditingPlan(!editingPlan);
            }} className="ml-auto text-[10px] text-cyan-400 hover:underline flex items-center gap-1">
              {editingPlan ? <><X className="w-3 h-3" />取消</> : <><Edit3 className="w-3 h-3" />编辑</>}
            </button>
          )}
        </div>
        {!editingPlan ? (
          (trainingPlan || []).length > 0 ? (
            <div className="space-y-3">
              {trainingPlan.map((tp, i) => (
                <div key={tp.id || i} className="flex items-start gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                  <div className="text-center flex-shrink-0 min-w-[70px]">
                    <p className="text-xs font-mono text-cyan-400">{tp.start_time || '—'}</p>
                    <p className="text-[9px] text-slate-600">至</p>
                    <p className="text-xs font-mono text-slate-400">{tp.end_time || '—'}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{tp.title}</p>
                    {tp.subtitle && <p className="text-xs text-slate-400 mt-0.5">{tp.subtitle}</p>}
                    {tp.tags && (
                      <div className="flex gap-1 mt-1.5">
                        {tp.tags.split(/[,，]/).map((t, j) => (
                          <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{t.trim()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">今日暂无训练计划</p>
              {isAdmin && <p className="text-[10px] text-slate-600 mt-1">点击右上角「编辑」添加</p>}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {planForm.items.map((item, idx) => (
              <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-slate-500 w-6">#{idx + 1}</span>
                  <input className="w-16 text-[11px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none"
                    placeholder="开始" value={item.start_time} onChange={e => {
                      const updated = [...planForm.items]; updated[idx].start_time = e.target.value; setPlanForm({ ...planForm, items: updated });
                    }} />
                  <span className="text-[10px] text-slate-600">至</span>
                  <input className="w-16 text-[11px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none"
                    placeholder="结束" value={item.end_time} onChange={e => {
                      const updated = [...planForm.items]; updated[idx].end_time = e.target.value; setPlanForm({ ...planForm, items: updated });
                    }} />
                  <button onClick={() => {
                    setPlanForm({ ...planForm, items: planForm.items.filter((_, i) => i !== idx) });
                  }} className="ml-auto text-rose-400 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <input className="w-full text-xs bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1.5 text-white outline-none mb-1.5"
                  placeholder="标题" value={item.title} onChange={e => {
                    const updated = [...planForm.items]; updated[idx].title = e.target.value; setPlanForm({ ...planForm, items: updated });
                  }} />
                <input className="w-full text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none mb-1.5"
                  placeholder="副标题" value={item.subtitle} onChange={e => {
                    const updated = [...planForm.items]; updated[idx].subtitle = e.target.value; setPlanForm({ ...planForm, items: updated });
                  }} />
                <input className="w-full text-[10px] bg-slate-800/50 border border-white/[0.08] rounded px-2 py-1 text-white outline-none"
                  placeholder="标签 (逗号分隔)" value={item.tags} onChange={e => {
                    const updated = [...planForm.items]; updated[idx].tags = e.target.value; setPlanForm({ ...planForm, items: updated });
                  }} />
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setPlanForm({
                ...planForm, items: [...planForm.items, { start_time: '', end_time: '', title: '', subtitle: '', tags: '' }]
              })} className="flex-1 py-2 rounded-lg border border-dashed border-slate-600 text-slate-500 text-xs hover:border-cyan-500/30 hover:text-cyan-400 transition-colors">
                <Plus className="w-3.5 h-3.5 inline mr-1" />添加训练项
              </button>
              <button onClick={saveTrainingPlan} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存计划'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 教练评语 ═══ */}
      {coachNotes?.length > 0 && (
        <div className="data-card">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">教练评语</h3>
          </div>
          <div className="space-y-2">
            {coachNotes.map(n => (
              <div key={n.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] text-slate-500 flex-shrink-0 w-20">{n.date}</div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 line-clamp-2">{n.notes}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{n.opponent} · {n.map}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Missing Data ═══ */}
      {missingData && Object.values(missingData).filter(Boolean).length > 0 && (
        <div className="data-card border-amber-500/15">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-400 mb-2">部分数据暂不可用</h4>
              <ul className="space-y-1">
                {Object.entries(missingData).filter(([_, v]) => v).map(([key, msg]) => (
                  <li key={key} className="flex items-start gap-2 text-xs text-slate-400">
                    <Info className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Match Detail Modal ═══ */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setSelectedMatch(null); }}>
          <div className="glass-panel rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-cyan-400 font-display">UR vs {selectedMatch.opponent}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedMatch.date} · {selectedMatch.map} · {selectedMatch.score}</p>
              </div>
              <button onClick={() => setSelectedMatch(null)}
                className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3 mb-4">
              <div className="chip">地图: {selectedMatch.map}</div>
              <div className={`tag ${selectedMatch.result === 'win' ? 'tag-win' : selectedMatch.result === 'loss' ? 'tag-loss' : 'tag-draw'}`}>
                {selectedMatch.result === 'win' ? '胜利' : selectedMatch.result === 'loss' ? '失败' : '平局'}
              </div>
            </div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">选手数据</h4>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-white/[0.08]">
                <th className="text-left py-2 px-2 text-slate-500">选手</th>
                <th className="text-right py-2 px-2 text-slate-500">Rating</th>
                <th className="text-right py-2 px-2 text-slate-500">K-D</th>
                <th className="text-right py-2 px-2 text-slate-500">ADR</th>
                <th className="text-right py-2 px-2 text-slate-500">KAST%</th>
              </tr></thead>
              <tbody>
                {(selectedMatch.players || []).map(p => {
                  const r = p.rating || 0;
                  const barColor = r >= 1.15 ? 'bg-emerald-500' : r >= 0.95 ? 'bg-amber-500' : 'bg-rose-500';
                  return (
                    <tr key={p.name} className="border-b border-white/[0.03]">
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400">{p.name[0]}</div>
                          <span className="font-semibold text-white">{p.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex-1 max-w-[40px] h-1 rounded-full bg-white/[0.06]">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min((r/1.5)*100, 100)}%` }} />
                          </div>
                          <span className={`font-mono font-bold ${r >= 1.1 ? WIN : r >= 0.9 ? 'text-amber-400' : LOSS}`}>{n(r, 2)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{p.kd}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300 font-mono">{n(p.adr, 1)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-400">{pct(p.kast)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Coach note editor */}
            {isStaff && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="text-[10px] text-slate-500 mb-1">教练评语</p>
                <textarea
                  className="w-full text-xs bg-slate-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500/50 resize-none"
                  rows={2}
                  defaultValue={selectedMatch.notes || ''}
                  onBlur={e => saveCoachNote(selectedMatch.id, e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Map Detail Modal ═══ */}
      {selectedMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setSelectedMap(null); }}>
          <div className="glass-panel rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-cyan-400 font-display">{selectedMap.map_name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedMap.played} 场 · {selectedMap.wins}胜{selectedMap.losses}负</p>
              </div>
              <button onClick={() => setSelectedMap(null)}
                className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-emerald-400 font-mono">{selectedMap.wins}</p>
                <p className="text-[10px] text-slate-500">胜场</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-rose-400 font-mono">{selectedMap.losses}</p>
                <p className="text-[10px] text-slate-500">负场</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                <p className={`text-lg font-bold font-mono ${selectedMap.win_rate >= 50 ? 'text-cyan-400' : 'text-rose-400'}`}>{selectedMap.win_rate}%</p>
                <p className="text-[10px] text-slate-500">胜率</p>
              </div>
            </div>
            {selectedMap.recentMatches?.length > 0 && (<>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">近期战绩</h4>
              <div className="space-y-2">
                {selectedMap.recentMatches.map((m, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${m.result === 'win' ? 'bg-emerald-500/[0.06] border-l-2 border-emerald-500/40' : 'bg-rose-500/[0.06] border-l-2 border-rose-500/40'}`}>
                    <span className="text-[10px] text-slate-500 w-16">{m.date}</span>
                    <span className="flex-1 text-xs font-semibold text-white">{m.opponent}</span>
                    <span className={`text-xs font-mono font-bold ${m.result === 'win' ? WIN : LOSS}`}>{m.score}</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
