import { useState, useEffect, useRef } from 'react';
import api from '../api';

// ── Utils ──
const n = (v, d = 0) => (v != null ? Number(v).toFixed(d) : '—');
const daysSince = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr); if (isNaN(d.getTime())) return '—';
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// ── Style — replicates cs2-dashboard.html visual design ──
const style = `
.dash-wrap * { margin:0; padding:0; box-sizing:border-box; }
.dash-wrap {
  --p: #00d4ff; --pd: #0099cc; --pg: rgba(0,212,255,0.3);
  --bg: #060b14; --bgc: rgba(16,24,48,0.85); --bgp: rgba(8,14,32,0.9);
  --tp: #e2e8f0; --ts: #8b9ab0; --td: #5a6a85;
  --suc: #00e676; --dan: #ff1744; --warn: #ffab00;
  --bd: rgba(0,212,255,0.15); --bds: rgba(0,212,255,0.3);
  font-family: 'Microsoft YaHei','PingFang SC',sans-serif; color:var(--tp); line-height:1.5;
}
.dash-wrap .panel {
  background:var(--bgp); border:1px solid var(--bd); border-radius:8px; position:relative; overflow:visible;
}
.dash-wrap .panel::before,.dash-wrap .panel::after { content:''; position:absolute; width:8px; height:8px; border:2px solid var(--p); z-index:2; }
.dash-wrap .panel::before { top:-1px; left:-1px; border-right:none; border-bottom:none; }
.dash-wrap .panel::after { top:-1px; right:-1px; border-left:none; border-bottom:none; }
.dash-wrap .panel-inner { position:relative; padding:18px; }
.dash-wrap .panel-inner::before,.dash-wrap .panel-inner::after { content:''; position:absolute; width:8px; height:8px; border:2px solid var(--p); z-index:2; }
.dash-wrap .panel-inner::before { bottom:-1px; left:-1px; border-right:none; border-top:none; }
.dash-wrap .panel-inner::after { bottom:-1px; right:-1px; border-left:none; border-top:none; }
.dash-wrap .panel-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--bd); }
.dash-wrap .panel-icon { width:4px; height:16px; border-radius:2px; background:linear-gradient(135deg,var(--p),#0066cc); flex-shrink:0; }
.dash-wrap .panel-icon.warn { background:linear-gradient(135deg,var(--warn),#ff6d00); }
.dash-wrap .panel-icon.danger { background:linear-gradient(135deg,var(--dan),#d50000); }
.dash-wrap .panel-title { font-size:14px; font-weight:600; letter-spacing:1px; }
.dash-wrap .panel-badge { margin-left:auto; font-size:11px; padding:2px 10px; border-radius:4px; background:rgba(0,212,255,0.08); color:var(--p); border:1px solid var(--bd); white-space:nowrap; }
.dash-wrap .grid-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-bottom:16px; }
.dash-wrap .glow-line { height:1px; background:linear-gradient(90deg,transparent,var(--p),transparent); margin:12px 0; opacity:0.25; }
.dash-wrap .data-table { width:100%; border-collapse:collapse; font-size:12px; }
.dash-wrap .data-table th { padding:9px 8px; text-align:left; color:var(--ts); font-weight:500; border-bottom:1px solid var(--bd); font-size:11px; letter-spacing:1px; }
.dash-wrap .data-table td { padding:8px; color:var(--tp); border-bottom:1px solid rgba(0,212,255,0.04); }
.dash-wrap .data-table tr { transition:background 0.2s; }
.dash-wrap .data-table tr:hover td { background:rgba(0,212,255,0.06); }
.dash-wrap .tag { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; }
.dash-wrap .tag-win { background:rgba(0,230,118,0.15); color:var(--suc); border:1px solid rgba(0,230,118,0.25); }
.dash-wrap .tag-loss { background:rgba(255,23,68,0.15); color:var(--dan); border:1px solid rgba(255,23,68,0.25); }
.dash-wrap .score-cell { font-family:Orbitron,monospace; font-weight:600; }
.dash-wrap .stat-card { display:flex; flex-direction:column; align-items:center; padding:12px; background:rgba(0,212,255,0.03); border:1px solid var(--bd); border-radius:6px; }
.dash-wrap .stat-label { font-size:11px; color:var(--td); margin-bottom:4px; }
.dash-wrap .stat-value { font-family:Orbitron,monospace; font-size:20px; font-weight:600; }

/* KPI */
.dash-wrap .kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:18px; }
.dash-wrap .kpi-card { display:flex; align-items:center; gap:14px; padding:16px 18px; background:var(--bgp); border:1px solid var(--bd); border-radius:8px; position:relative; }
.dash-wrap .kpi-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(135deg,var(--p),#0066cc); opacity:0.5; }
.dash-wrap .kpi-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:800; background:rgba(0,212,255,0.06); color:var(--p); font-family:Orbitron,monospace; }
.dash-wrap .kpi-info { flex:1; }
.dash-wrap .kpi-label { font-size:12px; color:var(--td); margin-bottom:3px; }
.dash-wrap .kpi-value { font-family:Orbitron,monospace; font-size:24px; font-weight:700; }
.dash-wrap .kpi-trend { font-size:11px; margin-top:3px; }

/* Top Row */
.dash-wrap .top-row { display:grid; grid-template-columns:320px 1fr 320px; gap:16px; margin-bottom:18px; }
.dash-wrap .match-event { font-size:17px; font-weight:700; color:var(--p); margin-bottom:6px; font-family:Orbitron,monospace; text-align:center; }
.dash-wrap .match-stage { font-size:12px; color:var(--ts); margin-bottom:14px; text-align:center; }
.dash-wrap .match-vs { display:flex; align-items:center; justify-content:center; gap:18px; margin-bottom:14px; }
.dash-wrap .match-team-name { font-size:22px; font-weight:700; }
.dash-wrap .match-team-rank { font-size:11px; color:var(--td); margin-top:2px; }
.dash-wrap .match-vs-text { font-family:Orbitron,monospace; font-size:18px; color:var(--p); font-weight:700; }
.dash-wrap .h2h-dot { width:6px; height:6px; border-radius:50%; }
.dash-wrap .h2h-dot.win { background:var(--suc); }
.dash-wrap .h2h-dot.loss { background:var(--dan); }

/* Scrim opponent */
.dash-wrap .scrim-vs-label { font-family:Orbitron,monospace; font-size:14px; color:var(--p); margin-bottom:6px; text-align:center; }
.dash-wrap .scrim-name { font-size:24px; font-weight:700; color:var(--tp); text-align:center; margin-bottom:8px; }
.dash-wrap .scrim-maps { font-size:13px; color:var(--ts); text-align:center; margin-bottom:12px; }
.dash-wrap .scrim-info-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.dash-wrap .scrim-info-item { text-align:center; }
.dash-wrap .scrim-info-label { font-size:10px; color:var(--td); margin-bottom:2px; }
.dash-wrap .scrim-info-val { font-size:13px; color:var(--tp); font-weight:500; }

/* Map grid */
.dash-wrap .map-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:12px; }
.dash-wrap .map-card { background:rgba(0,212,255,0.03); border:1px solid var(--bd); border-radius:8px; padding:12px 8px; text-align:center; transition:all 0.3s; cursor:pointer; }
.dash-wrap .map-card:hover { border-color:var(--p); background:rgba(0,212,255,0.06); transform:translateY(-2px); }
.dash-wrap .map-card-img { width:64px; height:40px; object-fit:cover; border-radius:4px; margin-bottom:8px; border:1px solid var(--bd); }
.dash-wrap .map-card-name { font-size:13px; font-weight:600; color:var(--tp); margin-bottom:4px; }
.dash-wrap .map-card-count { font-size:11px; color:var(--td); margin-bottom:6px; }
.dash-wrap .map-card-bar { height:3px; border-radius:2px; background:rgba(255,255,255,0.06); overflow:hidden; margin-bottom:4px; }
.dash-wrap .map-card-bar-fill { height:100%; border-radius:2px; transition:width 0.5s; }
.dash-wrap .map-card-wr { font-family:Orbitron,monospace; font-size:14px; font-weight:700; }

/* Modal */
.dash-wrap .modal-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); backdrop-filter:blur(4px); }
.dash-wrap .modal-box { background:var(--bgp); border:1px solid var(--bds); border-radius:12px; width:100%; max-width:640px; max-height:85vh; overflow-y:auto; padding:24px; margin:16px; }
.dash-wrap .modal-box.fullscreen { max-width:90vw; max-height:90vh; }
.dash-wrap .modal-close { position:absolute; top:12px; right:12px; width:32px; height:32px; border-radius:6px; background:rgba(255,23,68,0.1); border:1px solid rgba(255,23,68,0.2); color:var(--dan); cursor:pointer; font-size:18px; display:flex; align-items:center; justify-content:center; }
.dash-wrap .modal-title { font-size:18px; font-weight:700; color:var(--p); font-family:Orbitron,monospace; margin-bottom:4px; }
.dash-wrap .modal-subtitle { font-size:12px; color:var(--ts); margin-bottom:16px; }
.dash-wrap .modal-info-row { display:flex; gap:12px; margin-bottom:16px; }
.dash-wrap .modal-section-title { font-size:14px; font-weight:600; color:var(--tp); margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--bd); }
.dash-wrap .modal-coach-comment { margin-top:16px; padding:12px; background:rgba(0,212,255,0.04); border:1px solid var(--bd); border-radius:6px; font-size:12px; color:var(--ts); line-height:1.6; }
`;

// ── KPI Card Component ──
function KpiCard({ icon, label, value, valueColor, trend }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ color: valueColor || 'var(--p)' }}>{icon}</div>
      <div className="kpi-info">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{ color: valueColor || 'var(--p)' }}>{value}</div>
        <div className="kpi-trend">{trend}</div>
      </div>
    </div>
  );
}

// ── Panel wrapper ──
function Panel({ iconClass, title, badge, children }) {
  return (
    <div className="panel">
      <div className="panel-inner" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className={'panel-icon' + (iconClass ? ' ' + iconClass : '')}></div>
          <div className="panel-title">{title}</div>
          {badge && <div className="panel-badge">{badge}</div>}
        </div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { type:'match'|'map', data }
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get('/dashboard/overview').then(r => setData(r.data)).catch(e => setError(e.message)).finally(() => setLoading(false));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="dash-wrap flex items-center justify-center min-h-[300px]"><div className="kpi-value" style={{color:'var(--p)'}}>加载中...</div></div>;
  if (error) return <div className="dash-wrap"><div className="panel"><div className="panel-inner"><p style={{color:'var(--dan)'}}>数据加载失败: {error}</p></div></div></div>;
  if (!data) return null;

  const { kpi, upcomingMatch, recentMatches, playerStats, hsStats, teamAverages, mapStats, matchDetails, peripherals, inventory } = data;
  const mapImg = (name) => {
    const m = { Inferno:'inferno', Mirage:'mirage', Nuke:'nuke', Ancient:'ancient', Anubis:'anubis', Overpass:'overpass', Dust2:'dust2', Train:'train', Vertigo:'vertigo' };
    return m[name] ? `/images/maps/${m[name]}.png` : null;
  };

  // Countdown (if upcoming)
  const countdown = upcomingMatch ? (() => {
    const target = new Date(upcomingMatch.match_date + 'T' + (upcomingMatch.match_time || '00:00'));
    const diff = target - now;
    if (diff <= 0) return { d:0, h:0, m:0, s:0 };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  })() : null;

  return (
    <div className="dash-wrap" style={{ maxWidth: 1600, margin: '0 auto', padding: '16px 28px' }}>
      <style>{style}</style>

      {/* ═══ KPI Row ═══ */}
      <div className="kpi-row">
        <KpiCard icon="#" label="VRS Asia 排名" value={kpi.vrsRank ? '#' + kpi.vrsRank : '—'} valueColor="var(--p)" trend={kpi.vrsRank ? '实时排名' : '未配置'} />
        <KpiCard icon="W" label="近十场胜率" value={kpi.recentWinRate + '%'} valueColor={kpi.recentWinRate >= 50 ? 'var(--suc)' : 'var(--dan)'} trend={kpi.recentWins + '胜 / ' + (kpi.totalRecentMatches - kpi.recentWins) + '负'} />
        <KpiCard icon="Q" label="训练质量" value={kpi.trainingQuality + '%'} valueColor={kpi.trainingQuality >= 70 ? 'var(--warn)' : 'var(--dan)'} trend={<span style={{cursor:'help',borderBottom:'1px dashed var(--td)',fontSize:11}}>计算逻辑</span>} />
        <KpiCard icon="D" label="分部已成立" value={daysSince(kpi.foundedDate) !== '—' ? daysSince(kpi.foundedDate) + '天' : '—'} valueColor="var(--p)" trend={(kpi.foundedDate || '') + ' 成立'} />
      </div>

      {/* ═══ Top Row: Upcoming | Cam | Scrim ═══ */}
      <div className="top-row">
        {/* ── 即将赛事 ── */}
        <Panel iconClass="danger" title="即将开始赛事" badge={upcomingMatch ? countdown.d + '天后' : '暂无'}>
          {upcomingMatch ? (
            <div style={{ textAlign: 'center' }}>
              <div className="match-event">{upcomingMatch.event_name || '赛事'}</div>
              <div className="match-stage">{upcomingMatch.stage || ''}</div>
              <div className="match-vs">
                <div style={{textAlign:'center'}}>
                  <div className="match-team-name" style={{color:'var(--p)'}}>UR</div>
                  <div className="match-team-rank">#{kpi.vrsRank || '—'}</div>
                </div>
                <div className="match-vs-text">VS</div>
                <div style={{textAlign:'center'}}>
                  <div className="match-team-name" style={{color:'var(--tp)'}}>{upcomingMatch.opponent}</div>
                  <div className="match-team-rank">{upcomingMatch.match_type === 'official' ? '正式赛' : '训练赛'}</div>
                </div>
              </div>
              <div style={{fontSize:12,color:'var(--ts)',marginBottom:14}}>
                {upcomingMatch.match_date} {upcomingMatch.match_time || ''}
              </div>
              {countdown && (
                <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:12}}>
                  {[{v:countdown.d,l:'天'},{v:countdown.h,l:'时'},{v:countdown.m,l:'分'},{v:countdown.s,l:'秒'}].map((c,i) => (
                    <div key={i} style={{textAlign:'center'}}>
                      <div style={{fontFamily:'Orbitron',fontSize:26,fontWeight:700,color:'var(--p)',padding:'6px 10px',background:'rgba(0,212,255,0.04)',border:'1px solid var(--bd)',borderRadius:6,minWidth:46}}>
                        {String(c.v).padStart(2,'0')}
                      </div>
                      <div style={{fontSize:9,color:'var(--td)',marginTop:3}}>{c.l}</div>
                    </div>
                  ))}
                </div>
              )}
              {(data.h2hFromDb && (data.h2hFromDb.wins + data.h2hFromDb.losses > 0)) && (
                <div className="h2h-dot" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:11,color:'var(--td)',marginTop:8}}>
                  <span>历史交手: </span>
                  {[...Array(data.h2hFromDb.wins)].map((_,i) => <span key={'w'+i} className="h2h-dot win"/>)}
                  {[...Array(data.h2hFromDb.losses)].map((_,i) => <span key={'l'+i} className="h2h-dot loss"/>)}
                  <span style={{fontFamily:'Orbitron',color:'var(--ts)'}}>{data.h2hFromDb.wins}W : {data.h2hFromDb.losses}L</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--td)'}}>
              <div style={{fontSize:48,opacity:0.3,marginBottom:12}}>📅</div>
              <div>近期暂无正赛规划</div>
            </div>
          )}
        </Panel>

        {/* ── 中间动态区域 ── */}
        <div className="panel">
          <div className="panel-inner">
            <div className="panel-header">
              <div className="panel-icon"></div>
              <div className="panel-title">数据枢纽</div>
            </div>
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <div style={{width:120,height:120,margin:'0 auto 16px',borderRadius:'50%',background:'radial-gradient(circle, rgba(0,212,255,0.15), transparent 70%)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--bd)'}}>
                <span style={{fontFamily:'Orbitron',fontSize:20,fontWeight:900,color:'var(--p)'}}>LINK</span>
              </div>
              <div style={{color:'var(--tp)',marginBottom:4}}>数据联动核心</div>
              <div style={{fontSize:11,color:'var(--td)'}}>DATA HUB · CONNECTED</div>
            </div>
          </div>
        </div>

        {/* ── 今日训练对象 ── */}
        <Panel iconClass="warn" title="今日训练赛对象" badge={upcomingMatch?.bo_format || (upcomingMatch ? '待定' : '暂无')}>
          {upcomingMatch ? (
            <div style={{textAlign:'center'}}>
              <div className="scrim-vs-label">VS</div>
              <div className="scrim-name">{upcomingMatch.opponent}</div>
              {data.opponentIntel?.vrs_rank && (
                <span className="tag" style={{fontSize:13,padding:'4px 12px',background:'rgba(0,212,255,0.08)',color:'var(--p)'}}>
                  #{data.opponentIntel.vrs_rank} {data.opponentIntel.region || ''}
                </span>
              )}
              <div className="scrim-maps">{upcomingMatch.bo_format || '地图待定'}</div>
              <div className="glow-line" style={{margin:'12px 0'}}></div>
              <div className="scrim-info-grid">
                <div className="scrim-info-item">
                  <div className="scrim-info-label">近期交手</div>
                  <div className="scrim-info-val" style={{color:'var(--warn)'}}>
                    {data.h2hFromDb ? `${data.h2hFromDb.wins || 0}W / ${data.h2hFromDb.losses || 0}L` : '—'}
                  </div>
                </div>
                <div className="scrim-info-item">
                  <div className="scrim-info-label">比赛时间</div>
                  <div className="scrim-info-val">{upcomingMatch.match_time || '待定'}</div>
                </div>
                {data.opponentIntel?.map_preference && (
                  <div className="scrim-info-item">
                    <div className="scrim-info-label">地图倾向</div>
                    <div className="scrim-info-val" style={{fontSize:12}}>{data.opponentIntel.map_preference}</div>
                  </div>
                )}
                {data.opponentIntel?.core_players && (
                  <div className="scrim-info-item">
                    <div className="scrim-info-label">核心选手</div>
                    <div className="scrim-info-val" style={{fontSize:12}}>{data.opponentIntel.core_players}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--td)'}}>
              <div style={{fontSize:48,opacity:0.3,marginBottom:12}}>🎯</div>
              <div>今日暂无训练赛排程</div>
            </div>
          )}
        </Panel>
      </div>

      {/* ═══ 近五场赛事 + 选手数据 ═══ */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* ── 近五场赛事 ── */}
        <div className="panel" style={{overflow:'hidden'}}>
          <div className="panel-inner" style={{flex:1,display:'flex',flexDirection:'column'}}>
            <div className="panel-header">
              <div className="panel-icon"></div>
              <div className="panel-title">近五场赛事记录</div>
              <div className="panel-badge">点击查看详情</div>
            </div>
            <div style={{flex:1}}>
              <table className="data-table">
                <thead><tr><th>日期</th><th>对手</th><th>地图</th><th style={{textAlign:'right'}}>比分</th><th style={{textAlign:'center'}}>结果</th></tr></thead>
                <tbody>
                  {(recentMatches || []).slice(0, 5).map((m, i) => (
                    <tr key={m.id || i} onClick={() => { const d = (matchDetails || []).find(x => x.id === m.id); if (d) setModal({ type: 'match', data: d }); }} style={{cursor:'pointer'}}>
                      <td>{m.date?.slice(5)}</td>
                      <td><strong>{m.opponent}</strong></td>
                      <td>{m.map}</td>
                      <td className="score-cell" style={{textAlign:'right'}}>{m.score}</td>
                      <td style={{textAlign:'center'}}>
                        <span className={'tag ' + (m.result === 'win' ? 'tag-win' : m.result === 'loss' ? 'tag-loss' : '')}>
                          {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="glow-line"></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--td)',marginTop:'auto'}}>
              <span>近10场: W{kpi.recentWins} / L{kpi.totalRecentMatches - kpi.recentWins}</span>
              <span>胜率: <strong style={{color:'var(--suc)',fontSize:13}}>{kpi.recentWinRate}%</strong></span>
            </div>
          </div>
        </div>

        {/* ── 选手数据 ── */}
        <div className="panel" style={{overflow:'hidden'}}>
          <div className="panel-inner" style={{flex:1,display:'flex',flexDirection:'column'}}>
            <div className="panel-header">
              <div className="panel-icon"></div>
              <div className="panel-title">近五场选手数据</div>
              <div className="panel-badge">Rating / K-D / ADR / HS%</div>
            </div>
            <div style={{flex:1}}>
              <table className="data-table">
                <thead><tr><th style={{width:34}}></th><th>选手</th><th style={{textAlign:'right'}}>Rating</th><th style={{textAlign:'right'}}>K-D</th><th style={{textAlign:'right'}}>ADR</th><th style={{textAlign:'right'}}>HS%</th></tr></thead>
                <tbody>
                  {(playerStats || []).map(p => {
                    const hs = (hsStats || []).find(h => h.nickname === p.nickname);
                    const r = p.avg_rating || 0;
                    const ratingColor = r >= 1.1 ? 'var(--suc)' : r >= 0.95 ? 'var(--warn)' : 'var(--dan)';
                    return (
                      <tr key={p.nickname} style={{cursor:'pointer'}}>
                        <td style={{paddingRight:0}}>
                          <div className="player-avatar" style={{width:30,height:30,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#00d4ff,#0066cc)',color:'#fff',fontWeight:700,fontSize:13}}>
                            {p.nickname[0]}
                          </div>
                        </td>
                        <td>
                          <strong>{p.nickname}</strong>
                          <span style={{fontSize:10,color:'var(--td)',marginLeft:4}}>{p.in_game_role}</span>
                        </td>
                        <td className="score-cell" style={{textAlign:'right',color:ratingColor}}>{n(r,2)}</td>
                        <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{p.total_kills}-{p.total_deaths}</td>
                        <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{n(p.avg_adr,1)}</td>
                        <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{hs ? hs.hs_pct + '%' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="glow-line"></div>
            <div style={{display:'flex',gap:12,marginTop:'auto'}}>
              <div className="stat-card" style={{flex:1}}><div className="stat-label">团队 Rating</div><div className="stat-value" style={{color:'var(--suc)'}}>{n(teamAverages?.rating, 2)}</div></div>
              <div className="stat-card" style={{flex:1}}><div className="stat-label">团队 ADR</div><div className="stat-value" style={{color:'var(--p)'}}>{n(teamAverages?.adr, 1)}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 赛训地图统计 ═══ */}
      <div className="panel" style={{marginBottom:18}}>
        <div className="panel-inner">
          <div className="panel-header">
            <div className="panel-icon"></div>
            <div className="panel-title">赛训地图统计</div>
            <div className="panel-badge">近30天 · 点击查看详情</div>
          </div>
          <div className="map-grid">
            {(mapStats || []).map(map => {
              const wr = map.win_rate || 0;
              const barColor = wr >= 65 ? 'linear-gradient(135deg,var(--suc),#00b248)' : wr >= 50 ? 'linear-gradient(135deg,var(--warn),#ff6d00)' : 'linear-gradient(135deg,var(--dan),#d50000)';
              const textColor = wr >= 65 ? 'var(--suc)' : wr >= 50 ? 'var(--warn)' : 'var(--dan)';
              return (
                <div key={map.map_name} className="map-card" onClick={() => setModal({ type: 'map', data: map })}>
                  {mapImg(map.map_name) && <img className="map-card-img" src={mapImg(map.map_name)} alt={map.map_name} onError={e => {e.target.style.display='none'}} />}
                  <div className="map-card-name">{map.map_name}</div>
                  <div className="map-card-count">{map.played} 场 · {map.wins}W / {map.losses}L</div>
                  <div className="map-card-bar"><div className="map-card-bar-fill" style={{width:wr+'%',background:barColor}}></div></div>
                  <div className="map-card-wr" style={{color:textColor}}>{wr}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ 外设 + 库存 ═══ */}
      <div className="grid-2">
        {/* 外设 */}
        <Panel iconClass="" title="选手外设使用汇总" badge="可编辑">
          {(peripherals || []).length > 0 ? (
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10}}>
              {peripherals.map(p => (
                <div key={p.player_id} style={{display:'flex',alignItems:'center',gap:8,padding:8,background:'rgba(0,212,255,0.02)',border:'1px solid var(--bd)',borderRadius:6}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#00d4ff,#0066cc)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:12,flexShrink:0}}>
                    {p.nickname?.[0] || '?'}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--tp)'}}>{p.nickname}</div>
                    <div style={{fontSize:10,color:'var(--td)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {[p.keyboard, p.mouse, p.headset].filter(Boolean).join(' · ') || '未设置'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:24,color:'var(--td)',fontSize:12}}>外设数据未录入 · 管理员可在后台编辑</div>
          )}
        </Panel>

        {/* 库存 */}
        <Panel iconClass="" title="库存备用外设汇总" badge="可编辑">
          {(inventory || []).length > 0 ? (
            <div>
              {inventory.map(item => {
                const pct = item.max_count > 0 ? (item.current_count / item.max_count * 100) : 0;
                const barColor = pct >= 50 ? 'var(--suc)' : pct >= 20 ? 'var(--warn)' : 'var(--dan)';
                const textColor = pct >= 50 ? 'var(--suc)' : pct >= 20 ? 'var(--warn)' : 'var(--dan)';
                return (
                  <div key={item.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                    <span style={{fontSize:12,color:'var(--ts)',width:60}}>{item.item_type}</span>
                    <div style={{flex:1,height:6,borderRadius:3,background:'rgba(255,255,255,0.06)',overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:3,background:barColor,width:pct+'%',transition:'width 0.5s'}}></div>
                    </div>
                    <span style={{fontSize:12,fontFamily:'Orbitron',fontWeight:600,color:textColor,minWidth:36,textAlign:'right'}}>{item.current_count}/{item.max_count}</span>
                  </div>
                );
              })}
              {inventory.some(i => i.max_count > 0 && i.current_count / i.max_count < 0.25) && (
                <div style={{textAlign:'center',fontSize:11,color:'var(--dan)',marginTop:8}}>⚠️ 部分库存不足，需尽快采购</div>
              )}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:24,color:'var(--td)',fontSize:12}}>库存数据未录入 · 管理员可在后台编辑</div>
          )}
        </Panel>
      </div>

      {/* ═══ 教练评语 ═══ */}
      {data.coachNotes?.length > 0 && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-inner">
            <div className="panel-header">
              <div className="panel-icon"></div>
              <div className="panel-title">教练评语</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {data.coachNotes.map(n => (
                <div key={n.id} style={{padding:10,background:'rgba(0,212,255,0.02)',border:'1px solid var(--bd)',borderRadius:6,fontSize:12}}>
                  <div style={{color:'var(--td)',marginBottom:4}}>{n.date} · {n.opponent} · {n.map}</div>
                  <div style={{color:'var(--ts)',lineHeight:1.6}}>{n.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Match Detail Modal ═══ */}
      {modal?.type === 'match' && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-box" style={{position:'relative'}}>
            <button className="modal-close" onClick={() => setModal(null)} style={{position:'absolute',top:12,right:12}}>✕</button>
            <div className="modal-title">UR vs {modal.data.opponent}</div>
            <div className="modal-subtitle">{modal.data.date} · {modal.data.map} · 比分 {modal.data.score}</div>
            <div className="modal-info-row">
              <span className="tag tag-rank">地图: {modal.data.map}</span>
              <span className={'tag ' + (modal.data.result === 'win' ? 'tag-win' : 'tag-loss')}>
                {modal.data.result === 'win' ? '胜利' : '失败'}
              </span>
            </div>
            <div className="modal-section-title">选手数据</div>
            <table className="data-table" style={{marginBottom:12}}>
              <thead><tr><th style={{width:34}}></th><th>选手</th><th style={{textAlign:'right'}}>Rating</th><th style={{textAlign:'right'}}>K-D</th><th style={{textAlign:'right'}}>ADR</th><th style={{textAlign:'right'}}>HS%</th></tr></thead>
              <tbody>
                {(modal.data.players || []).map(p => {
                  const r = p.rating || 0;
                  return (
                    <tr key={p.name}>
                      <td style={{paddingRight:0}}><div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#00d4ff,#0066cc)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:12}}>{p.name[0]}</div></td>
                      <td><strong>{p.name}</strong><span style={{fontSize:10,color:'var(--td)',marginLeft:4}}>{p.role}</span></td>
                      <td style={{textAlign:'right'}}><div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}><div style={{flex:1,maxWidth:60,height:3,borderRadius:2,background:'rgba(255,255,255,0.06)',overflow:'hidden'}}><div style={{height:'100%',borderRadius:2,background:r>=1.15?'var(--suc)':r>=0.95?'var(--warn)':'var(--dan)',width:Math.min(r/1.5*100,100)+'%'}}></div></div><span style={{fontFamily:'Orbitron',fontWeight:600,color:r>=1.1?'var(--suc)':r>=0.9?'var(--warn)':'var(--dan)'}}>{n(r,2)}</span></div></td>
                      <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{p.kd}</td>
                      <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{n(p.adr,1)}</td>
                      <td style={{textAlign:'right',fontFamily:'Orbitron'}}>{pct(p.hs_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(modal.data.notes || data.coachNotes?.find(c => c.id === modal.data.id)) && (
              <div className="modal-coach-comment" style={{fontSize:12,color:'var(--ts)'}}>
                📋 {data.coachNotes?.find(c => c.id === modal.data.id)?.notes || modal.data.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Map Detail Modal ═══ */}
      {modal?.type === 'map' && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-box" style={{position:'relative',maxWidth:480}}>
            <button className="modal-close" onClick={() => setModal(null)} style={{position:'absolute',top:12,right:12}}>✕</button>
            <div className="modal-title">{modal.data.map_name}</div>
            <div className="modal-subtitle">{modal.data.played} 场 · {modal.data.wins}胜{modal.data.losses}负 · 胜率 {modal.data.win_rate}%</div>
            <div className="modal-info-row" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              <div className="stat-card"><div className="stat-label">胜场</div><div className="stat-value" style={{color:'var(--suc)'}}>{modal.data.wins}</div></div>
              <div className="stat-card"><div className="stat-label">负场</div><div className="stat-value" style={{color:'var(--dan)'}}>{modal.data.losses}</div></div>
              <div className="stat-card"><div className="stat-label">胜率</div><div className="stat-value" style={{color:modal.data.win_rate>=50?'var(--p)':'var(--dan)'}}>{modal.data.win_rate}%</div></div>
            </div>
            {modal.data.recentMatches?.length > 0 && (
              <>
                <div className="modal-section-title">近期战绩</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {modal.data.recentMatches.map((m, i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:6,background:m.result==='win'?'rgba(0,230,118,0.06)':'rgba(255,23,68,0.06)',borderLeft:`2px solid ${m.result==='win'?'var(--suc)':'var(--dan)'}`}}>
                      <span style={{fontSize:10,color:'var(--td)',width:48}}>{m.date}</span>
                      <span style={{flex:1,fontSize:12,fontWeight:600,color:'var(--tp)'}}>{m.opponent}</span>
                      <span style={{fontSize:12,fontFamily:'Orbitron',fontWeight:600,color:m.result==='win'?'var(--suc)':'var(--dan)'}}>{m.score}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
