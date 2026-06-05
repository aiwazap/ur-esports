import { useState, useEffect } from 'react';
import api from '../api';

const ISSUE_COLORS = { grenade: '#ffc45c', position: '#ff597d', aim: '#5379ff', comms: '#68e8ff', tactics: '#8b5cff', first_death: '#84cc16' };
const ISSUE_LABELS = { grenade: '道具', position: '走位', aim: '枪法', comms: '沟通', tactics: '战术', first_death: '首死' };
const ISSUE_KEYS = ['grenade','position','aim','comms','tactics','first_death'];
const MAP_COLORS = { Mirage: '#ffc45c', Dust2: '#ff597d', Inferno: '#68e8ff', Nuke: '#35e59d', Ancient: '#5379ff', Anubis: '#8b5cff', Overpass: '#fb923c', Vertigo: '#84cc16', Train: '#ec4899' };
const PLAYER_IDS = ['0z','gLong','drace','4ever','Doomer'];

const parseTimeToSeconds = t => {
  if (!t) return 0;
  const parts = t.split(':');
  if (parts.length !== 2) return 0;
  const m = parseInt(parts[0],10), s = parseInt(parts[1],10);
  return isNaN(m)||isNaN(s) ? 0 : m*60+s;
};

const roundHasPlayer = (r, pid, issueKey) => {
  const p = pid.toLowerCase();
  // For first_death, the player is the fd_id (who died first)
  if (issueKey === 'first_death') {
    return (r.fd_id || '').toLowerCase() === p;
  }
  // For other issues, use players_involved
  const involved = (r.players_involved || '').toLowerCase().split(',').map(s => s.trim());
  return involved.includes(p);
};

export default function TrainingReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);
  const [syncing, setSyncing] = useState(false);
  const [mapDetail, setMapDetail] = useState(null);
  const [matchDetail, setMatchDetail] = useState(null);
  const [issueDetail, setIssueDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [roundDrill, setRoundDrill] = useState(null);
  const [opponentList, setOpponentList] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/training/dashboard?start=${start}&end=${end}`);
      setData(data);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [start, end]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/internal/sync-tencent', { method: 'POST' });
      const d = await res.json();
      alert('抓取完成！'+(d.etl?.status||''));
      load();
    } catch { alert('抓取失败'); }
    setSyncing(false);
  };

  const overview = data?.overview || {};
  const issueDist = data?.issue_distribution || {};
  const mapStats = data?.map_stats || [];
  const matchSummary = data?.match_summary || [];
  const playerStats = data?.player_stats || [];
  const allIssueRounds = data?.all_issue_rounds || [];
  const specialEvents = data?.special_events || [];

  const issueData = Object.entries(issueDist).map(([k,v]) => ({
    key: k, name: ISSUE_LABELS[k]||k, value: v.count||0, color: ISSUE_COLORS[k]||'#666',
  })).filter(d => d.value>0).sort((a,b) => b.value-a.value);

  const openMapDetail = async (mapName) => {
    try {
      const { data: res } = await api.get(`/training/match-records?map=${encodeURIComponent(mapName)}&start=${start}&end=${end}`);
      setMapDetail({ map_name: mapName, ...res });
    } catch {}
  };
  const openMatchDetail = async (sessionId) => {
    try {
      const { data: res } = await api.get(`/training/report/${sessionId}`);
      setMatchDetail(res);
    } catch {}
  };

  const openIssueDetail = (issueKey) => {
    let issuedRounds;
    if (issueKey === 'first_death') {
      issuedRounds = allIssueRounds.filter(r => r.fd_id && parseTimeToSeconds(r.fd_time) >= 60);
    } else {
      const issueField = `issue_${issueKey}`;
      issuedRounds = allIssueRounds.filter(r => r[issueField]);
    }
    let players = PLAYER_IDS.map(pid => {
      const ps = playerStats.find(s => (s.id||s.name||'').toLowerCase()===pid.toLowerCase());
      if (ps && ps[issueKey] > 0) return { id: pid, name: pid, count: ps[issueKey] };
      const count = issuedRounds.filter(r => roundHasPlayer(r, pid, issueKey)).length;
      return { id: pid, name: pid, count };
    }).filter(p => p.count > 0).sort((a,b) => b.count - a.count);
    setIssueDetail({ issueKey, players, total: issuedRounds.length });
  };

  const openPlayerDetail = (playerId, playerName) => {
    const ps = playerStats.find(s => (s.id||s.name||'').toLowerCase()===playerId.toLowerCase())
      || { grenade:0, position:0, aim:0, comms:0, tactics:0, first_death:0, total:0 };
    const issues = ISSUE_KEYS.map(k => ({ key: k, label: ISSUE_LABELS[k], count: ps[k]||0, color: ISSUE_COLORS[k] }))
      .filter(x => x.count > 0).sort((a,b) => b.count - a.count);
    setPlayerDetail({ playerId, playerName, issues, total: ps.total||0 });
  };

  const openIssuePlayerRounds = (issueKey, playerId, playerName) => {
    let rounds;
    if (issueKey === 'first_death') {
      rounds = allIssueRounds.filter(r =>
        r.fd_id && parseTimeToSeconds(r.fd_time) >= 60 && roundHasPlayer(r, playerId, issueKey)
      );
    } else {
      const issueField = `issue_${issueKey}`;
      rounds = allIssueRounds.filter(r =>
        r[issueField] && roundHasPlayer(r, playerId, issueKey)
      );
    }
    setRoundDrill({ title: `${playerName} · ${ISSUE_LABELS[issueKey]}`, rounds, issueKey, playerName });
    setIssueDetail(null);
  };
  const openPlayerIssueRounds = (playerId, playerName, issueKey) => {
    let rounds;
    if (issueKey === 'first_death') {
      rounds = allIssueRounds.filter(r =>
        r.fd_id && parseTimeToSeconds(r.fd_time) >= 60 && roundHasPlayer(r, playerId, issueKey)
      );
    } else {
      const issueField = `issue_${issueKey}`;
      rounds = allIssueRounds.filter(r =>
        r[issueField] && roundHasPlayer(r, playerId, issueKey)
      );
    }
    setRoundDrill({ title: `${playerName} · ${ISSUE_LABELS[issueKey]}`, rounds, issueKey, playerName });
    setPlayerDetail(null);
  };

  const maxIssueVal = Math.max(...issueData.map(d=>d.value), 1);

  return (
    <div className="p-6 md:p-8 lg:px-10">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <p className="text-xs text-ur-muted mb-1">Training report</p>
          <h1 className="text-[clamp(34px,4.4vw,62px)] leading-[0.95] font-extrabold text-white">赛训汇总报告</h1>
          <p className="text-sm text-[#9eb0c4] mt-1">
            {(() => {
              const user = JSON.parse(localStorage.getItem('user') || '{}');
              const now = new Date();
              const y = now.getFullYear(), M = now.getMonth()+1, d = now.getDate();
              const h = now.getHours(), m = now.getMinutes();
              const ampm = h >= 12 ? '下午' : '上午';
              const hh = h % 12 || 12;
              const mm = String(m).padStart(2,'0');
              return `亲爱的${user.username || '用户'}你好，今天是${y}年${M}月${d}日，现在是北京时间${ampm} ${hh}:${mm}`;
            })()}
          </p>
          <p className="max-w-[700px] mt-2 text-sm text-[#6b7d95] leading-relaxed">
            四表联动 · 数据聚合 · 三级下钻
            {specialEvents.length>0 && (
              <span className="ml-3 text-ur-rose text-xs">
                ⚠ {specialEvents.map(e => `${e.date}(${e.note})`).join(' ')}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="date" value={start} onChange={e=>setStart(e.target.value)}
                 className="h-10 px-3.5 rounded-full border border-white/[0.12] bg-white/[0.04]
                            text-sm text-gray-300 backdrop-blur-lg
                            [color-scheme:dark] outline-none focus:border-cyan-400/30" />
          <span className="text-gray-500 text-sm">~</span>
          <input type="date" value={end} onChange={e=>setEnd(e.target.value)}
                 className="h-10 px-3.5 rounded-full border border-white/[0.12] bg-white/[0.04]
                            text-sm text-gray-300 backdrop-blur-lg
                            [color-scheme:dark] outline-none focus:border-cyan-400/30" />
          <button onClick={handleSync} disabled={syncing}
                  className="btn-glass btn-glass-primary">
            {syncing ? '抓取中...' : '立即同步'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-ur-muted text-lg animate-pulse">加载中...</p>
        </div>
      ) : (<>
        {/* ── Overview Metrics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          <div onClick={() => setOpponentList(matchSummary)} className="cursor-pointer">
            <MetricCard label="训练赛场次" value={overview.total_matches} detail="点击查看对手" />
          </div>
          <MetricCard label="总回合数" value={overview.total_rounds} detail="overview.rounds" />
          <MetricCard label="胜场" value={overview.total_wins} color="text-emerald-400" />
          <MetricCard label="负场" value={overview.total_losses} color="text-ur-rose" />
          <MetricCard label="地图胜率" value={`${overview.win_rate||0}%`} color="text-ur-cyan" />
        </div>

        {/* ── Issue Distribution + Player Stats ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4 mb-5">
          {/* Issue Distribution */}
          <div className="glass-panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">问题类型分布</h2>
                <p className="text-xs text-ur-muted mt-1">点击柱状图查看选手分布</p>
              </div>
              <span className="chip">Drilldown ready</span>
            </div>
            {issueData.length>0 ? (
              <div className="space-y-3.5">
                {issueData.map(d => (
                  <div key={d.key}
                       onClick={() => openIssueDetail(d.key)}
                       className="grid grid-cols-[58px_1fr_42px] items-center gap-3 text-sm text-[#b7c6d7] cursor-pointer group">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shadow-[0_0_14px_var(--c)]"
                            style={{background: d.color, '--c': d.color}} />
                      {d.name}
                    </span>
                    <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 group-hover:brightness-125"
                           style={{
                             width: `${(d.value/maxIssueVal*100)}%`,
                             background: `linear-gradient(90deg, ${d.color}, rgba(255,255,255,0.74))`,
                             boxShadow: `0 0 22px ${d.color}a3`,
                             animation: 'grow 1.1s ease both',
                           }} />
                    </div>
                    <strong className="text-right">{d.value}</strong>
                  </div>
                ))}
                {/* Drill preview */}
                <div className="mt-5 p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.035]">
                  <p className="text-xs text-ur-muted mb-3">下钻示意：点击上方类型 → 选手分布</p>
                  <div className="grid grid-cols-5 gap-2">
                    {PLAYER_IDS.map(pid => {
                      const ps = playerStats.find(s => (s.id||s.name||'').toLowerCase()===pid.toLowerCase());
                      const maxIssue = issueData[0]?.key;
                      const count = ps ? (ps[maxIssue]||0) : 0;
                      return (
                        <div key={pid} className="min-h-[58px] rounded-2xl p-2.5 bg-white/[0.04] text-center">
                          <strong className="block text-lg text-white">{count}</strong>
                          <span className="text-[11px] text-ur-muted">{pid}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : <p className="text-ur-muted text-sm py-8 text-center">暂无数据</p>}
          </div>

          {/* Player Error Stats */}
          <div className="glass-panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">选手失误统计</h2>
                <p className="text-xs text-ur-muted mt-1">点击选手卡片查看失误明细</p>
              </div>
              <span className="chip">Active players</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {PLAYER_IDS.map(pid => {
                const ps = playerStats.find(s => (s.id||s.name||'').toLowerCase()===pid.toLowerCase())
                  || { grenade:0, position:0, aim:0, comms:0, tactics:0, first_death:0, total:0 };
                return { id: pid, name: pid, ...ps };
              }).sort((a,b) => b.total - a.total).map(p => {
                const topIssues = ISSUE_KEYS.map(k => ({ key: k, label: ISSUE_LABELS[k], count: p[k]||0, color: ISSUE_COLORS[k] }))
                  .filter(x => x.count > 0).sort((a,b) => b.count - a.count).slice(0, 3);
                return (
                  <div key={p.id}
                       onClick={() => openPlayerDetail(p.id, p.name)}
                       className="glass-panel rounded-[22px] p-4 cursor-pointer transition-all duration-200
                                  hover:border-cyan-400/25 hover:shadow-[0_0_32px_rgba(104,232,255,0.08)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-11 h-11 rounded-[15px] flex items-center justify-center text-sm font-extrabold text-[#061018]
                                      bg-gradient-to-br from-[#f9fdff] via-cyan-400 to-blue-500
                                      shadow-[0_0_24px_rgba(104,232,255,0.22)]">
                        {p.name.substring(0,2)}
                      </div>
                      <span className="chip text-[11px]">{p.id === '0z' ? 'IGL' : p.id === 'drace' ? 'AWP' : 'RIF'}</span>
                    </div>
                    <p className="mt-4 text-lg font-bold text-white">{p.name}</p>
                    <p className="mt-2 text-[42px] leading-none font-extrabold"
                       style={{ color: p.total > 0 ? '#ffc45c' : '#333' }}>
                      {p.total}
                    </p>
                    <p className="text-xs text-ur-muted mb-4">次失误</p>
                    <div className="space-y-2">
                      {topIssues.map(iss => (
                        <div key={iss.key} className="grid grid-cols-[36px_1fr_20px] items-center gap-2 text-[11px] text-[#a8b8cb]">
                          <span>{iss.label}</span>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className="h-full rounded-full"
                                 style={{ width: `${p.total>0?(iss.count/p.total*100):0}%`, background: iss.color }} />
                          </div>
                          <span className="text-right">{iss.count}</span>
                        </div>
                      ))}
                      {topIssues.length === 0 && (
                        <p className="text-[11px] text-gray-600 text-center py-2">暂无失误记录</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Map Stats ── */}
        {mapStats.length > 0 && (
          <div className="glass-panel rounded-3xl p-5 mb-5">
            <h2 className="text-lg font-bold text-white mb-4">地图统计</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {mapStats.map(m => {
                const totalMatches = (m.match_wins||0)+(m.match_losses||0);
                const winRate = totalMatches>0 ? ((m.match_wins||0)/totalMatches*100).toFixed(1) : 0;
                return (
                  <div key={m.map_name}
                       onClick={() => openMapDetail(m.map_name)}
                       className="rounded-2xl p-4 text-center cursor-pointer transition-all duration-200
                                  border border-white/[0.06] bg-white/[0.03]
                                  hover:border-cyan-400/20 hover:bg-white/[0.06]">
                    <p className="text-sm text-ur-muted mb-1">{m.map_name}</p>
                    <p className="text-2xl font-extrabold" style={{color: MAP_COLORS[m.map_name]||'#999'}}>
                      {m.session_count||0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {m.rounds||0}回合
                      <span className="mx-1.5 text-gray-600">|</span>
                      W:{m.match_wins||0} L:{m.match_losses||0}
                    </p>
                    <p className={`text-sm font-bold mt-0.5 ${Number(winRate)>=50?'text-emerald-400':'text-ur-rose'}`}>
                      {winRate}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Match Records Table ── */}
        {matchSummary.length > 0 && (
          <div className="glass-panel rounded-3xl overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-5 pb-0">
              <div>
                <h2 className="text-lg font-bold text-white">比赛记录</h2>
                <p className="text-xs text-ur-muted mt-1">点击行查看详细报告</p>
              </div>
              <span className="chip">Click row → detail</span>
            </div>
            <div className="overflow-x-auto p-5 pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#7f91a7] font-semibold bg-white/[0.035]">
                    <th className="text-left py-3.5 px-4 font-medium">日期</th>
                    <th className="text-left py-3.5 px-4 font-medium">对手</th>
                    <th className="text-right py-3.5 px-4 font-medium">回合</th>
                    <th className="text-right py-3.5 px-4 font-medium">问题</th>
                    <th className="text-center py-3.5 px-4 font-medium">地图结果</th>
                  </tr>
                </thead>
                <tbody>
                  {matchSummary.map(m => (
                    <tr key={m.id}
                        onClick={() => openMatchDetail(m.id)}
                        className="border-b border-white/[0.06] hover:bg-white/[0.045] cursor-pointer transition-colors">
                      <td className="py-3.5 px-4 text-[#c4d1df]">{m.match_date}</td>
                      <td className="py-3.5 px-4 text-[#c4d1df] font-semibold">{m.opponent}</td>
                      <td className="py-3.5 px-4 text-right text-[#c4d1df] font-mono">{m.rounds}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-ur-amber">{m.issue_rounds||0}</td>
                      <td className="py-3.5 px-4 text-center">
                        {m.map_results?.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {m.map_results.map((mr, i) => {
                              const color = mr.result === 'win' ? 'var(--accent-green)' : mr.result === 'loss' ? 'var(--accent-rose)' : '#888';
                              return (
                                <span key={i} className="inline-flex items-center min-h-[24px] px-2 rounded-full text-xs"
                                      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                                  {mr.map_name?.substring(0,3)} {mr.our_score}-{mr.their_score}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">无记录</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>)}

      {/* ── Modals ── */}
      {mapDetail && <GlassModal title={`${mapDetail.map_name} 详情`} onClose={()=>setMapDetail(null)}>
        <MapDetailComponent detail={mapDetail} />
      </GlassModal>}
      {matchDetail && <GlassModal title={`${matchDetail?.session?.opponent||''} · ${matchDetail?.session?.match_date||''}`} onClose={()=>setMatchDetail(null)}>
        <MatchDetailComponent detail={matchDetail} />
      </GlassModal>}

      {issueDetail && <GlassModal title={`${ISSUE_LABELS[issueDetail.issueKey]} · 共${issueDetail.total}回合`} onClose={()=>setIssueDetail(null)}>
        {issueDetail.players.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-ur-muted mb-3">队员失误分布（点击队员查看具体回合）</p>
            {issueDetail.players.map(p => (
              <div key={p.id}
                   onClick={() => openIssuePlayerRounds(issueDetail.issueKey, p.id, p.name)}
                   className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer
                              bg-white/[0.04] border border-transparent hover:border-white/[0.1] hover:bg-white/[0.06] transition-all">
                <span className="font-bold text-white">{p.name}</span>
                <div className="flex items-center gap-3">
                  <div className="h-2 bg-white/[0.06] rounded-full flex-1 min-w-[80px]">
                    <div className="h-2 rounded-full transition-all" style={{
                      width: `${issueDetail.total>0?(p.count/issueDetail.total*100):0}%`,
                      background: ISSUE_COLORS[issueDetail.issueKey]
                    }} />
                  </div>
                  <span className="font-mono font-bold text-sm" style={{color: ISSUE_COLORS[issueDetail.issueKey]}}>
                    {p.count}次
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <IssueRoundDetail rounds={allIssueRounds.filter(r => r[`issue_${issueDetail.issueKey}`])} issueKey={issueDetail.issueKey} />
        )}
      </GlassModal>}

      {playerDetail && <GlassModal title={`${playerDetail.playerName} · 共${playerDetail.total}次失误`} onClose={()=>setPlayerDetail(null)}>
        <div className="space-y-2">
          <p className="text-xs text-ur-muted mb-3">失误类型分布（点击类型查看具体回合）</p>
          {playerDetail.issues.map(iss => (
            <div key={iss.key}
                 onClick={() => openPlayerIssueRounds(playerDetail.playerId, playerDetail.playerName, iss.key)}
                 className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer
                            bg-white/[0.04] border border-transparent hover:border-white/[0.1] hover:bg-white/[0.06] transition-all">
              <span style={{color: iss.color}} className="font-bold">{iss.label}</span>
              <div className="flex items-center gap-3">
                <div className="h-2 bg-white/[0.06] rounded-full flex-1 min-w-[80px]">
                  <div className="h-2 rounded-full transition-all" style={{
                    width: `${playerDetail.total>0?(iss.count/playerDetail.total*100):0}%`,
                    background: iss.color
                  }} />
                </div>
                <span className="font-mono font-bold" style={{color: iss.color}}>{iss.count}次</span>
              </div>
            </div>
          ))}
        </div>
      </GlassModal>}

      {roundDrill && <GlassModal title={roundDrill.title} onClose={()=>setRoundDrill(null)}>
        <IssueRoundDetail rounds={roundDrill.rounds} issueKey={roundDrill.issueKey} playerName={roundDrill.playerName} />
      </GlassModal>}

      {/* Opponent List (click 训练场次) */}
      {opponentList && <GlassModal title={`交手记录 · 共${opponentList.length}场`} onClose={()=>setOpponentList(null)}>
        {opponentList.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {opponentList.map((m, i) => (
              <div key={i} onClick={() => { setOpponentList(null); openMatchDetail(m.id); }}
                   className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 cursor-pointer
                              hover:border-cyan-400/20 transition-all flex items-center gap-3">
                <span className="text-sm text-gray-400 font-mono">{m.match_date?.split('T')[0]}</span>
                <span className="font-display font-semibold text-white">{m.opponent}</span>
                <span className="text-xs text-gray-500">{m.rounds}回合</span>
              </div>
            ))}
          </div>
        ) : <p className="text-ur-muted text-center py-4">暂无交手记录</p>}
      </GlassModal>}
    </div>
  );
}

/* ── Metric Card ── */
function MetricCard({ label, value, color = 'text-white', detail }) {
  return (
    <div className="glass-panel rounded-2xl p-4 text-center">
      <p className="text-xs text-ur-muted">{label}</p>
      <p className={`mt-3 text-[34px] leading-none font-extrabold ${color}`}>{value ?? '-'}</p>
      {detail && <p className="mt-2 text-xs text-[#90a2b8]">{detail}</p>}
    </div>
  );
}

/* ── Glass Modal ── */
function GlassModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onClick={onClose}>
      <div className="glass-panel rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[85vh] overflow-auto"
           style={{ animation: 'none' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center
                             text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all text-2xl">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Issue Round Detail ── */
function IssueRoundDetail({ rounds, issueKey, playerName }) {
  const isFd = issueKey === 'first_death';
  const PLAYER_IDS = ['0z','gLong','drace','4ever','Doomer'];

  // Smart trim: extract fragment around target player name from multi-player text
  const trimForPlayer = (text, targetName) => {
    if (!text || !targetName) return text || '-';
    // Find all player name positions in text
    const positions = [];
    for (const pid of PLAYER_IDS) {
      let idx = 0;
      while ((idx = text.toLowerCase().indexOf(pid.toLowerCase(), idx)) !== -1) {
        positions.push({ name: pid, pos: idx, end: idx + pid.length });
        idx += pid.length;
      }
    }
    if (positions.length <= 1) return text; // Only one player, show full text

    // Find target player's position
    const targetPos = positions.find(p => p.name.toLowerCase() === targetName.toLowerCase());
    if (!targetPos) return text; // Target not found, show full

    // Sort positions by position in text
    positions.sort((a, b) => a.pos - b.pos);
    const targetIdx = positions.findIndex(p => p.name.toLowerCase() === targetName.toLowerCase());
    
    // Determine fragment boundaries
    // Start: beginning of text or after previous player's context
    // End: end of text or before next player's context
    let start = 0, end = text.length;
    
    if (targetIdx > 0) {
      const prev = positions[targetIdx - 1];
      start = Math.max(0, prev.end);
    }
    if (targetIdx < positions.length - 1) {
      const next = positions[targetIdx + 1];
      end = next.pos;
    }

    let fragment = text.substring(start, end).trim();
    // Clean up leading/trailing punctuation and space debris
    fragment = fragment.replace(/^[，,、；;.\s]+/, '').replace(/[，,、；;.\s]+$/, '');
    return fragment || text;
  };

  const filtered = rounds.filter(r => isFd ? (parseTimeToSeconds(r.fd_time) >= 60) : true);
  if (filtered.length === 0) return <p className="text-ur-muted text-center py-4">暂无记录</p>;
  return (
    <div className="max-h-[60vh] overflow-auto text-sm">
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-[#7f91a7] border-b border-white/[0.08] sticky top-0 bg-[#0b111c]">
            <th className="text-left py-3 px-2 w-[10%] font-medium whitespace-nowrap">地图</th>
            <th className="text-left py-3 px-2 w-[8%] font-medium whitespace-nowrap">回合</th>
            <th className="text-left py-3 px-2 w-[8%] font-medium whitespace-nowrap">阵营</th>
            <th className="text-left py-3 px-2 w-[18%] font-medium whitespace-nowrap">战术</th>
            {isFd && <th className="text-left py-3 px-2 w-[12%] font-medium whitespace-nowrap">首死ID</th>}
            {isFd && <th className="text-left py-3 px-2 w-[12%] font-medium whitespace-nowrap">时间</th>}
            <th className="text-left py-3 px-2 font-medium whitespace-nowrap" style={{width: isFd ? '42%' : '66%'}}>原因</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors">
              <td className="py-2.5 px-2 text-gray-300 truncate">{r.map_name}</td>
              <td className="py-2.5 px-2 text-gray-400 font-mono">{r.round_number}</td>
              <td className="py-2.5 px-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold
                  ${r.team_side==='CT'?'bg-blue-500/20 text-blue-400':'bg-amber-500/20 text-amber-400'}`}>
                  {r.team_side||'-'}
                </span>
              </td>
              <td className="py-2.5 px-2 text-gray-300 leading-relaxed">
                <div className="line-clamp-2">{r.tactic||'-'}</div>
              </td>
              {isFd && <td className="py-2.5 px-2 text-gray-300 truncate">{r.fd_id||'-'}</td>}
              {isFd && <td className="py-2.5 px-2 text-gray-400 font-mono">{r.fd_time||'-'}</td>}
              <td className="py-2.5 px-2 text-gray-300 leading-relaxed">
                <div className="line-clamp-2">
                  {(() => {
                    // 玩家筛选时：优先取提及该玩家的内容，避免张冠李戴
                    const selectRaw = () => {
                      if (isFd) return r.fd_cause || '-';
                      const mentionPlayer = (s) => s && s.toLowerCase().includes((playerName||'').toLowerCase());
                      if (playerName) {
                        for (const f of [r.notes, r.fd_cause, r.tactic, r.first_death_reason, r.command_text]) {
                          if (mentionPlayer(f)) return f;
                        }
                      }
                      return r.notes || r.fd_cause || r.tactic || '-';
                    };
                    const raw = selectRaw();
                    return playerName ? trimForPlayer(raw, playerName) : raw;
                  })()}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Map Detail ── */
function MapDetailComponent({ detail }) {
  const matches = (detail.matches||[]).filter(m=>m.match_date&&m.match_date!=='');
  const grouped=[];
  const seen=new Set();
  for(const m of matches){
    const key=m.opponent+'|'+(m.match_date||'').split(' ')[0];
    if(!seen.has(key)){seen.add(key);grouped.push({opp:m.opponent,date:m.match_date,maps:[]});}
    grouped[grouped.length-1].maps.push(m);
  }
  const total=matches.length;
  const wins=matches.filter(m=>m.result==='win').length;
  const losses=matches.filter(m=>m.result==='loss').length;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        <MiniStat label="比赛场次" value={total} />
        <MiniStat label="胜" value={wins} color="text-emerald-400" />
        <MiniStat label="负" value={losses} color="text-ur-rose" />
        <MiniStat label="胜率" value={`${total>0?(wins/total*100).toFixed(1):0}%`} color="text-ur-cyan" />
      </div>
      {grouped.length>0 ? (
        <div className="space-y-3">
          {grouped.map((g,i)=>(
            <div key={i} className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-white">{g.opp}</span>
                <span className="text-xs text-gray-500">{g.date}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.maps.map((m,j)=>(
                  <span key={j} className={`tag text-xs ${m.result==='win'?'tag-win':m.result==='loss'?'tag-loss':'tag-draw'}`}>
                    {m.map_name} {m.our_score}-{m.their_score}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-ur-muted text-sm text-center py-4">暂无比赛记录</p>}
    </div>
  );
}

function MiniStat({ label, value, color='text-white' }) {
  return (
    <div className="rounded-xl p-3 text-center bg-white/[0.04] border border-white/[0.06]">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

/* ── Match Detail ── */
function MatchDetailComponent({ detail }) {
  const session=detail.session||{};
  const rounds=detail.rounds||[];
  const wins=rounds.filter(r=>r.round_result==='win').length, losses=rounds.filter(r=>r.round_result==='loss').length;
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <span className="chip">回合: {rounds.length}</span>
        <span className="tag tag-win">胜: {wins}</span>
        <span className="tag tag-loss">负: {losses}</span>
      </div>
      {rounds.length>0 && (
        <div>
          <h4 className="text-sm font-bold text-white mb-2">训练日志</h4>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#7f91a7] border-b border-white/[0.08] sticky top-0 bg-[#0b111c]">
                  <th className="text-left py-1.5 font-medium">#</th>
                  <th className="text-left py-1.5 font-medium">地图</th>
                  <th className="text-left py-1.5 font-medium">战术</th>
                  <th className="text-center py-1.5 font-medium">结果</th>
                  <th className="text-left py-1.5 font-medium">问题</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r,i)=>(
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="py-1.5 text-gray-500">{r.round_number}</td>
                    <td className="py-1.5 text-gray-400">{r.map_name}</td>
                    <td className="py-1.5 text-gray-300 truncate max-w-[120px]">{r.command_text||r.round_type||'-'}</td>
                    <td className="py-1.5 text-center">
                      <span className={r.round_result==='win'?'text-emerald-400':r.round_result==='loss'?'text-ur-rose':'text-gray-600'}>
                        {r.round_result||'-'}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <div className="flex gap-1">
                        {ISSUE_KEYS.map(k=>r[`issue_${k}`]?(
                          <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{background: ISSUE_COLORS[k]+'20', color: ISSUE_COLORS[k]}}>
                            {ISSUE_LABELS[k]}
                          </span>
                        ):null)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
