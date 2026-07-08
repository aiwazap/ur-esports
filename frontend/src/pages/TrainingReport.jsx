import { useState, useEffect, Fragment } from 'react';
import api from '../api';

const ISSUE_COLORS = { grenade: '#ffc45c', position: '#ff597d', aim: '#5379ff', comms: '#68e8ff', tactics: '#8b5cff', first_death: '#84cc16' };
const ISSUE_LABELS = { grenade: '道具', position: '走位', aim: '枪法', comms: '沟通', tactics: '战术', first_death: '首死' };
const ISSUE_KEYS = ['grenade','position','aim','comms','tactics','first_death'];
const MAP_COLORS = { Mirage: '#ffc45c', Dust2: '#ff597d', Inferno: '#68e8ff', Nuke: '#35e59d', Ancient: '#5379ff', Anubis: '#8b5cff', Overpass: '#fb923c', Vertigo: '#84cc16', Train: '#ec4899' };
const PLAYER_IDS = ['0z','gLong','drace','4ever','Doomer'];

// 头像等静态资源:后端以 /uploads/... 返回相对路径。dev(5173)若不代理 /uploads 会 404,
// 这里从 axios 的 baseURL 推出后端源(如 http://localhost:3001),给相对路径补前缀。
// 若 baseURL 为空/相对(走代理),则原样返回相对路径——两种情况都能正常加载,且不会破坏现有头像。
const API_ORIGIN = String(api?.defaults?.baseURL || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
const mediaUrl = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;          // 已是绝对地址
  return API_ORIGIN ? `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}` : u;
};

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

function StatsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // 用本地日期，不用 toISOString（UTC会差8小时导致上午显示昨天）
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const PRESETS = [
    { label: '昨天', val: 'yesterday' }, { label: '今天', val: 'today' },
    { label: '近7天', val: 7 }, { label: '近30天', val: 30 }
  ];
  const [start, setStart] = useState(new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]);
  const [end, setEnd] = useState(today);
  const [activePreset, setActivePreset] = useState(7);
  const [customRange, setCustomRange] = useState(false);

  const applyPreset = (val) => {
    const dStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    if (val === 'today')          { setStart(dStr(0)); setEnd(dStr(0)); }
    else if (val === 'yesterday') { setStart(dStr(1)); setEnd(dStr(1)); }
    else                          { setStart(dStr(val)); setEnd(today); }
    setActivePreset(val);
    setCustomRange(false);
  };

  const [mapDetail, setMapDetail] = useState(null);
  const [matchDetail, setMatchDetail] = useState(null);
  const [matchMapFilter, setMatchMapFilter] = useState(null);
  const [issueDetail, setIssueDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [roundDrill, setRoundDrill] = useState(null);
  const [opponentList, setOpponentList] = useState(null);
  const [opponentStats, setOpponentStats] = useState([]);
  const [opponentDetail, setOpponentDetail] = useState(null);
  const [players, setPlayers] = useState([]);
  const [highlights, setHighlights] = useState(null);
  const [hlError, setHlError] = useState(null);
  const [mvpPlaceholder, setMvpPlaceholder] = useState(null);  // MVP暂无数据时用 Goatnikola 头像顶替

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/training/dashboard?start=${start}&end=${end}&type=scrim`);
      setData(data);
    } catch(e) { console.error(e); }
    try {
      const { data: hl } = await api.get(`/training-plans/highlights?from=${start}&to=${end}`);
      setHighlights(hl); setHlError(null);
    } catch(e) {
      console.error('highlights:', e);
      setHighlights(null);
      // 把后端真实报错带到页面上(无需 F12 也能看到原因)
      setHlError(e?.response?.data?.error || e?.message || '未知错误');
    }
    setLoading(false);
  };
  const loadOpponentStats = async () => {
    try {
      const { data } = await api.get(`/training/opponent-stats?start=${start}&end=${end}&type=scrim`);
      setOpponentStats(data.opponents || []);
    } catch(e) { console.error(e); }
  };
  useEffect(() => { load(); loadOpponentStats(); }, [start, end]);
  useEffect(() => {
    api.get('/players?division=cs2&status=active&team_type=roster').then(({ data }) => {
      setPlayers(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);
  // 取 Goatnikola(aiwazap, id 191)的头像，给暂无数据的 MVP 卡顶上（不限 team_type，因他是赛训团队不在 roster）
  useEffect(() => {
    api.get('/players?division=cs2').then(({ data }) => {
      const all = Array.isArray(data) ? data : [];
      const g = all.find(p =>
        p.id === 191 ||
        ['aiwazap','goatnikola'].includes((p.nickname||'').toLowerCase()) ||
        ['aiwazap','goatnikola'].includes((p.name||'').toLowerCase()));
      if (g && g.avatar_url) setMvpPlaceholder({ nickname: 'Goatnikola', avatar_url: g.avatar_url });
    }).catch(() => {});
  }, []);

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
  const openMatchDetail = async (sessionId, mapFilter) => {
    try {
      const { data: res } = await api.get(`/training/report/${sessionId}`);
      setMatchMapFilter(mapFilter || null);
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
    <div>
      {/* ── Header ── */}
      <div className="mb-7">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-ur-muted mb-1">Match Analytics</p>
            <h1 className="text-[clamp(28px,3.5vw,48px)] leading-[0.95] font-extrabold text-white">近期赛事</h1>
          </div>
          {/* 自定义日期(折叠) */}
          <div className="flex items-center gap-2">
            <button onClick={() => setCustomRange(!customRange)}
              className={`h-9 px-3.5 rounded-full text-xs font-medium border transition-all
                ${customRange ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300' : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-gray-300'}`}>
              📅 自定义日期
            </button>
            {customRange && (
              <>
                <input type="date" value={start} onChange={e => { setStart(e.target.value); setActivePreset(null); }}
                  className="h-9 px-3 rounded-full border border-white/[0.12] bg-white/[0.04] text-xs text-gray-300 [color-scheme:dark] outline-none focus:border-cyan-400/30" />
                <span className="text-gray-600 text-xs">~</span>
                <input type="date" value={end} onChange={e => { setEnd(e.target.value); setActivePreset(null); }}
                  className="h-9 px-3 rounded-full border border-white/[0.12] bg-white/[0.04] text-xs text-gray-300 [color-scheme:dark] outline-none focus:border-cyan-400/30" />
              </>
            )}
          </div>
        </div>

        {/* 时间预设按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.val} onClick={() => applyPreset(p.val)}
              className={`h-8 px-3.5 rounded-full text-xs font-medium border transition-all
                ${activePreset === p.val && !customRange
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.12]'}`}>
              {p.label}
            </button>
          ))}

          <span className="text-[11px] text-gray-600 ml-2">
            {start} ~ {end}
          </span>
        </div>
      </div>

      {/* ── 训练赛标签:原有数据 ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-ur-muted text-lg animate-pulse">加载中...</p>
        </div>
      ) : (<>
        {/* ── Overview Metrics ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
          <div onClick={() => setOpponentList(matchSummary)} className="cursor-pointer">
            <MetricCard label="训练赛场次" value={overview.total_matches} detail="点击查看对手" />
          </div>
          <MetricCard label="总回合数" value={overview.total_rounds} />
          <MetricCard label="胜场" value={overview.total_wins} color="text-emerald-400" />
          <MetricCard label="平局" value={overview.total_draws||0} color="text-draw-orange" />
          <MetricCard label="负场" value={overview.total_losses} color="text-ur-rose" />
          <MetricCard label="地图胜率" value={`${overview.win_rate||0}%`} color="text-ur-accent" />
        </div>

        {/* ── 选手高光(左) + 地图胜率统计(右) — 严格等高 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5 items-stretch">

          {/* LEFT: 选手高光 */}
          <PlayerHighlights highlights={highlights} error={hlError} mvpPlaceholder={mvpPlaceholder} />

          {/* RIGHT: 地图胜率统计 */}
          <MapWinRates mapStats={mapStats} onMapClick={openMapDetail} />
        </div>


        {/* ── Opponent Stats ── */}
        {opponentStats.length > 0 && (
          <div className="glass-panel rounded-3xl p-5 mb-5">
            <h2 className="text-lg font-bold text-white mb-1">对手统计</h2>
            <p className="text-xs text-ur-muted mb-4">交手最多的6支队伍 · 按胜率升序（低→高）</p>
            {(() => {
              const top6 = [...opponentStats]
                .sort((a, b) => (b.session_count||0) - (a.session_count||0))
                .slice(0, 6)
                .sort((a, b) => {
                  const wrA = (a.map_wins + a.map_losses) > 0 ? a.map_wins / (a.map_wins + a.map_losses) : 0;
                  const wrB = (b.map_wins + b.map_losses) > 0 ? b.map_wins / (b.map_wins + b.map_losses) : 0;
                  return wrA - wrB;
                });
              return (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${top6.length}, 1fr)` }}>
                  {top6.map(o => {
                    const totalResolved = o.map_wins + o.map_losses;
                    const winRate = totalResolved > 0 ? (o.map_wins / totalResolved * 100).toFixed(1) : 0;
                    const oppColor = o.map_wins > o.map_losses ? 'text-emerald-400' : o.map_wins < o.map_losses ? 'text-ur-rose' : 'text-draw-orange';
                    return (
                      <div key={o.opponent}
                           onClick={() => setOpponentDetail(o)}
                           className="rounded-lg p-4 text-center cursor-pointer transition-all duration-200
                                      border border-white/[0.06] bg-white/[0.03]
                                      hover:border-cyan-400/20 hover:bg-white/[0.06]">
                        <p className="text-sm text-ur-muted mb-1 truncate">{o.opponent}</p>
                        <p className={`text-2xl font-extrabold ${oppColor}`}>{o.session_count||0}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {o.total_maps||0}图
                          <span className="mx-1.5 text-gray-600">|</span>
                          W:{o.map_wins||0} L:{o.map_losses||0}
                          {(o.map_draws||0) > 0 && <span> D:{o.map_draws}</span>}
                        </p>
                        <div className="flex justify-center gap-1 mt-1.5">
                          {Object.values(o.maps||{}).slice(0, 3).map((mp, i) => (
                            <span key={i} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{background: (MAP_COLORS[mp.map_name]||'#444')+'22', color: MAP_COLORS[mp.map_name]||'#999'}}>
                              {mp.map_name.substring(0,3)}
                            </span>
                          ))}
                        </div>
                        <p className={`text-sm font-bold mt-1.5 ${Number(winRate)>=50?'text-emerald-400':'text-ur-rose'}`}>
                          {winRate}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
                  <tr className="text-ur-muted font-semibold bg-white/[0.035]">
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
                      <td className="py-3.5 px-4 text-ur-text">{m.match_date}</td>
                      <td className="py-3.5 px-4 text-ur-text font-semibold">{m.opponent}</td>
                      <td className="py-3.5 px-4 text-right text-ur-text font-mono">{m.rounds}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-ur-amber">{m.issue_rounds||0}</td>
                      <td className="py-3.5 px-4 text-center">
                        {m.map_results?.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {m.map_results.map((mr, i) => {
                              const hasScore = mr.our_score != null && mr.their_score != null;
                              // 胜负直接用比分判断(不依赖后端 result 字段,避免旧接口无 result 时变灰)
                              const result = hasScore
                                ? (mr.our_score > mr.their_score ? 'win'
                                   : mr.our_score < mr.their_score ? 'loss' : 'draw')
                                : null;
                              const color = result === 'win' ? 'var(--accent-green)'
                                          : result === 'loss' ? 'var(--accent-rose)'
                                          : result === 'draw' ? '#f97316'
                                          : '#4a5a6a';
                              return (
                                <span key={i}
                                  onClick={(e) => { e.stopPropagation(); openMatchDetail(m.id, mr.map_name); }}
                                  className="inline-flex items-center min-h-[24px] px-2 rounded-full text-xs cursor-pointer
                                    hover:ring-2 hover:ring-white/20 hover:scale-105 transition-all"
                                  style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                                  {mr.map_name?.substring(0,3)}{hasScore ? ` ${mr.our_score}-${mr.their_score}` : ' ?-?'}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
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
      {opponentDetail && <GlassModal title={`${opponentDetail.opponent} · 交手记录`} onClose={()=>setOpponentDetail(null)}>
        <OpponentDetailComponent detail={opponentDetail} />
      </GlassModal>}
      {matchDetail && <GlassModal title={`${matchDetail?.session?.opponent||''} · ${matchDetail?.session?.match_date||''}${matchMapFilter ? ' · ' + matchMapFilter : ''}`} onClose={()=>{setMatchDetail(null);setMatchMapFilter(null);}}>
        <MatchDetailComponent detail={matchDetail} mapFilter={matchMapFilter}
          onSaved={() => openMatchDetail(matchDetail?.session?.id, matchMapFilter)} />
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
                <span className="font-sans font-semibold text-white">{m.opponent}</span>
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
// CS2 地图 LOGO（来自 Valve CDN，格式稳定，无需登录）
const MAP_LOGOS = {
  Mirage:   '/uploads/maps/mirage.png',
  Dust2:    '/uploads/maps/dust2.png',
  Inferno:  '/uploads/maps/inferno.png',
  Nuke:     '/uploads/maps/nuke.png',
  Ancient:  '/uploads/maps/ancient.png',
  Anubis:   '/uploads/maps/anubis.png',
  Overpass: '/uploads/maps/overpass.png',
  Vertigo:  '/uploads/maps/vertigo.png',
  Train:    '/uploads/maps/train.png',
};

function MapWinRates({ mapStats, onMapClick }) {
  const ALL_MAPS = ['Anubis','Mirage','Dust2','Overpass','Ancient','Nuke'];

  const statMap = {};
  (mapStats || []).forEach(m => {
    const total = (m.match_wins||0) + (m.match_losses||0) + (m.match_draws||0);
    statMap[m.map_name] = { ...m, total, winRate: total > 0 ? (m.match_wins||0)/total*100 : 0 };
  });

  const rows = ALL_MAPS.map(name => statMap[name] || {
    map_name: name, match_wins:0, match_losses:0, match_draws:0, rounds:0, total:0, winRate:0,
  }).sort((a,b) => b.winRate - a.winRate);

  const MAX_H = 190;

  const BAR_GRADIENT = {
    Mirage:   ['rgba(255,224,160,0.28)','rgba(180,80,0,0.92)'],
    Dust2:    ['rgba(255,180,190,0.28)','rgba(140,0,30,0.92)'],
    Nuke:     ['rgba(120,255,200,0.28)','rgba(0,100,50,0.92)'],
    Ancient:  ['rgba(160,185,255,0.28)','rgba(10,30,160,0.92)'],
    Anubis:   ['rgba(210,170,255,0.28)','rgba(60,0,160,0.92)'],
    Overpass: ['rgba(255,210,160,0.28)','rgba(140,40,0,0.92)'],
  };

  return (
    <div className="glass-panel rounded-3xl p-5 h-full flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">地图胜率统计</h2>
        <p className="text-xs text-ur-muted mt-1">按胜率降序 · 点击查看详情</p>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* 图表主体 — 相对定位区，底部留给文字标签 */}
        <div className="relative flex-1" style={{ minHeight: MAX_H + 72 }}>

          {/* 格线 */}
          {[75,50,25].map(v => (
            <div key={v} className="absolute left-0 right-0 pointer-events-none"
                 style={{ bottom: `calc(${v}% * ${MAX_H/100}px + 72px)`, borderTop:'1px dashed rgba(255,255,255,0.05)' }} />
          ))}

          {/* 柱子行 — 绝对贴底，底部 72px 是文字区 */}
          <div className="absolute left-0 right-0 bottom-0 flex items-end justify-between"
               style={{ height: MAX_H + 72, paddingBottom: 72, gap: 10 }}>
            {rows.map(m => {
              const color = MAP_COLORS[m.map_name] || '#888';
              const grad  = BAR_GRADIENT[m.map_name] || ['rgba(200,200,200,0.2)','rgba(60,60,60,0.9)'];
              const logo  = mediaUrl(MAP_LOGOS[m.map_name] || '');
              const hasData = m.total > 0 || (m.rounds||0) > 0;
              const barH  = hasData ? Math.max(m.winRate / 100 * MAX_H, m.winRate > 0 ? 8 : 4) : 4;
              const wr    = Math.round(m.winRate);
              const isWin = m.winRate >= 50;

              return (
                <div key={m.map_name}
                     onClick={() => onMapClick(m.map_name)}
                     className="flex flex-col items-center cursor-pointer group flex-1 min-w-0"
                     style={{ gap: 0 }}>

                  {/* 胜率数字 — 柱顶正上方 */}
                  <div className="text-[12px] font-extrabold mb-1.5 transition-transform group-hover:scale-110 flex-shrink-0"
                       style={{ color: isWin ? color : '#4a5a6a' }}>
                    {hasData ? `${wr}%` : '—'}
                  </div>

                  {/* 3D柱子，宽度固定，LOGO贴满柱身 */}
                  <div className="relative flex-shrink-0 transition-all duration-300 group-hover:brightness-125"
                       style={{ width: 38, height: barH, borderRadius:'6px 6px 3px 3px', overflow:'hidden',
                                boxShadow: barH > 6 ? `0 0 22px ${color}50` : 'none' }}>
                    {/* 渐变底色 */}
                    <div className="absolute inset-0"
                         style={{ background:`linear-gradient(180deg,${grad[0]} 0%,${grad[1]} 100%)` }} />
                    {/* LOGO 铺满 */}
                    {logo && barH > 12 && (
                      <img src={logo} alt={m.map_name}
                           className="absolute inset-0 w-full h-full object-cover object-center"
                           style={{ opacity: 0.82, mixBlendMode:'luminosity' }}
                           onError={e=>{ e.currentTarget.style.display='none'; }} />
                    )}
                    {/* 左高光 */}
                    <div className="absolute top-0 bottom-0 left-0" style={{ width:7, background:'linear-gradient(90deg,rgba(255,255,255,0.20),transparent)' }} />
                    {/* 右阴影 */}
                    <div className="absolute top-0 bottom-0 right-0" style={{ width:5, background:'rgba(0,0,0,0.38)' }} />
                    {/* 顶高光 */}
                    <div className="absolute top-0 left-0 right-0" style={{ height:4, background:'linear-gradient(180deg,rgba(255,255,255,0.32),transparent)', borderRadius:'6px 6px 0 0' }} />
                    {/* 底收边 */}
                    <div className="absolute bottom-0 left-0 right-0" style={{ height:3, background:'rgba(0,0,0,0.40)' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 文字标签行 — 绝对贴底 */}
          <div className="absolute left-0 right-0 bottom-0 flex justify-between" style={{ height:68, gap:10 }}>
            {rows.map(m => {
              const color = MAP_COLORS[m.map_name] || '#888';
              return (
                <div key={m.map_name} className="flex-1 min-w-0 flex flex-col items-center justify-start pt-2 gap-0.5">
                  <span className="text-[10px] font-bold truncate w-full text-center" style={{ color }}>{m.map_name}</span>
                  <span className="text-[9px] text-white/25 truncate w-full text-center">
                    W{m.match_wins||0}/L{m.match_losses||0}{(m.match_draws||0)>0?`/D${m.match_draws}`:''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 选手高光（数据统计页·鼓励型）── */
/* 3 项最值得表扬：Rating 王 / 失误最少 / MVP（教练评） */
const HL_DEFS = [
  { key:'rating',     title:'Rating 王', color:'#FF9119' },
  { key:'fewest_err', title:'失误最少',  color:'#2bbf8f' },
  { key:'mvp',        title:'表现最好',  color:'#FFE000', mvp:true },
];
function PlayerHighlights({ highlights, error, mvpPlaceholder }) {
  const hl = highlights?.highlights || {};
  // "失误最少"：从 board 里取参与回合>0、失误总数最低的选手（与后端"失误率最低"在固定首发同回合数下同一人）
  const board = highlights?.board || [];
  const fewestErrW = board.filter(x => x.rounds > 0).sort((a,b) => a.errors - b.errors)[0] || null;
  // 是否有真实评选数据（占位不算）；全空 = 该日期范围内没有可评选数据
  const hasAny = !!(hl.rating || fewestErrW || hl.mvp);
  // MVP 暂无真人时，用 Goatnikola 头像占位（仅在本周期已有其它数据时显示，避免和"暂无数据"冲突）
  const mvpCard = hl.mvp || (hasAny && mvpPlaceholder
    ? { nickname: mvpPlaceholder.nickname, avatar_url: mvpPlaceholder.avatar_url, _placeholder: true }
    : null);
  const hlAll = {
    ...hl,
    fewest_err: fewestErrW && { ...fewestErrW, metric: fewestErrW.errors, unit: '失误总数' },
    mvp: mvpCard,
  };
  const fmtMetric = (key, w) => {
    if (!w) return '-';
    if (key==='rating')   return (w.metric!=null ? w.metric.toFixed(2) : '-');
    if (key==='err_rate') return <>{w.metric}<span style={{fontSize:'0.5em'}}>%</span></>;
    if (key==='fewest_err') return <>{w.metric}<span style={{fontSize:'0.46em',fontWeight:500,opacity:.7}}> 次</span></>;
    if (key==='mvp')      return <>{w.metric}<span style={{fontSize:'0.46em',fontWeight:500,opacity:.7}}> 次</span></>;
    if (key==='progress') return '▼'+w.metric;
    return w.metric;
  };
  return (
    <div className="glass-panel rounded-3xl p-6 h-full flex flex-col"
         style={{ background:'linear-gradient(165deg,rgba(2,42,153,0.08),rgba(255,255,255,0.02))' }}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><span style={{color:'#FFE000'}}>★</span> 选手高光</h2>
        <span className="text-xs text-ur-muted ml-auto">Rating · 失误最少 · MVP</span>
      </div>
      <p className="text-xs text-ur-muted mb-6">三项最值得表扬 · 一人可上榜多项</p>

      {(error || (highlights && !hasAny) || !highlights) && (
        <div className="mb-5 px-3 py-2 rounded-lg text-xs"
             style={ error
               ? { background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.35)', color:'#ff9b9b', fontWeight:500 }
               : { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#9aa6b2' } }>
          {error
            ? <>⚠ 高光接口出错：{error}</>
            : (!highlights ? '高光数据加载中…' : '本周期暂无可评选数据（所选日期内可能没有训练赛 / 失误记录）')}
        </div>
      )}

      <div className="flex-1 grid grid-cols-3 gap-5 content-center">
        {HL_DEFS.map(def => {
          const w = hlAll[def.key];
          const isMvp = def.mvp;
          const cardStyle = isMvp
            ? { background:'linear-gradient(165deg,rgba(2,42,153,0.40),rgba(255,255,255,0.04))',
                border:'2px solid #FFE000',
                boxShadow:'0 12px 48px rgba(2,42,153,0.45), 0 0 28px rgba(255,224,0,0.20), inset 0 1px 0 rgba(255,255,255,0.14)' }
            : { background:'rgba(255,255,255,0.04)',
                border:`2px solid ${def.color}`,
                boxShadow:`0 10px 40px rgba(0,0,0,0.35), 0 0 20px ${def.color}28, inset 0 1px 0 rgba(255,255,255,0.06)` };
          const ringStyle = isMvp
            ? { background:'linear-gradient(145deg,#FFE000,#022A99)' }
            : { background:`linear-gradient(145deg,${def.color},rgba(0,0,0,0.2))` };
          const badgeStyle = isMvp
            ? { background:'#FFE000', color:'#022A99' }
            : { background:def.color+'22', color:def.color, border:`1px solid ${def.color}55` };
          const valColor = isMvp ? '#FFE000' : def.color;
          return (
            <div key={def.key}
                 className="relative rounded-[22px] p-6 text-center flex flex-col items-center transition-transform duration-200 hover:-translate-y-1"
                 style={{ ...cardStyle, minHeight:300, backdropFilter:'blur(24px) saturate(150%)', WebkitBackdropFilter:'blur(24px) saturate(150%)' }}>

              {/* MVP 顶部徽章 */}
              {isMvp && (
                <div className="absolute left-1/2 -translate-x-1/2 text-[11px] font-extrabold px-3 py-0.5 rounded-[10px] whitespace-nowrap"
                     style={{ top:-10, background:'#FFE000', color:'#022A99', boxShadow:'0 2px 10px rgba(255,224,0,0.45)' }}>★ MVP</div>
              )}

              {/* 奖项标签 */}
              <span className="inline-block text-[12px] font-bold tracking-wide px-4 py-1.5 rounded-full mb-5"
                    style={{ ...badgeStyle, marginTop: isMvp ? 6 : 0 }}>{def.title}</span>

              {/* 头像 — 120px */}
              <div className="rounded-full p-[3px] mb-4 flex-shrink-0"
                   style={{ width:120, height:120, ...ringStyle,
                            boxShadow: isMvp ? '0 6px 24px rgba(255,224,0,0.35)' : `0 6px 20px ${def.color}50` }}>
                {w?.avatar_url
                  ? <img src={mediaUrl(w.avatar_url)} alt={w.nickname}
                         className="w-full h-full rounded-full object-cover object-top"
                         style={{ border:'2px solid rgba(12,17,24,0.7)' }}
                         onError={e=>{ e.currentTarget.style.display='none'; }} />
                  : <div className="w-full h-full rounded-full flex items-center justify-center text-xl font-bold text-white/60"
                         style={{ border:'2px solid rgba(12,17,24,0.7)', background:'rgba(255,255,255,0.03)' }}>
                      {w?.nickname ? w.nickname.slice(0,2).toUpperCase() : '—'}
                    </div>}
              </div>

              {/* 昵称 */}
              <p className="text-[18px] font-extrabold tracking-tight mb-3 leading-tight"
                 style={{ color: isMvp ? '#FFE000' : '#eef2f6' }}>
                {w?.nickname || '—'}
              </p>

              {/* 数值 */}
              {w?._placeholder ? (
                <>
                  <p className="text-[16px] font-bold text-gray-400 mt-1">待评选</p>
                  <p className="text-[11px] text-ur-muted mt-2">MVP · 待教练评选</p>
                </>
              ) : (
                <>
                  <p className="text-[36px] font-extrabold leading-none tracking-tight mt-auto"
                     style={{ color: w ? valColor : '#333' }}>
                    {fmtMetric(def.key, w)}
                  </p>
                  <p className="text-[11px] text-ur-muted mt-2 font-medium">{w?.unit || def.title}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color = 'text-white', detail }) {
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <p className="text-xs text-ur-muted">{label}</p>
      <p className={`mt-3 text-[34px] leading-none font-extrabold ${color}`}>{value ?? '-'}</p>
      {detail && <p className="mt-2 text-xs text-ur-muted">{detail}</p>}
    </div>
  );
}

/* ── Glass Modal ── */
function GlassModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onClick={onClose}>
      <div className="glass-panel rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[85vh] overflow-auto"
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
          <tr className="text-ur-muted border-b border-white/[0.08] sticky top-0 bg-ur-card">
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
        <MiniStat label="胜率" value={`${total>0?(wins/total*100).toFixed(1):0}%`} color="text-ur-accent" />
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

/* ── Opponent Detail ── */
function OpponentDetailComponent({ detail }) {
  const totalResolved = detail.map_wins + detail.map_losses;
  const winRate = totalResolved > 0 ? (detail.map_wins / totalResolved * 100).toFixed(1) : 0;
  const mapList = Object.values(detail.maps || {}).sort((a, b) => b.count - a.count);
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat label="交手场次" value={detail.session_count||0} />
        <MiniStat label="地图数" value={detail.total_maps||0} />
        <MiniStat label="胜" value={detail.map_wins||0} color="text-emerald-400" />
        <MiniStat label="负" value={detail.map_losses||0} color="text-ur-rose" />
        <MiniStat label="平" value={detail.map_draws||0} color="text-gray-400" />
        <MiniStat label="胜率" value={`${winRate}%`} color={Number(winRate)>=50?'text-emerald-400':'text-ur-rose'} />
        <MiniStat label="总回合" value={detail.total_rounds||0} />
        <MiniStat label="问题回合" value={detail.issue_rounds||0} color="text-ur-amber" />
      </div>

      {/* 地图分布 */}
      {mapList.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-bold text-white mb-3">地图分布</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {mapList.map(mp => {
              const total = mp.wins + mp.losses + mp.draws;
              return (
                <div key={mp.map_name} className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{color: MAP_COLORS[mp.map_name]||'#999'}}>{mp.map_name}</span>
                    <span className="text-xs text-gray-500">{total}场</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-emerald-400">W:{mp.wins}</span>
                    <span className="text-ur-rose">L:{mp.losses}</span>
                    {mp.draws > 0 && <span className="text-gray-500">D:{mp.draws}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 交手历史 */}
      {detail.match_records && detail.match_records.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-white mb-3">交手历史</h4>
          <div className="max-h-[45vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ur-muted bg-white/[0.035] sticky top-0">
                  <th className="text-left py-2.5 px-3 font-medium">日期</th>
                  <th className="text-left py-2.5 px-3 font-medium">地图</th>
                  <th className="text-right py-2.5 px-3 font-medium">比分</th>
                  <th className="text-center py-2.5 px-3 font-medium">结果</th>
                </tr>
              </thead>
              <tbody>
                {detail.match_records.map((rec, i) => (
                  rec.maps.map((m, j) => (
                    <tr key={`${i}-${j}`} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                      <td className="py-2 px-3 text-ur-muted">{j === 0 ? rec.date : ''}</td>
                      <td className="py-2 px-3 text-ur-text" style={{color: MAP_COLORS[m.map_name]||'#999'}}>{m.map_name}</td>
                      <td className="py-2 px-3 text-right text-ur-text font-mono">{m.our_score}-{m.their_score}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold
                          ${m.result==='win'?'bg-emerald-500/20 text-emerald-400':m.result==='loss'?'bg-rose-500/20 text-ur-rose':'bg-gray-500/20 text-gray-400'}`}>
                          {m.result==='win'?'胜':m.result==='loss'?'负':'平'}
                        </span>
                      </td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
// 弹窗三张表统一列宽（地图/选手 40% + 比分/Rating、CT/K-D、T/ADR 各 20%），保证三表上下对齐
function MatchCols() {
  return (
    <colgroup>
      <col style={{ width: '28%' }} />
      <col style={{ width: '24%' }} />
      <col style={{ width: '24%' }} />
      <col style={{ width: '24%' }} />
    </colgroup>
  );
}

// 选手数据表（UR / 对手 共用），列对齐两表完全一致；按 Rating 已在后端排序
function MatchPlayerTable({ rows }) {
  return (
    <table className="w-full text-xs table-fixed">
      <colgroup>
        <col style={{ width: '26%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '15%' }} />
      </colgroup>
      <thead>
        <tr className="text-ur-muted border-b border-white/[0.08]">
          <th className="text-left py-2 px-2 font-medium">选手</th>
          <th className="text-right py-2 px-2 font-medium">Rating</th>
          <th className="text-right py-2 px-2 font-medium">K-D</th>
          <th className="text-right py-2 px-2 font-medium">助攻</th>
          <th className="text-right py-2 px-2 font-medium">爆头%</th>
          <th className="text-right py-2 px-2 font-medium">ADR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const r = Number(p.rating) || 0;
          const rc = r >= 1.0 ? '#5dcaa5' : '#ff6b6b';
          return (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-white font-semibold truncate">{p.name}</td>
              <td className="py-2 px-2 text-right font-mono" style={{ color: rc }}>{r ? r.toFixed(2) : '—'}</td>
              <td className="py-2 px-2 text-right text-gray-300 font-mono">{p.kd}</td>
              <td className="py-2 px-2 text-right text-gray-300 font-mono">{p.assists ?? '—'}</td>
              <td className="py-2 px-2 text-right text-gray-300 font-mono">{p.hs ? p.hs + '%' : '—'}</td>
              <td className="py-2 px-2 text-right text-gray-300 font-mono">{p.adr || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MatchDetailComponent({ detail, mapFilter, onSaved }) {
  const session = detail.session || {};
  // 真实比分 + 半场CT/T（来自 matches 表，按地图）。若有 mapFilter 只显示该图
  let scores = detail.real_scores || [];
  if (mapFilter) scores = scores.filter(s => s.map === mapFilter);
  const urPlayers  = detail.players || [];
  const oppPlayers = detail.oppPlayers || [];

  // ── CT/T 半场得分手动编辑 ──
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});   // { matchId: { ct, t } }
  const [saving, setSaving] = useState(false);
  const startEdit = () => {
    const init = {};
    scores.forEach(s => { if (s.id != null) init[s.id] = { ct: s.ct ?? '', t: s.t ?? '' }; });
    setEdits(init); setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEdits({}); };
  const setVal = (id, key, v) => setEdits(p => ({ ...p, [id]: { ...(p[id] || {}), [key]: v } }));
  const saveEdit = async () => {
    setSaving(true);
    try {
      for (const s of scores) {
        if (s.id == null) continue;
        const e = edits[s.id] || {};
        await api.put(`/training/match/${s.id}/halfscore`, {
          ct_score: e.ct === '' || e.ct == null ? null : Number(e.ct),
          t_score:  e.t  === '' || e.t  == null ? null : Number(e.t),
        });
      }
      setEditing(false); setEdits({});
      if (onSaved) onSaved();   // 重新拉取，显示最新
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    }
    setSaving(false);
  };

  const hasAny = scores.length > 0 || urPlayers.length > 0 || oppPlayers.length > 0 || (detail.coach_notes && detail.coach_notes.length > 0);
  if (!hasAny) {
    return <p className="text-sm text-ur-muted py-8 text-center">该场暂无比赛数据（未导入比赛 JSON）</p>;
  }
  const canEdit = scores.some(s => s.id != null);
  const inputCls = "w-16 bg-white/[0.06] border border-white/[0.15] rounded px-2 py-0.5 text-right text-gray-100 [color-scheme:dark] outline-none focus:border-cyan-400/40";

  return (
    <div>
      {(detail.coach_notes && detail.coach_notes.length > 0) && (
        <div className="mb-5 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-cyan-300">📋 教练点评总结</span>
            <span className="text-xs text-ur-muted">{session.opponent} · {session.match_date} · 共 {detail.coach_notes.length} 条</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {detail.coach_notes.map((n, i) => (
              <div key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="shrink-0 font-mono text-xs text-ur-muted pt-0.5 min-w-[64px]">
                  {n.map ? n.map.substring(0,3) : '—'} {n.round || ''}
                </span>
                <span className="text-ur-text/90">{n.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 比分 / 半场 + 编辑按钮 */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-white">比分 / 半场得分</h4>
        {canEdit && (!editing
          ? <button onClick={startEdit}
              className="text-xs px-3 py-1 rounded-lg border border-white/[0.12] text-gray-300 hover:text-white hover:border-cyan-400/40 transition-all">
              ✏️ 编辑 CT/T
            </button>
          : <div className="flex gap-2">
              <button onClick={cancelEdit} disabled={saving}
                className="text-xs px-3 py-1 rounded-lg border border-white/[0.12] text-gray-400 hover:text-white transition-all">取消</button>
              <button onClick={saveEdit} disabled={saving}
                className="text-xs px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/25 transition-all">
                {saving ? '保存中…' : '保存'}</button>
            </div>)}
      </div>

      <table className="w-full text-xs table-fixed mb-6">
        <MatchCols />
        <thead>
          <tr className="text-ur-muted border-b border-white/[0.08]">
            <th className="text-left py-2 px-2 font-medium">地图</th>
            <th className="text-right py-2 px-2 font-medium">比分</th>
            <th className="text-right py-2 px-2 font-medium">CT得分</th>
            <th className="text-right py-2 px-2 font-medium">T得分</th>
          </tr>
        </thead>
        <tbody>
          {scores.length > 0 ? scores.map((s, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="py-2 px-2 text-gray-300 truncate">{s.map}</td>
              <td className="py-2 px-2 text-right font-mono font-bold"
                  style={{ color: s.result === 'win' ? '#5dcaa5' : s.result === 'loss' ? '#ff6b6b' : '#ffd700' }}>{s.our}-{s.their}</td>
              <td className="py-2 px-2 text-right font-mono text-gray-300">
                {editing && s.id != null
                  ? <input type="number" min="0" value={edits[s.id]?.ct ?? ''} onChange={e => setVal(s.id, 'ct', e.target.value)} className={inputCls} />
                  : (s.ct == null ? '—' : s.ct)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-gray-300">
                {editing && s.id != null
                  ? <input type="number" min="0" value={edits[s.id]?.t ?? ''} onChange={e => setVal(s.id, 't', e.target.value)} className={inputCls} />
                  : (s.t == null ? '—' : s.t)}
              </td>
            </tr>
          )) : (
            <tr><td colSpan={4} className="py-2 px-2 text-center text-ur-muted">暂无比分记录</td></tr>
          )}
        </tbody>
      </table>

      {/* UR 选手数据 */}
      <h4 className="text-sm font-bold text-white mb-2">UR 选手数据</h4>
      {urPlayers.length > 0
        ? <MatchPlayerTable rows={urPlayers} />
        : <p className="text-xs text-ur-muted">暂无 UR 选手数据</p>}

      {/* 分割线 */}
      <div className="my-6 border-t border-white/[0.08]" />

      {/* 对手选手数据 */}
      <h4 className="text-sm font-bold mb-2" style={{ color: '#ff6b6b' }}>{session.opponent || '对手'} 选手数据</h4>
      {oppPlayers.length > 0
        ? <MatchPlayerTable rows={oppPlayers} />
        : <p className="text-xs text-ur-muted">暂无对手选手数据</p>}
    </div>
  );
}




/* ── Tab 容器：数据统计 / 复盘报告 ── */
export default function TrainingReport() {
  const [view, setView] = useState('stats');
  const TABS = [['stats', '数据统计'], ['report', '赛训汇总报告']];
  return (
    <div className="p-6 md:p-8 lg:px-10">
      <div className="flex gap-2 mb-6">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-5 h-10 rounded-full text-sm font-semibold border transition-all
              ${view === k
                ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>
      {view === 'stats' && <StatsView />}
      {view === 'report' && <ReportView />}
    </div>
  );
}

/* ── 赛训汇总报告（原生 glass，读 /review-report 干净数据）── */
const REPORT_TYPE_COLORS = { 道具:'#ff8844', 走位:'#68e8ff', 沟通:'#cc66ff', 战术:'#5dcaa5', 枪法:'#f87171', 未分类:'#6b7d92', 教练点赞:'#34d399' };
const PRIORITY_COLORS = { P0:'#ff6b6b', P1:'#ffd700', P2:'#5dcaa5' };

function ReportView() {
  const _rnow = new Date();
  const today = `${_rnow.getFullYear()}-${String(_rnow.getMonth()+1).padStart(2,'0')}-${String(_rnow.getDate()).padStart(2,'0')}`;
  const [start, setStart] = useState(new Date(Date.now() - 29 * 864e5).toISOString().split('T')[0]);
  const [end, setEnd] = useState(today);
  const [preset, setPreset] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [typeDrill, setTypeDrill] = useState(null);   // 点失误类型卡
  const [cmdDrill, setCmdDrill] = useState(null);  // 点"指令执行率"→按图明细
  const [playerDrill, setPlayerDrill] = useState(null); // 点队员卡
  // A: 待改善问题 + 改进优先级（半自动：系统按失误统计生成，教练可编辑保留）
  const [notesEdit, setNotesEdit] = useState(false);
  const [improveText, setImproveText] = useState('');
  const [priorities, setPriorities] = useState([]);  // [{level:'P0', text:'', owner:''}]
  const [notesSaving, setNotesSaving] = useState(false);
  const [hasCustom, setHasCustom] = useState(false);  // 数据库是否存了教练版本

  const load = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/training-plans/review-report?from=${start}&to=${end}`);
      setData(res);
    } catch (e) { console.error(e); setData(null); }
    setLoading(false);
  };

  // A: 根据失误统计自动生成"待改善问题 + 优先级"
  //    优先级按失误数量：最多 P0(红)、次之 P1(黄)、其余 P2(绿)
  const buildAuto = (reportData) => {
    const ci = reportData?.core_issues || [];
    if (!ci.length) return { text: '', list: [] };
    // core_issues 已按 count 降序，前1=P0，第2=P1，其余=P2
    const list = ci.map((c, idx) => {
      const level = idx === 0 ? 'P0' : idx === 1 ? 'P1' : 'P2';
      const topWho = c.top_players?.[0];
      const ownerStr = topWho ? topWho.who : '';
      const whoDesc = c.top_players?.length
        ? '，' + c.top_players.map(tp => `${tp.who} ${tp.n} 次`).join('、')
        : '';
      return {
        level,
        text: `${c.type}失误 ${c.count} 次${whoDesc}`,
        owner: ownerStr,
        _auto: true,
      };
    });
    // 文字总结
    const top = ci[0];
    const text = `本周期失误集中在「${ci.map(c=>c.type).slice(0,3).join('、')}」等方面，` +
      `其中${top.type}失误最突出（${top.count} 次${top.top_players?.[0] ? '，' + top.top_players[0].who + ' 居首' : ''}）。建议优先针对上述问题制定专项训练。`;
    return { text, list };
  };

  // A: 加载教练版本；没有则用自动生成
  const loadNotes = async (reportData) => {
    try {
      const { data } = await api.get(`/training-plans/review-notes?from=${start}&to=${end}`);
      if (data.exists) {
        // 教练存过 → 用教练版本
        setImproveText(data.improve_text || '');
        setPriorities(Array.isArray(data.priorities) ? data.priorities : []);
        setHasCustom(true);
      } else {
        // 没存过 → 自动生成
        const auto = buildAuto(reportData);
        setImproveText(auto.text);
        setPriorities(auto.list);
        setHasCustom(false);
      }
    } catch (e) {
      const auto = buildAuto(reportData);
      setImproveText(auto.text);
      setPriorities(auto.list);
      setHasCustom(false);
    }
    setNotesEdit(false);
  };

  // 报告数据加载完后，再加载/生成 notes（依赖 core_issues）
  useEffect(() => { load(); }, [start, end]);
  useEffect(() => { if (data) loadNotes(data); }, [data]);
  useEffect(() => {
    api.get('/players?division=cs2&status=active&team_type=roster')
      .then(({ data }) => setPlayers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const applyPreset = (val) => {
    setPreset(val);
    const dStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    if (val === 'today')          { setStart(dStr(0)); setEnd(dStr(0)); }
    else if (val === 'yesterday') { setStart(dStr(1)); setEnd(dStr(1)); }
    else                          { setEnd(dStr(0)); setStart(dStr(val - 1)); }
  };

  // A: 保存教练编辑的待改善问题+优先级
  const saveNotes = async () => {
    setNotesSaving(true);
    try {
      await api.put(`/training-plans/review-notes?from=${start}&to=${end}`,
        { improve_text: improveText, priorities });
      setNotesEdit(false);
      setHasCustom(true);
    } catch (e) { alert('保存失败: ' + (e.response?.data?.error || e.message)); }
    setNotesSaving(false);
  };
  // A: 重置回系统自动生成
  const resetToAuto = () => {
    const auto = buildAuto(data);
    setImproveText(auto.text);
    setPriorities(auto.list);
  };
  const addPriority = () => setPriorities(p => [...p, { level:'P0', text:'', owner:'' }]);
  const updPriority = (i, k, v) => setPriorities(p => p.map((row,idx)=> idx===i ? {...row,[k]:v} : row));
  const delPriority = (i) => setPriorities(p => p.filter((_,idx)=>idx!==i));

  // 头像查找（兼容"花名≠昵称"，如 Azura↔Azura4ZM）
  const avatarOf = (name) => {
    const nl = (name||'').toLowerCase();
    if (!nl) return null;
    const p = players.find(x => {
      const nk = (x.nickname||'').toLowerCase(), nm = (x.name||'').toLowerCase();
      return nk===nl || nm===nl || (nl.length>=3 && (nk.includes(nl) || nl.includes(nk)));
    });
    return p?.avatar_url || null;
  };

  const summary = data?.summary || {};
  const byType = summary.by_type || {};
  const prev = data?.prev || {};
  const prevByType = prev.by_type || {};
  const compliance = data?.compliance || [];
  const playersData = data?.players || [];
  /* 现役/非现役拆分：在役名单(players=roster&active)再排除 roster_status='demoted'(下放) */
  const _activeSet = players.filter(x => String(x.roster_status || '') !== 'demoted');
  const _isActivePlayer = (name) => {
    const nl = (name || '').toLowerCase(); if (!nl) return false;
    return _activeSet.some(x => {
      const nk = (x.nickname || '').toLowerCase(), nm = (x.name || '').toLowerCase();
      return nk === nl || nm === nl || (nl.length >= 3 && (nk.includes(nl) || nl.includes(nk)));
    });
  };
  const activePlayersData   = playersData.filter(p => p.total > 0 &&  _isActivePlayer(p.name));
  const inactivePlayersData = playersData.filter(p => p.total > 0 && !_isActivePlayer(p.name));
  const coreIssues = (data?.core_issues || []).filter(c => c.type !== '教练点赞'); // 教练点赞是正向，不计入核心问题
  const incidents = data?.incidents || [];
  const TYPES = (data?.types || ['道具','沟通','战术','走位','枪法']).filter(t => t !== '教练点赞'); // 环比对照不含点赞

  const totalRounds = summary.total_rounds || 0;
  const probRounds = summary.problem_rounds || 0;
  const probRate = summary.problem_rate || 0;
  const prevRate = prev.problem_rate || 0;
  const rateDelta = Math.round((probRate - prevRate) * 10) / 10;

  // 指令执行率(口径A): IGL当回合所报战术是否在当天简报内, 只统计"已记录IGL指令"的回合
  const complRecorded = compliance.reduce((s,c)=>s+(c.recorded||0),0);
  const complPass = compliance.reduce((s,c)=>s+(c.pass||0),0);
  const cmdRate = complRecorded>0 ? Math.round(complPass/complRecorded*100) : null;
  const complRecordedMaps = compliance.filter(c => (c.recorded||0) > 0);   // 只留有IGL记录的图(去掉"未记录"噪音)
  // 指令执行率环比(上期)
  const prevCmdRate = (prev.cmd_rate != null) ? prev.cmd_rate : null;
  const cmdDelta = (prevCmdRate != null && cmdRate != null) ? Math.round((cmdRate - prevCmdRate) * 10) / 10 : 0;

  return (
    <div>
      {/* ── 顶部：标题 + 日期生成 ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] text-ur-muted font-mono tracking-widest mb-1.5">SAIXUN SUMMARY REPORT</p>
          <h2 className="text-2xl font-extrabold text-white">赛训汇总报告</h2>
          <p className="text-sm text-ur-muted mt-1">
            {data ? `${data.range?.from} ~ ${data.range?.to} · ${summary.matches||0} 场训练赛 · 三表联动（简报·日志·JSON）` : '加载中…'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1.5">
          {[['昨天','yesterday'],['今天','today'],['近7天',7],['近30天',30]].map(([lb,d]) => (
            <button key={d} onClick={() => applyPreset(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                preset===d ? 'bg-cyan-500/15 text-cyan-300' : 'text-gray-500 hover:text-gray-300'}`}>{lb}</button>
          ))}
          <span className="w-px h-5 bg-white/10" />
          <input type="date" value={start} onChange={e=>{setStart(e.target.value);setPreset(0);}}
            className="bg-ur-card border border-ur-border rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark] outline-none" />
          <span className="text-gray-600 text-xs">→</span>
          <input type="date" value={end} onChange={e=>{setEnd(e.target.value);setPreset(0);}}
            className="bg-ur-card border border-ur-border rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark] outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-ur-muted animate-pulse">生成报告中…</div>
      ) : !data || totalRounds === 0 ? (
        <div className="glass-panel rounded-3xl text-center py-20">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-ur-muted text-sm">该时间段暂无完整赛训数据（需同时具备 每日简报 + 训练日志 + 比赛JSON）。</p>
        </div>
      ) : (
        <>
          {/* ── 一、整体数据概览 ── */}
          <div className="glass-panel rounded-3xl p-6 mb-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-300">▦</span> 整体数据概览
              <span className="ml-auto text-[11px] text-ur-muted font-normal">点击失误类型查看明细 →</span>
            </h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))' }}>
              <StatBox label="总回合数" value={totalRounds} color="text-white" />
              <StatBox label="指令执行率"
                value={cmdRate==null ? '—' : cmdRate+'%'}
                color=""
                style={{ color: cmdRate==null ? '#6b7d92' : (cmdRate>=80 ? '#5dcaa5' : cmdRate>=50 ? '#ffd700' : '#ff6b6b') }}
                onClick={complRecordedMaps.length ? () => setCmdDrill(complRecordedMaps.filter(c => c.unexec?.length > 0)) : undefined} />
              <StatBox label="问题发生率" value={probRate+'%'} color="text-yellow-400" />
              {TYPES.map(t => (
                <StatBox key={t} label={t+'失误'} value={byType[t]||0}
                  color="" style={{ color: REPORT_TYPE_COLORS[t]||'#888' }}
                  onClick={() => setTypeDrill(t)} />
              ))}
            </div>
          </div>

          {/* ── 二、个人表现评估（放大卡片，移到环比上方）── */}
          <div className="glass-panel rounded-3xl p-6 mb-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-300">②</span> 个人表现评估
              <span className="ml-auto text-[11px] text-ur-muted font-normal">点击队员查看失误明细 →</span>
            </h3>
            {activePlayersData.length === 0 ? (
              <p className="text-sm text-ur-muted py-4 text-center">暂无现役队员失误记录</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${activePlayersData.length||1}, minmax(0,1fr))` }}>
                {activePlayersData.map(p => {
                  const av = avatarOf(p.name);
                  const praise = p.by_type?.['教练点赞'] || 0;
                  const types = Object.entries(p.by_type||{}).filter(([t,v])=>v>0 && t!=='教练点赞').sort((a,b)=>b[1]-a[1]);
                  const failTotal = types.reduce((s,[,v])=>s+v,0);
                  return (
                    <div key={p.name} onClick={()=>setPlayerDrill(p)}
                      className="glass-panel rounded-2xl p-4 cursor-pointer hover:border-cyan-400/30 transition-all border border-white/[0.05] min-w-0">
                      <div className="flex items-center gap-3 mb-3 min-w-0">
                        {av
                          ? <img src={mediaUrl(av)} alt={p.name} className="w-12 h-12 rounded-full object-cover object-top border-2 border-white/10 flex-shrink-0" onError={e=>{e.currentTarget.style.display='none';}} />
                          : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/40 to-blue-600/40 flex items-center justify-center font-bold text-white text-base flex-shrink-0">{(p.name||'?').slice(0,2).toUpperCase()}</div>}
                        <div className="min-w-0">
                          <div className="font-bold text-white text-base truncate">{p.name}</div>
                          <div className="text-[11px] text-ur-muted mt-0.5">共 <span className="text-yellow-400 font-semibold">{failTotal}</span> 次{praise>0 && <span className="text-emerald-400 font-semibold"> · 👍{praise}</span>}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {praise>0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold whitespace-nowrap" style={{ background:'#34d39926', color:'#34d399' }}>
                            👍 {praise}
                          </span>
                        )}
                        {types.map(([t,v]) => (
                          <span key={t} className="text-[11px] px-2 py-0.5 rounded-md font-semibold whitespace-nowrap"
                            style={{ background: (REPORT_TYPE_COLORS[t]||'#888')+'26', color: REPORT_TYPE_COLORS[t]||'#888' }}>
                            {t} {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {inactivePlayersData.length > 0 && (
              <details className="mt-4 group">
                <summary className="cursor-pointer text-[11px] text-ur-muted hover:text-gray-300 select-none flex items-center gap-1.5 py-1.5">
                  <span className="transition-transform group-open:rotate-90 inline-block">▸</span>
                  非现役队员数据（下放 / 离队 · {inactivePlayersData.length} 人）
                </summary>
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
                  {inactivePlayersData.map(p => {
                    const av = avatarOf(p.name);
                    const praise = p.by_type?.['教练点赞'] || 0;
                    const types = Object.entries(p.by_type||{}).filter(([t,v])=>v>0 && t!=='教练点赞').sort((a,b)=>b[1]-a[1]);
                    const failTotal = types.reduce((s,[,v])=>s+v,0);
                    return (
                      <div key={p.name} onClick={()=>setPlayerDrill(p)}
                        className="rounded-xl p-3 cursor-pointer border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] transition-all min-w-0 opacity-70 hover:opacity-100">
                        <div className="flex items-center gap-2 mb-2 min-w-0">
                          {av
                            ? <img src={mediaUrl(av)} alt={p.name} className="w-9 h-9 rounded-full object-cover object-top border border-white/10 flex-shrink-0 grayscale" onError={e=>{e.currentTarget.style.display='none';}} />
                            : <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-gray-300 text-xs flex-shrink-0">{(p.name||'?').slice(0,2).toUpperCase()}</div>}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-300 text-sm truncate">{p.name}</div>
                            <div className="text-[10px] text-ur-muted mt-0.5">共 <span className="text-yellow-400/80 font-semibold">{failTotal}</span> 次{praise>0 && <span className="text-emerald-400/80"> · 👍{praise}</span>}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {types.map(([t,v]) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                              style={{ background: (REPORT_TYPE_COLORS[t]||'#888')+'1f', color: REPORT_TYPE_COLORS[t]||'#888' }}>
                              {t} {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>

          {/* ── 三、环比对照（横向拉满）── */}
          <div className="glass-panel rounded-3xl p-6 mb-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-300">▥</span> 环比对照
              <span className="ml-auto text-[11px] text-ur-muted font-normal">vs 上一周期 ({prev.from} ~ {prev.to})</span>
            </h3>
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
              {/* 问题发生率环比 */}
              <div className="bg-white/[0.025] rounded-xl p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-ur-muted">问题发生率</span>
                  <span className="text-3xl font-extrabold text-yellow-400">{probRate}%</span>
                  {prevRate > 0 && (
                    <span className={`text-sm font-semibold ${rateDelta <= 0 ? 'text-emerald-400' : 'text-ur-rose'}`}>
                      {rateDelta <= 0 ? '▼' : '▲'} {Math.abs(rateDelta)}pp
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-1">上期 {prevRate}%</div>
              </div>
              {/* 指令执行率环比（指令执行率越高越好，方向与问题率相反）*/}
              <div className="bg-white/[0.025] rounded-xl p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-ur-muted">指令执行率</span>
                  <span className="text-3xl font-extrabold"
                    style={{ color: cmdRate==null ? '#6b7d92' : (cmdRate>=80 ? '#5dcaa5' : cmdRate>=50 ? '#ffd700' : '#ff6b6b') }}>
                    {cmdRate==null ? '—' : cmdRate+'%'}
                  </span>
                  {prevCmdRate != null && cmdRate != null && (
                    <span className={`text-sm font-semibold ${cmdDelta >= 0 ? 'text-emerald-400' : 'text-ur-rose'}`}>
                      {cmdDelta >= 0 ? '▲' : '▼'} {Math.abs(cmdDelta)}pp
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mt-1">{prevCmdRate==null ? '上期无记录' : '上期 '+prevCmdRate+'%'}</div>
              </div>
            </div>
            <CompareBars types={TYPES} cur={byType} prev={prevByType} />
          </div>

          {/* ── 四、核心问题（失误最高的4个类型）── */}
          <div className="glass-panel rounded-3xl p-6 mb-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-300">③</span> 核心问题
              <span className="ml-auto text-[11px] text-ur-muted font-normal">失误最高的 4 个类型 · 点击查看明细 →</span>
            </h3>
            {coreIssues.length === 0 ? (
              <p className="text-sm text-ur-muted py-4 text-center">本周期暂无失误记录 👍</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
                {coreIssues.map((c,i) => (
                  <div key={i} onClick={()=>setTypeDrill(c.type)}
                    className="bg-white/[0.025] rounded-xl p-4 border-l-4 cursor-pointer hover:bg-white/[0.05] transition-colors" style={{ borderColor: REPORT_TYPE_COLORS[c.type]||'#888' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white text-base">{c.type}失误</span>
                      <span className="text-lg font-extrabold" style={{ color: REPORT_TYPE_COLORS[c.type]||'#fff' }}>{c.count} 次</span>
                    </div>
                    {c.top_players?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {c.top_players.map(tp => (
                          <span key={tp.who} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.05] text-gray-300">
                            {tp.who} <span className="text-yellow-400 font-semibold">{tp.n}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {c.samples?.[0]?.detail && (
                      <div className="text-[11px] text-ur-muted truncate">{c.samples.map(s=>s.detail).filter(Boolean).slice(0,2).join('、')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* ── 五、待改善问题 & 改进优先级（系统自动生成 + 教练可编辑）── */}
          <div className="glass-panel rounded-3xl p-6 mb-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-300">④</span> 待改善问题 & 改进优先级
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${hasCustom ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/[0.06] text-gray-500'}`}>
                {hasCustom ? '教练已编辑' : '系统自动生成'}
              </span>
              {!notesEdit ? (
                <button onClick={()=>setNotesEdit(true)}
                  className="ml-auto text-[11px] px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-all font-medium">
                  ✏️ 编辑
                </button>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={resetToAuto}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.06] text-amber-300 hover:bg-white/[0.1] transition-all" title="丢弃当前内容，重新用系统自动生成">↻ 重置回自动</button>
                  <button onClick={()=>loadNotes(data)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] transition-all">取消</button>
                  <button onClick={saveNotes} disabled={notesSaving}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all font-medium">
                    {notesSaving ? '保存中…' : '💾 保存'}
                  </button>
                </div>
              )}
            </h3>

            {/* 待改善问题（自由文本） */}
            <div className="mb-5">
              <div className="text-xs text-ur-muted mb-2">待改善问题（教练总结）</div>
              {notesEdit ? (
                <textarea value={improveText} onChange={e=>setImproveText(e.target.value)}
                  placeholder="例如：道具基本功不扎实，烟雾丢呲频发；C4下包后缺乏标准交流流程……"
                  rows={5}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/40 resize-y leading-relaxed placeholder:text-gray-600" />
              ) : improveText ? (
                <div className="bg-white/[0.025] rounded-xl px-4 py-3 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{improveText}</div>
              ) : (
                <div className="text-sm text-gray-600 py-3 text-center bg-white/[0.015] rounded-xl">本周期暂无失误数据可总结</div>
              )}
            </div>

            {/* 改进优先级（P0/P1/P2 列表） */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-ur-muted">改进优先级</span>
                {notesEdit && (
                  <button onClick={addPriority}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25">+ 添加一项</button>
                )}
              </div>
              {priorities.length === 0 ? (
                <div className="text-sm text-gray-600 py-3 text-center bg-white/[0.015] rounded-xl">
                  {notesEdit ? '点「+ 添加一项」新增改进措施' : '暂未填写'}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {priorities.map((row,i) => (
                    <div key={i} className="flex items-center gap-2 bg-white/[0.025] rounded-xl px-3 py-2.5">
                      {notesEdit ? (
                        <>
                          <select value={row.level} onChange={e=>updPriority(i,'level',e.target.value)}
                            className="text-[11px] font-bold rounded px-2 py-1 border-0 outline-none cursor-pointer flex-shrink-0 [color-scheme:dark]"
                            style={{ background: PRIORITY_COLORS[row.level]+'26', color: PRIORITY_COLORS[row.level] }}>
                            {['P0','P1','P2'].map(l=><option key={l} value={l} style={{background:'#1a2332',color:'#fff'}}>{l}</option>)}
                          </select>
                          <input value={row.text} onChange={e=>updPriority(i,'text',e.target.value)}
                            placeholder="改进措施，例如：doomer/drace 专项道具训练"
                            className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40 placeholder:text-gray-600" />
                          <input value={row.owner} onChange={e=>updPriority(i,'owner',e.target.value)}
                            placeholder="负责人"
                            className="w-24 flex-shrink-0 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400/40 placeholder:text-gray-600" />
                          <button onClick={()=>delPriority(i)}
                            className="flex-shrink-0 w-7 h-7 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center text-sm">×</button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] font-bold rounded px-2 py-1 flex-shrink-0"
                            style={{ background: PRIORITY_COLORS[row.level]+'26', color: PRIORITY_COLORS[row.level] }}>{row.level}</span>
                          <span className="flex-1 text-sm text-gray-300">{row.text||'—'}</span>
                          {row.owner && <span className="text-xs text-cyan-300 flex-shrink-0">{row.owner}</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>


          <div className="text-center py-4 text-gray-700 text-[11px]">
            UR CS2 赛训汇总报告 · 数据源：每日简报 · 训练日志 · JSON比赛数据
          </div>
        </>
      )}

      {/* 失误类型下钻：按队员分组统计 */}
      {typeDrill && (
        <GlassModal title={`${typeDrill}失误 · 按队员统计`} onClose={()=>setTypeDrill(null)}>
          <TypeByPlayer incidents={incidents.filter(x=>x.type===typeDrill)} />
        </GlassModal>
      )}
      {/* 队员下钻 */}
      {playerDrill && (
        <GlassModal title={`${playerDrill.name} · 失误明细`} onClose={()=>setPlayerDrill(null)}>
          <ReportIncidentList
            incidents={incidents.filter(x=> x.who===playerDrill.name || (x.co_responsible||[]).includes(playerDrill.name))}
            onChanged={load} />
        </GlassModal>
      )}
      {/* 达标率未执行明细 */}
      {cmdDrill && (
        <GlassModal title="未按简报执行的回合" onClose={()=>setCmdDrill(null)}>
          <div className="text-xs text-ur-muted mb-4 leading-relaxed">
            以下回合 IGL 所报战术<span className="text-gray-300">不在当天简报内</span>（是否合理，请对照当天简报）。
          </div>
          {cmdDrill.length===0 ? (
            <p className="text-sm py-8 text-center" style={{color:'#5dcaa5'}}>本周期所有已记录回合都按简报执行了 👍</p>
          ) : (
            <div className="flex flex-col gap-5">
              {cmdDrill.map((c,i)=>(
                <div key={i}>
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <span className="text-sm text-white font-medium inline-flex items-center gap-2 min-w-0">
                      <span className="font-mono text-gray-400">{c.date?.slice(5)}</span>
                      <span className="text-gray-500">·</span>
                      <span className="truncate">{c.opponent||'-'}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{background:MAP_COLORS[c.map]||'#666'}} />
                        {c.map}
                      </span>
                    </span>
                    <span className="text-sm font-bold flex-shrink-0"
                      style={{ color: c.status==='pass'?'#5dcaa5':c.status==='fail'?'#ff6b6b':'#6b7d92' }}>
                      {c.rate==null ? '-' : c.rate+'%'}
                      <span className="text-[11px] text-ur-muted font-normal ml-1.5">({c.pass||0}/{c.recorded||0})</span>
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {c.unexec.map((u,j)=>(
                      <div key={j} className="rounded-xl px-4 py-3.5 bg-white/[0.05] border border-white/[0.08]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[15px] font-mono font-extrabold text-cyan-300">{u.round}</span>
                          {u.side && <span className="text-[12px] px-2.5 py-1 rounded-md bg-white/[0.08] text-gray-200 font-bold tracking-wide">{u.side}</span>}
                          <span className="text-[13px] text-ur-muted ml-1">IGL 指令</span>
                          <span className="text-[19px] font-extrabold text-ur-rose tracking-tight">{u.igl || '—'}</span>
                        </div>
                        {u.note && u.note !== u.igl && (
                          <div className="text-[12.5px] text-gray-400 mt-2 pl-1">{u.note}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassModal>
      )}
    </div>
  );
}

/* 概览统计小卡 */
function StatBox({ label, value, color, style, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white/[0.03] rounded-xl p-3 text-center ${onClick?'cursor-pointer hover:bg-cyan-500/[0.06] transition-colors':''}`}>
      <div className={`text-2xl font-extrabold leading-none ${color}`} style={style}>{value}</div>
      <div className="text-[11px] text-ur-muted mt-1.5">{label}</div>
    </div>
  );
}

/* 环比分组柱状图（灰=上期 彩=本期 + 升降） */
function CompareBars({ types, cur, prev }) {
  const max = Math.max(1, ...types.map(t => Math.max(cur[t]||0, prev[t]||0)));
  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-ur-muted mb-3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#3a4a5a'}} />上期</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />本期</span>
      </div>
      <div className="flex items-end gap-3 w-full" style={{ minHeight: 130 }}>
        {types.map(t => {
          const c = cur[t]||0, p = prev[t]||0;
          const delta = c - p;
          const col = REPORT_TYPE_COLORS[t]||'#888';
          return (
            <div key={t} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-end justify-center gap-1.5 w-full" style={{ height: 90 }}>
                <div className="rounded-t" style={{ width:'40%', maxWidth:36, height: Math.max(3,(p/max)*90), background:'#3a4a5a' }} title={`上期 ${p}`} />
                <div className="rounded-t" style={{ width:'40%', maxWidth:36, height: Math.max(3,(c/max)*90), background: col }} title={`本期 ${c}`} />
              </div>
              <span className="text-xs text-gray-300 font-medium">{t}</span>
              <span className={`text-[11px] font-semibold ${delta<=0?'text-emerald-400':'text-ur-rose'}`}>
                {delta===0?'—':(delta<0?'▼':'▲')+Math.abs(delta)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 某类型失误 → 按队员分组统计（第6条）*/
function TypeByPlayer({ incidents }) {
  if (!incidents.length) return <p className="text-sm text-ur-muted py-6 text-center">无记录</p>;
  const map = {};
  for (const x of incidents) {
    const bump = (w) => { if (w && w!=='全队') map[w] = (map[w]||0) + 1; };
    bump(x.who);
    for (const co of (x.co_responsible||[])) if (co!==x.who) bump(co);
  }
  const rows = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(1, ...rows.map(r=>r[1]));
  const [expand, setExpand] = useState(null);
  return (
    <div>
      <div className="text-xs text-ur-muted mb-3">共 {incidents.length} 条 · 按队员统计（含连带，全队失误不计入）</div>
      <div className="flex flex-col gap-2">
        {rows.map(([who,n]) => {
          const list = incidents.filter(x => x.who===who || (x.co_responsible||[]).includes(who));
          const open = expand===who;
          return (
            <div key={who} className="bg-white/[0.025] rounded-xl overflow-hidden">
              <div onClick={()=>setExpand(open?null:who)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]">
                <span className="font-bold text-white w-20 flex-shrink-0">{who}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: (n/max*100)+'%' }} />
                </div>
                <span className="text-sm font-bold text-yellow-400 w-12 text-right flex-shrink-0">{n} 次</span>
              </div>
              {open && (
                <div className="px-4 pb-3 flex flex-col gap-1">
                  {list.map((x,i)=>(
                    <div key={i} className="text-xs text-ur-muted flex gap-2">
                      <span className="font-mono text-gray-600 flex-shrink-0">{(x.date||'').slice(5)} {x.map} {x.round}</span>
                      <span>{x.detail||'-'}{x.who!==who && <span className="text-gray-600">（连带）</span>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 报告失误明细列表（下钻弹窗内容，类型可下拉编辑） */
function ReportIncidentList({ incidents, onChanged }) {
  const TYPE_OPTS = ['道具','沟通','战术','走位','枪法','教练点赞','未分类'];
  const [savingId, setSavingId] = useState(null);
  const [localTypes, setLocalTypes] = useState({});  // {id: 新类型} 本地即时反映

  if (!incidents.length) return <p className="text-sm text-ur-muted py-6 text-center">无记录</p>;

  const changeType = async (inc, newType) => {
    if (!inc.id) return;
    setSavingId(inc.id);
    setLocalTypes(prev => ({ ...prev, [inc.id]: newType }));  // 即时反映
    try {
      await api.put(`/training-plans/review/incident/${inc.id}`, {
        category: newType,
        responsible: inc.who,
        co_responsible: inc.co_responsible || [],
        detail: inc.detail || '',
      });
      if (onChanged) onChanged();   // 通知父组件刷新报告数据
    } catch (e) {
      alert('修改失败: ' + (e.response?.data?.error || e.message));
      setLocalTypes(prev => { const n={...prev}; delete n[inc.id]; return n; });  // 回滚
    }
    setSavingId(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-ur-muted mb-1">共 {incidents.length} 条 · 类型可点下拉修改</div>
      {incidents.map((x,i) => {
        const curType = localTypes[x.id] != null ? localTypes[x.id] : x.type;
        return (
          <div key={i} className="bg-white/[0.025] rounded-lg px-4 py-2.5 flex items-start gap-3">
            <span className="text-[11px] font-mono text-gray-500 flex-shrink-0 mt-1">{(x.date||'').slice(5)} {x.map} {x.round}</span>
            <span className="flex-1 min-w-0 flex items-center flex-wrap gap-2">
              {/* 类型下拉 */}
              <select
                value={curType}
                disabled={!x.id || savingId===x.id}
                onChange={e => changeType(x, e.target.value)}
                className="text-[11px] font-semibold rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer [color-scheme:dark]"
                style={{ background:(REPORT_TYPE_COLORS[curType]||'#888')+'26', color:REPORT_TYPE_COLORS[curType]||'#888' }}>
                {TYPE_OPTS.map(t => <option key={t} value={t} style={{background:'#1a2332',color:'#fff'}}>{t}</option>)}
              </select>
              {savingId===x.id && <span className="text-[10px] text-cyan-300">保存中…</span>}
              <b className="text-white text-sm">{x.who}</b>
              {x.co_responsible?.length>0 && <span className="text-gray-500 text-xs">+{x.co_responsible.join(',')}</span>}
              {x.detail && <span className="text-ur-muted text-xs">{x.detail}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}


