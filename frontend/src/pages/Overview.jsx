import { useState, useEffect } from 'react';
import api from '../api';
import './overview-dashboard.css';

const n = (v, d = 0) => (v != null ? Number(v).toFixed(d) : '—');
const daysSince = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr); if (isNaN(d.getTime())) return '—';
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
const mapImg = (name) => {
  const m = { Inferno: 'inferno', Mirage: 'mirage', Nuke: 'nuke', Ancient: 'ancient', Anubis: 'anubis', Overpass: 'overpass', Dust2: 'dust2', Train: 'train', Vertigo: 'vertigo' };
  return m[name] ? `/images/maps/${m[name]}.png` : null;
};

function KpiCard({ icon, label, value, valueColor, trend }) {
  return (
    <div className="db-kpi-card">
      <div className="db-kpi-icon" style={{ color: valueColor || 'var(--dash-primary)' }}>{icon}</div>
      <div className="db-kpi-info">
        <div className="db-kpi-label">{label}</div>
        <div className="db-kpi-value" style={{ color: valueColor || 'var(--dash-primary)' }}>{value}</div>
        {trend && <div className="db-kpi-trend" style={{ color: 'var(--dash-text-dim)' }}>{trend}</div>}
      </div>
    </div>
  );
}

function PanelHeader({ iconClass, title, badge }) {
  return (
    <div className="db-panel-header">
      <div className={'db-panel-icon' + (iconClass ? ' ' + iconClass : '')} />
      <div className="db-panel-title">{title}</div>
      {badge && <div className="db-panel-badge">{badge}</div>}
    </div>
  );
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [now, setNow] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const fetchData = () => {
    setLoading(true);
    api.get('/dashboard/overview')
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleHltvSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg({ type: 'info', text: '⏳ 正在从 HLTV 同步比赛数据...（约需 2-5 分钟）' });
    try {
      const res = await api.post('/hltv-sync');
      if (res.data.ok) {
        const d = res.data;
        const parts = [];
        if (d.players_updated) parts.push(`${d.players_updated} 选手资料已更新`);
        if (d.matches_inserted) parts.push(`${d.matches_inserted} 场新比赛`);
        if (d.matches_updated) parts.push(`${d.matches_updated} 场已更新`);
        if (parts.length === 0) parts.push('数据已是最新');
        setSyncMsg({ type: 'success', text: `✅ ${parts.join('，')}` });
        fetchData(); // 刷新页面数据
      } else {
        setSyncMsg({ type: 'error', text: `❌ 同步失败: ${res.data.error || '未知错误'}` });
      }
    } catch (e) {
      setSyncMsg({ type: 'error', text: `❌ ${e.response?.data?.error || e.message}` });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="dashboard-root" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}><div className="db-kpi-value" style={{ color: 'var(--dash-primary)' }}>Loading...</div></div>;
  if (error) return <div className="dashboard-root"><div className="db-panel"><div className="db-panel-inner"><p style={{ color: 'var(--dash-danger)' }}>数据加载失败: {error}</p></div></div></div>;
  if (!data) return null;

  const { kpi, upcomingMatch, recentMatches, playerStats, hsStats, teamAverages,
          mapStats, matchDetails, peripherals, inventory, opponentIntel, h2hFromDb,
          trainingPlan, coachNotes } = data;

  // Countdown
  const countdown = upcomingMatch ? (() => {
    const target = new Date(upcomingMatch.match_date + 'T' + (upcomingMatch.match_time || '00:00:00'));
    const diff = target - now;
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  })() : null;

  const ratings = playerStats || [];
  const teamRating = teamAverages?.rating || 0;
  const teamADR = teamAverages?.adr || 0;

  return (
    <div className="dashboard-root">

      {/* ═══════ KPI Row ═══════ */}
      <div className="db-kpi-row">
        <KpiCard icon="#" label="VRS Asia 排名"
          value={kpi.vrsRank ? `#${kpi.vrsRank}` : '—'}
          valueColor="var(--dash-primary)"
          trend={<span style={{color:'var(--dash-success)'}}>{kpi.vrsRank ? '实时排名' : '未配置'}</span>} />
        <KpiCard icon="W" label="近十场胜率"
          value={`${kpi.recentWinRate}%`}
          valueColor={kpi.recentWinRate >= 50 ? 'var(--dash-success)' : 'var(--dash-danger)'}
          trend={<span style={{color:'var(--dash-success)'}}>{kpi.recentWins}胜 / {kpi.totalRecentMatches - kpi.recentWins}负</span>} />
        <KpiCard icon="Q" label="训练质量"
          value={`${kpi.trainingQuality}%`}
          valueColor={kpi.trainingQuality >= 70 ? 'var(--dash-warning)' : 'var(--dash-danger)'}
          trend={<span style={{cursor:'help',borderBottom:'1px dashed var(--dash-text-dim)'}}>计算逻辑</span>} />
        <KpiCard icon="D" label="分部已成立"
          value={kpi.foundedDate ? `${daysSince(kpi.foundedDate)}天` : '—'}
          valueColor="var(--dash-primary)"
          trend={<span style={{color:'var(--dash-text-dim)'}}>{kpi.foundedDate || ''} 成立</span>} />
        {/* HLTV Sync */}
        <button
          onClick={handleHltvSync}
          disabled={syncing}
          className="db-sync-btn"
          title="从 HLTV.org 同步 UR 战队正式比赛数据"
          style={{
            background: syncing ? 'var(--dash-bg-hover)' : 'linear-gradient(135deg, #2d3844, #3e4c54)',
            color: '#fff',
            border: '1px solid #4a5568',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: syncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            opacity: syncing ? 0.7 : 1,
            transition: 'all 0.3s',
          }}
          onMouseEnter={e => !syncing && (e.currentTarget.style.background = 'linear-gradient(135deg, #3e4c54, #4a5568)')}
          onMouseLeave={e => !syncing && (e.currentTarget.style.background = 'linear-gradient(135deg, #2d3844, #3e4c54)')}
        >
          <span style={{fontSize:16}}>{syncing ? '⏳' : '🔄'}</span>
          {syncing ? '同步中...' : '同步 HLTV'}
        </button>
      </div>

      {/* Sync status message */}
      {syncMsg && (
        <div style={{
          padding: '8px 16px',
          margin: '0 0 16px 0',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          background: syncMsg.type === 'success' ? 'rgba(72,199,142,0.1)' : syncMsg.type === 'error' ? 'rgba(241,70,104,0.1)' : 'rgba(72,146,235,0.1)',
          color: syncMsg.type === 'success' ? '#48c78e' : syncMsg.type === 'error' ? '#f14668' : '#4892eb',
          border: `1px solid ${syncMsg.type === 'success' ? 'rgba(72,199,142,0.3)' : syncMsg.type === 'error' ? 'rgba(241,70,104,0.3)' : 'rgba(72,146,235,0.3)'}`,
        }}>
          {syncMsg.text}
        </div>
      )}

      {/* ═══════ Top Row: 即将赛事 | 数据枢纽 | 训练对象 ═══════ */}
      <div className="db-top-row">
        {/* ── 即将开始赛事 ── */}
        <div className="db-panel">
          <div className="db-panel-inner">
            <PanelHeader iconClass="danger" title="即将开始赛事" badge={upcomingMatch ? (countdown?.d || 0) + '天后' : '暂无'} />
            {upcomingMatch ? (
              <div style={{ textAlign: 'center' }}>
                <div className="db-match-event">{upcomingMatch.event_name || '赛事'}</div>
                <div className="db-match-stage">{upcomingMatch.stage || ''}</div>
                <div className="db-match-vs">
                  <div style={{ textAlign: 'center' }}>
                    <div className="db-match-team-name" style={{ color: 'var(--dash-primary)' }}>UR</div>
                    <div className="db-match-team-rank">#{kpi.vrsRank || '—'}</div>
                  </div>
                  <div className="db-match-vs-text">VS</div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="db-match-team-name" style={{ color: 'var(--dash-text-primary)' }}>{upcomingMatch.opponent}</div>
                    <div className="db-match-team-rank">{upcomingMatch.match_type === 'official' ? '正式赛' : '训练赛'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--dash-text-secondary)', marginBottom: 8 }}>
                  {upcomingMatch.match_date} {upcomingMatch.match_time || ''} (北京时间)
                </div>
                {countdown && (
                  <div className="db-countdown-box">
                    {[
                      { v: countdown.d, l: '天' },
                      { v: countdown.h, l: '时' },
                      { v: countdown.m, l: '分' },
                      { v: countdown.s, l: '秒' },
                    ].map((c, i) => (
                      <div className="db-countdown-item" key={i}>
                        <div className="db-countdown-val">{String(c.v).padStart(2, '0')}</div>
                        <div className="db-countdown-label">{c.l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {(h2hFromDb && h2hFromDb.wins + h2hFromDb.losses > 0) && (
                  <div className="db-h2h-record" style={{ marginTop: 12 }}>
                    <span>历史交手: </span>
                    {[...Array(h2hFromDb.wins || 0)].map((_, i) => <span key={'w' + i} className="db-h2h-dot win" />)}
                    {[...Array(h2hFromDb.losses || 0)].map((_, i) => <span key={'l' + i} className="db-h2h-dot loss" />)}
                    <span style={{ fontFamily: 'Orbitron', color: 'var(--dash-text-secondary)' }}>
                      {h2hFromDb.wins || 0}W : {h2hFromDb.losses || 0}L
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dash-text-dim)' }}>
                <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>📅</div>
                <div style={{ fontSize: 14 }}>近期暂无正赛规划</div>
              </div>
            )}
          </div>
        </div>

        {/* ── 数据枢纽 (中间) ── */}
        <div className="db-panel">
          <div className="db-panel-inner">
            <PanelHeader title="数据枢纽" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 250 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 120, height: 120, margin: '0 auto 16px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,255,0.15), transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--dash-border)' }}>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 900, color: 'var(--dash-primary)' }}>LINK</span>
                </div>
                <div style={{ color: 'var(--dash-text-primary)', marginBottom: 4 }}>数据联动核心</div>
                <div style={{ fontSize: 11, color: 'var(--dash-text-dim)', letterSpacing: 2 }}>DATA HUB · CONNECTED</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 今日训练赛对象 ── */}
        <div className="db-panel">
          <div className="db-panel-inner">
            <PanelHeader iconClass="warn" title="今日训练赛对象" badge={upcomingMatch ? (upcomingMatch.bo_format || '待定') : '暂无'} />
            {upcomingMatch ? (
              <div className="db-scrim-center">
                <div className="db-scrim-vs-label">VS</div>
                <div className="db-scrim-name">{upcomingMatch.opponent}</div>
                {opponentIntel?.vrs_rank && (
                  <span className="db-tag db-tag-rank" style={{ fontSize: 13, padding: '4px 12px' }}>
                    #{opponentIntel.vrs_rank} HLTV
                  </span>
                )}
                <div className="db-scrim-maps">{upcomingMatch.bo_format || '地图待定'}</div>
                <div className="db-glow-line" />
                <div className="db-scrim-info-grid">
                  <div className="db-scrim-info-item">
                    <div className="db-scrim-info-label">近期交手</div>
                    <div className="db-scrim-info-val">
                      {h2hFromDb ? `${h2hFromDb.wins || 0}W / ${h2hFromDb.losses || 0}L` : '—'}
                    </div>
                  </div>
                  <div className="db-scrim-info-item">
                    <div className="db-scrim-info-label">比赛时间</div>
                    <div className="db-scrim-info-val">{upcomingMatch.match_time || '待定'}</div>
                  </div>
                  <div className="db-scrim-info-item">
                    <div className="db-scrim-info-label">地图倾向</div>
                    <div className="db-scrim-info-val" style={{ fontSize: 12 }}>
                      {opponentIntel?.map_preference || '—'}
                    </div>
                  </div>
                  <div className="db-scrim-info-item">
                    <div className="db-scrim-info-label">核心选手</div>
                    <div className="db-scrim-info-val" style={{ fontSize: 12 }}>
                      {opponentIntel?.core_players || '—'}
                    </div>
                  </div>
                </div>
                {(h2hFromDb && h2hFromDb.wins + h2hFromDb.losses > 0) && (
                  <div className="db-h2h-record" style={{ marginTop: 10 }}>
                    <span>历史战绩:</span>
                    {[...Array(h2hFromDb.wins || 0)].map((_, i) => <span key={'w' + i} className="db-h2h-dot win" />)}
                    {[...Array(h2hFromDb.losses || 0)].map((_, i) => <span key={'l' + i} className="db-h2h-dot loss" />)}
                    <span style={{ fontFamily: 'Orbitron', color: 'var(--dash-text-secondary)' }}>
                      {h2hFromDb.wins || 0}W {h2hFromDb.losses || 0}L
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--dash-text-dim)' }}>
                <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 14 }}>今日暂无训练赛排程</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ 今日训练计划 ═══════ */}
      {(trainingPlan || []).length > 0 && (
        <div className="db-panel" style={{ marginBottom: 18 }}>
          <div className="db-panel-inner">
            <PanelHeader title="今日训练计划" badge={new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {trainingPlan.map((tp, i) => (
                <div key={tp.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '10px 0' }}>
                  <div style={{ minWidth: 80, textAlign: 'center', fontSize: 12, fontFamily: 'Orbitron', color: 'var(--dash-primary)', background: 'rgba(0,212,255,0.04)', border: '1px solid var(--dash-border)', borderRadius: 6, padding: '6px 8px' }}>
                    <div>{tp.start_time || '—'}</div>
                    <div style={{ fontSize: 9, color: 'var(--dash-text-dim)' }}>至</div>
                    <div style={{ color: 'var(--dash-text-secondary)' }}>{tp.end_time || '—'}</div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(0,212,255,0.03)', border: '1px solid var(--dash-border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dash-text-primary)' }}>{tp.title}</div>
                    {tp.subtitle && <div style={{ fontSize: 11, color: 'var(--dash-text-dim)', marginTop: 3 }}>{tp.subtitle}</div>}
                    {tp.tags && <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                      {tp.tags.split(/[,，]/).map((t, j) => (
                        <span key={j} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, background: 'rgba(0,212,255,0.08)', color: 'var(--dash-primary)', border: '1px solid var(--dash-border)' }}>{t.trim()}</span>
                      ))}
                    </div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 近五场赛事 + 选手数据 ═══════ */}
      <div className="db-grid-2">
        {/* ── 近五场赛事 ── */}
        <div className="db-panel" style={{ overflow: 'hidden' }}>
          <div className="db-panel-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <PanelHeader title="近五场赛事记录" badge="点击查看详情" />
            <div style={{ flex: 1 }}>
              <table className="db-data-table">
                <thead><tr><th>日期</th><th>对手</th><th>地图</th><th style={{ textAlign: 'right' }}>比分</th><th style={{ textAlign: 'center' }}>结果</th></tr></thead>
                <tbody>
                  {(recentMatches || []).slice(0, 5).map(m => (
                    <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => {
                      const d = (matchDetails || []).find(x => x.id === m.id);
                      if (d) setModal({ type: 'match', data: d });
                    }}>
                      <td>{m.date?.slice(5)}</td>
                      <td><strong>{m.opponent}</strong></td>
                      <td>{m.map}</td>
                      <td className="db-score-cell" style={{ textAlign: 'right' }}>{m.score}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={'db-tag ' + (m.result === 'win' ? 'db-tag-win' : m.result === 'loss' ? 'db-tag-loss' : '')}>
                          {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="db-glow-line" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dash-text-dim)', marginTop: 'auto' }}>
              <span>近10场: W{kpi.recentWins} / L{kpi.totalRecentMatches - kpi.recentWins}</span>
              <span>胜率: <strong style={{ color: 'var(--dash-success)' }}>{kpi.recentWinRate}%</strong></span>
            </div>
          </div>
        </div>

        {/* ── 选手数据 ── */}
        <div className="db-panel" style={{ overflow: 'hidden' }}>
          <div className="db-panel-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <PanelHeader title="近五场选手数据" badge="点击查看个人详情" />
            <div style={{ flex: 1 }}>
              <table className="db-data-table">
                <thead><tr><th style={{ width: 38 }}></th><th>选手</th><th style={{ textAlign: 'right' }}>Rating</th><th style={{ textAlign: 'right' }}>K-D</th><th style={{ textAlign: 'right' }}>ADR</th><th style={{ textAlign: 'right' }}>HS%</th></tr></thead>
                <tbody>
                  {ratings.map(p => {
                    const hs = (hsStats || []).find(h => h.nickname === p.nickname);
                    const r = p.avg_rating || 0;
                    const rc = r >= 1.1 ? 'var(--dash-success)' : r >= 0.95 ? 'var(--dash-warning)' : 'var(--dash-danger)';
                    return (
                      <tr key={p.nickname} style={{ cursor: 'pointer' }}>
                        <td style={{ paddingRight: 0 }}>
                          <div className="db-player-avatar">{p.nickname[0]}</div>
                        </td>
                        <td>
                          <strong>{p.nickname}</strong>
                          <span style={{ fontSize: 10, color: 'var(--dash-text-dim)', marginLeft: 4 }}>{p.in_game_role}</span>
                        </td>
                        <td className="db-score-cell" style={{ textAlign: 'right', color: rc }}>{n(r, 2)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{p.total_kills}-{p.total_deaths}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{n(p.avg_adr, 1)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{hs ? hs.hs_pct + '%' : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="db-glow-line" />
            <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
              <div className="db-stat-card" style={{ flex: 1 }}>
                <div className="db-stat-label">团队 Rating</div>
                <div className="db-stat-value" style={{ color: 'var(--dash-success)' }}>{n(teamRating, 2)}</div>
              </div>
              <div className="db-stat-card" style={{ flex: 1 }}>
                <div className="db-stat-label">团队 ADR</div>
                <div className="db-stat-value" style={{ color: 'var(--dash-primary)' }}>{n(teamADR, 1)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ 赛训地图统计 ═══════ */}
      <div className="db-panel" style={{ marginBottom: 18 }}>
        <div className="db-panel-inner">
          <PanelHeader title="赛训地图统计" badge="近30天 · 点击查看详情" />
          <div className="db-grid-7">
            {(mapStats || []).slice(0, 7).map(map => {
              const wr = map.win_rate || 0;
              const barBg = wr >= 65 ? 'var(--dash-gradient-green)' : wr >= 50 ? 'var(--dash-gradient-orange)' : 'var(--dash-gradient-red)';
              const txtC = wr >= 65 ? 'var(--dash-success)' : wr >= 50 ? 'var(--dash-warning)' : 'var(--dash-danger)';
              return (
                <div key={map.map_name} className="db-map-card" onClick={() => setModal({ type: 'map', data: map })}>
                  {mapImg(map.map_name) && <img className="db-map-card-img" src={mapImg(map.map_name)} alt={map.map_name} onError={e => { e.target.style.display = 'none'; }} />}
                  <div className="db-map-card-name">{map.map_name}</div>
                  <div className="db-map-card-count">{map.played} 场 · {map.wins}W / {map.losses}L</div>
                  <div className="db-map-card-bar"><div className="db-map-card-bar-fill" style={{ width: wr + '%', background: barBg }} /></div>
                  <div className="db-map-card-wr" style={{ color: txtC }}>{wr}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════ 外设 + 库存 ═══════ */}
      <div className="db-grid-2">
        {/* 选手外设 */}
        <div className="db-panel">
          <div className="db-panel-inner">
            <PanelHeader title="选手外设使用汇总" badge="可编辑" />
            {(peripherals || []).length > 0 ? (
              <div className="db-peri-grid">
                {peripherals.map(p => (
                  <div key={p.player_id} className="db-peri-card">
                    <div className="db-player-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{p.nickname?.[0] || '?'}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="db-peri-name">{p.nickname}<span style={{ fontSize: 10, color: 'var(--dash-text-dim)' }}> {p.in_game_role}</span></div>
                      <div className="db-peri-gear">{[p.keyboard, p.mouse, p.headset].filter(Boolean).join(' · ') || '未设置'}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--dash-text-dim)', fontSize: 12 }}>外设数据未录入</div>
            )}
          </div>
        </div>

        {/* 库存 */}
        <div className="db-panel">
          <div className="db-panel-inner">
            <PanelHeader title="库存备用外设汇总" badge="可编辑" />
            {(inventory || []).length > 0 ? (
              <div>
                {inventory.map(item => {
                  const pct = item.max_count > 0 ? (item.current_count / item.max_count * 100) : 0;
                  const bc = pct >= 50 ? 'var(--dash-success)' : pct >= 20 ? 'var(--dash-warning)' : 'var(--dash-danger)';
                  const tc = pct >= 50 ? 'var(--dash-success)' : pct >= 20 ? 'var(--dash-warning)' : 'var(--dash-danger)';
                  return (
                    <div key={item.id} className="db-inv-row">
                      <span className="db-inv-name">{item.item_type}</span>
                      <div className="db-inv-bar-wrap"><div className="db-inv-bar-fill" style={{ width: pct + '%', background: bc }} /></div>
                      <span className="db-inv-count" style={{ color: tc }}>{item.current_count}/{item.max_count}</span>
                    </div>
                  );
                })}
                {inventory.some(i => i.max_count > 0 && i.current_count / i.max_count < 0.25) && (
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--dash-danger)', marginTop: 8 }}>⚠️ 部分库存不足</div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--dash-text-dim)', fontSize: 12 }}>库存数据未录入</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ 教练评语 ═══════ */}
      {coachNotes?.length > 0 && (
        <div className="db-panel" style={{ marginTop: 16 }}>
          <div className="db-panel-inner">
            <PanelHeader title="教练评语" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {coachNotes.map(n => (
                <div key={n.id} style={{ padding: 10, background: 'rgba(0,212,255,0.02)', border: '1px solid var(--dash-border)', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: 'var(--dash-text-dim)', marginBottom: 4 }}>{n.date} · {n.opponent} · {n.map}</div>
                  <div style={{ color: 'var(--dash-text-secondary)', lineHeight: 1.6 }}>{n.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Match Detail Modal ═══════ */}
      {modal?.type === 'match' && (
        <div className="db-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="db-modal-box">
            <button className="db-modal-close" onClick={() => setModal(null)}>✕</button>
            <div className="db-modal-title">UR vs {modal.data.opponent}</div>
            <div className="db-modal-subtitle">{modal.data.date} · {modal.data.map} · 比分 {modal.data.score}</div>
            <div className="db-modal-info-row">
              <span className="db-tag db-tag-rank">地图: {modal.data.map}</span>
              <span className={'db-tag ' + (modal.data.result === 'win' ? 'db-tag-win' : 'db-tag-loss')}>
                {modal.data.result === 'win' ? '胜利' : '失败'}
              </span>
            </div>
            <div className="db-modal-section-title">选手数据</div>
            <table className="db-data-table" style={{ marginBottom: 12 }}>
              <thead><tr>
                <th style={{ width: 38 }}></th><th>选手</th>
                <th style={{ textAlign: 'right' }}>Rating</th>
                <th style={{ textAlign: 'right' }}>K-D</th>
                <th style={{ textAlign: 'right' }}>ADR</th>
                <th style={{ textAlign: 'right' }}>HS%</th>
              </tr></thead>
              <tbody>
                {(modal.data.players || []).map(p => {
                  const r = p.rating || 0;
                  return (
                    <tr key={p.name}>
                      <td style={{ paddingRight: 0 }}><div className="db-player-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{p.name[0]}</div></td>
                      <td><strong>{p.name}</strong><span style={{ fontSize: 10, color: 'var(--dash-text-dim)', marginLeft: 4 }}>{p.role}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <div style={{ flex: 1, maxWidth: 50, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, background: r >= 1.15 ? 'var(--dash-success)' : r >= 0.95 ? 'var(--dash-warning)' : 'var(--dash-danger)', width: Math.min(r / 1.5 * 100, 100) + '%' }} />
                          </div>
                          <span style={{ fontFamily: 'Orbitron', fontWeight: 600, color: r >= 1.1 ? 'var(--dash-success)' : r >= 0.9 ? 'var(--dash-warning)' : 'var(--dash-danger)' }}>{n(r, 2)}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{p.kd}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{n(p.adr, 1)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Orbitron' }}>{p.hs ? (p.hs > 0 ? ((p.hs / (p.kd ? parseInt(p.kd.split('-')[0]) : 1)) * 100).toFixed(0) + '%' : '—') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(modal.data.notes || coachNotes?.find(c => c.id === modal.data.id)) && (
              <div className="db-modal-coach-comment">
                📋 {coachNotes?.find(c => c.id === modal.data.id)?.notes || modal.data.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Map Detail Modal ═══════ */}
      {modal?.type === 'map' && (
        <div className="db-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="db-modal-box" style={{ maxWidth: 480 }}>
            <button className="db-modal-close" onClick={() => setModal(null)}>✕</button>
            <div className="db-modal-title">{modal.data.map_name}</div>
            <div className="db-modal-subtitle">{modal.data.played} 场 · {modal.data.wins}胜{modal.data.losses}负 · 胜率 {modal.data.win_rate}%</div>
            <div className="db-modal-info-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div className="db-stat-card"><div className="db-stat-label">胜场</div><div className="db-stat-value" style={{ color: 'var(--dash-success)' }}>{modal.data.wins}</div></div>
              <div className="db-stat-card"><div className="db-stat-label">负场</div><div className="db-stat-value" style={{ color: 'var(--dash-danger)' }}>{modal.data.losses}</div></div>
              <div className="db-stat-card"><div className="db-stat-label">胜率</div><div className="db-stat-value" style={{ color: modal.data.win_rate >= 50 ? 'var(--dash-primary)' : 'var(--dash-danger)' }}>{modal.data.win_rate}%</div></div>
            </div>
            {modal.data.recentMatches?.length > 0 && (
              <>
                <div className="db-modal-section-title">近期战绩</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {modal.data.recentMatches.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6,
                      background: m.result === 'win' ? 'rgba(0,230,118,0.06)' : 'rgba(255,23,68,0.06)',
                      borderLeft: `2px solid ${m.result === 'win' ? 'var(--dash-success)' : 'var(--dash-danger)'}`
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--dash-text-dim)', width: 48 }}>{m.date}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--dash-text-primary)' }}>{m.opponent}</span>
                      <span style={{ fontSize: 12, fontFamily: 'Orbitron', fontWeight: 600, color: m.result === 'win' ? 'var(--dash-success)' : 'var(--dash-danger)' }}>{m.score}</span>
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
