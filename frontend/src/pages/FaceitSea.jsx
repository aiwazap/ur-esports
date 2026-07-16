import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  ListChecks,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import api from '../api';
import './faceit-sea.css';

const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toDateStr(new Date());

function emptyConfig() {
  return {
    team_name: 'UR FACEIT SEA',
    target_elo: 3200,
    deadline: '2026-07-31',
    avg_elo_per_win: 25,
    sample_size: 10,
    daily_start_time: '19:00',
    settlement_time: '00:30',
    reminders_enabled: '1',
  };
}

function userRole() {
  try { return JSON.parse(localStorage.getItem('user') || '{}').role || ''; } catch { return ''; }
}

function fmtTime(s) {
  return String(s || '').replace('T', ' ').slice(11, 16) || '—';
}

function resultText(result) {
  return result === 'win' ? '胜' : result === 'loss' ? '负' : '平';
}

function scoreText(m) {
  const team = m?.team_score ?? '—';
  const opponent = m?.opponent_score ?? '—';
  return `${team}:${opponent}`;
}

function matchTypeKey(m) {
  const fromApi = String(m?.match_type_key || '').trim();
  if (fromApi) return fromApi;
  const raw = String(m?.queue_type || '').toLowerCase();
  return /(esea|league|open|season|tournament|championship|cup|联赛|赛事)/i.test(raw) ? 'league' : 'ranked';
}

function matchTypeLabel(m) {
  return m?.match_type_label || (matchTypeKey(m) === 'league' ? '联赛' : '排位');
}

function fmtNum(v) {
  return Number.isFinite(Number(v)) ? Number(v).toLocaleString('zh-CN') : '—';
}

const statusClass = {
  completed: 'faceit-ok',
  behind: 'faceit-warn',
  not_started: 'faceit-idle',
  in_progress: 'faceit-live',
  data_error: 'faceit-bad',
};

function isKpiExcludedPlayer(p) {
  const nickname = String(p?.faceit_nickname || '').toLowerCase();
  const name = String(p?.player_name || '').toLowerCase();
  const role = String(p?.role || '').toLowerCase();
  return nickname === '-maider666'
    || nickname === 'hzzzzz'
    || name.includes('azura')
    || name === 'hz'
    || name === 'hz / coach'
    || role === 'coach'
    || role === '教练';
}

export default function FaceitSea() {
  const initialTab = new URLSearchParams(window.location.search).get('tab') === 'config' ? 'config' : 'records';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [date, setDate] = useState(today());
  const [playerFilter, setPlayerFilter] = useState('all');
  const [summary, setSummary] = useState(null);
  const [configDraft, setConfigDraft] = useState(emptyConfig());
  const [playersDraft, setPlayersDraft] = useState([]);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const canAdmin = ['admin', 'team_lead'].includes(userRole());

  const loadSummary = useCallback(() => {
    setLoading(true);
    return api.get('/faceit-sea/summary', { params: { date } })
      .then((r) => setSummary(r.data))
      .catch((e) => setMessage(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [date]);

  const loadConfig = useCallback(() => {
    return api.get('/faceit-sea/config')
      .then((r) => {
        setConfigDraft({ ...emptyConfig(), ...(r.data?.config || {}) });
        setPlayersDraft(Array.isArray(r.data?.players) ? r.data.players : []);
      })
      .catch((e) => setMessage(e.response?.data?.error || e.message));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const filteredMatches = useMemo(() => {
    const matches = summary?.matches || [];
    if (playerFilter === 'all') return matches;
    return matches.filter((m) => (m.players || []).some((p) => p.faceit_nickname === playerFilter));
  }, [summary, playerFilter]);

  const progress = summary?.progress || {};
  const config = summary?.config || emptyConfig();
  const players = summary?.players || [];
  const targetElo = Number(config.target_elo || 3200);
  const averageElo = Number(progress.current_average_elo ?? progress.current_best_elo ?? 0);
  const remainingAverage = Number(progress.remaining_average_elo ?? progress.remaining_elo ?? 0);
  const rosterSize = Number(progress.roster_size || players.length || 0);
  const eloProgress = targetElo > 0 ? Math.max(0, Math.min(100, Math.round((averageElo / targetElo) * 100))) : 0;
  const todayRecords = [...(summary?.matches || [])].sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const configPlayers = playersDraft
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => !isKpiExcludedPlayer(p));

  const saveConfig = () => {
    setSaving(true);
    setMessage('');
    api.put('/faceit-sea/config', {
      config: configDraft,
      players: playersDraft,
      faceit_api_key: apiKeyDraft,
    })
      .then((r) => {
        setSummary(r.data?.summary || summary);
        setApiKeyDraft('');
        setMessage('FACEIT SEA 配置已保存');
        return loadConfig();
      })
      .catch((e) => setMessage(e.response?.data?.error || e.message))
      .finally(() => setSaving(false));
  };

  const syncPlayers = () => {
    setSaving(true);
    setMessage('');
    api.post('/faceit-sea/sync-players')
      .then((r) => {
        setSummary(r.data?.summary || summary);
        setMessage(r.data?.success ? 'FACEIT 队员分数同步完成' : '同步完成，但部分账号失败');
        return loadConfig();
      })
      .catch((e) => setMessage(e.response?.data?.error || e.message))
      .finally(() => setSaving(false));
  };

  const syncMatches = () => {
    setSaving(true);
    setMessage('');
    api.post('/faceit-sea/sync-matches', { date, limit: 30 })
      .then((r) => {
        setSummary(r.data?.summary || summary);
        const synced = r.data?.synced ?? 0;
        const skipped = r.data?.skipped ?? 0;
        setMessage(r.data?.success
          ? `FACEIT 战绩同步完成：写入/更新 ${synced} 场，跳过 ${skipped} 场`
          : `FACEIT 战绩同步完成，但部分比赛失败：写入/更新 ${synced} 场`);
        return loadConfig();
      })
      .catch((e) => setMessage(e.response?.data?.error || e.message))
      .finally(() => setSaving(false));
  };

  const setPlayerDraft = (idx, patch) => {
    setPlayersDraft((list) => list.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  return (
    <div className="faceit-page">
      <div className="faceit-page-head">
        <div>
          <div className="faceit-eyebrow">FACEIT SEA TASK BOARD</div>
          <div className="faceit-page-title">FACEIT SEA 任务记录</div>
          <div className="faceit-page-sub">7 月 31 日前把已确认 FACEIT SEA 队员平均 ELO 拉到 3200。</div>
        </div>
        <div className="faceit-tabs">
          <button className={activeTab === 'records' ? 'is-active' : ''} onClick={() => setActiveTab('records')}>记录看板</button>
          <button className={activeTab === 'config' ? 'is-active' : ''} onClick={() => setActiveTab('config')}>后台配置</button>
        </div>
      </div>

      {message && <div className="faceit-message" style={{ marginBottom: 14 }}>{message}</div>}

      {activeTab === 'records' && (
        <>
          <div className="faceit-toolbar" style={{ marginBottom: 14 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
              <option value="all">全部队员</option>
              {(summary?.players || []).map((p) => <option key={p.faceit_nickname} value={p.faceit_nickname}>{p.player_name} · {p.faceit_nickname}</option>)}
            </select>
            <button type="button" onClick={loadSummary}><RefreshCw size={14} /> 刷新</button>
            <button className="faceit-sync-btn" type="button" disabled={saving || !canAdmin} onClick={syncMatches}><RefreshCw size={14} /> 同步 FACEIT 战绩</button>
          </div>

          <section className="faceit-hero-board">
            <div className="faceit-hero-main">
              <div className="faceit-hero-kicker"><Target size={15} /> 7 月冲分任务</div>
              <div className="faceit-hero-title-row">
                <div>
                  <h2>队员平均距 {fmtNum(targetElo)} 还差 {fmtNum(remainingAverage)} 分</h2>
                  <p>{summary?.date || date} · 当前平均 {fmtNum(averageElo)} / {fmtNum(targetElo)} · 截止 {config.deadline}</p>
                </div>
                <span className={`faceit-hero-status ${statusClass[progress.status] || ''}`}>{progress.status_text || '—'}</span>
              </div>
              <div className="faceit-progress-track">
                <span style={{ width: `${eloProgress}%` }} />
              </div>
              <div className="faceit-hero-meta">
                <span><Trophy size={14} /> {rosterSize} 人平均</span>
                <span><CalendarDays size={14} /> 剩 {fmtNum(progress.remaining_days)} 天</span>
                <span><Gauge size={14} /> 按 {fmtNum(config.avg_elo_per_win)} 分/胜</span>
              </div>
            </div>
            <div className="faceit-hero-side">
              <div className="faceit-today-ring">
                <span>今日还差</span>
                <strong>{fmtNum(progress.today_remaining_wins)}</strong>
                <em>净胜目标 {fmtNum(progress.required_daily_net_wins)}</em>
              </div>
              <div className="faceit-side-mini">
                <span>今日净胜</span><b>{fmtNum(progress.today_net_wins)}</b>
                <span>今日组排</span><b>{fmtNum(progress.today_full_stack_matches)}</b>
              </div>
            </div>
          </section>

          <div className="faceit-command-layout">
            <main className="faceit-command-main">
              <section className="faceit-section-card">
                <div className="faceit-section-head">
                  <div>
                    <span><Users size={16} /> 队员状态</span>
                    <p>只统计已确认参赛队员；教练不进 FACEIT SEA KPI。</p>
                  </div>
                  <span className="faceit-chip">{players.length} 人已计入</span>
                </div>
                <div className="faceit-squad-grid">
                  {players.map((p) => (
                    <article key={p.faceit_nickname} className="faceit-squad-card">
                      <div className="faceit-squad-top">
                        <div>
                          <strong>{p.player_name}</strong>
                          <span>{p.faceit_nickname}</span>
                        </div>
                        <i className={statusClass[p.status] || ''}>{p.status_text}</i>
                      </div>
                      <div className="faceit-squad-elo">{fmtNum(p.current_elo)} <span>ELO</span></div>
                      <div className="faceit-squad-line">
                        <span>今日 {fmtNum(p.matches_played)} 场</span>
                        <span>本月 {fmtNum(p.month_matches)} 场</span>
                        <span>{p.wins}-{p.losses}</span>
                        <span>{p.elo_delta > 0 ? '+' : ''}{fmtNum(p.elo_delta)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="faceit-section-card">
                <div className="faceit-section-head">
                  <div>
                    <span><ListChecks size={16} /> Match room 复核</span>
                    <p>按 FACEIT 房间核对今日组排记录。</p>
                  </div>
                  <span className="faceit-chip">今日组排 {fmtNum(progress.today_full_stack_matches)}</span>
                </div>
                {loading ? <div className="faceit-skeleton">加载记录中</div> : filteredMatches.length === 0 ? (
                  <div className="faceit-empty-state">
                    <Clock3 size={18} />
                    <strong>当前筛选下暂无 match room</strong>
                    <span>晚间五排结束后，这里会沉淀房间、地图和队员表现。</span>
                  </div>
                ) : (
                  <div className="faceit-audit-list">
                    {filteredMatches.map((m) => (
                      <article key={m.faceit_match_id} className="faceit-audit-card">
                        <div className="faceit-audit-time">
                          <strong>{fmtTime(m.started_at)}</strong>
                          <span>{m.match_date}</span>
                        </div>
                        <div className="faceit-audit-main">
                          <div>
                            <strong>{m.map || '—'}</strong>
                            <span>{matchTypeLabel(m)} · {Number(m.is_full_stack) === 1 ? '组排记录' : '非组排记录'} · {m.region || 'SEA'}</span>
                          </div>
                          <b>{scoreText(m)}</b>
                        </div>
                        <span className={`faceit-chip is-${matchTypeKey(m)}`}>{matchTypeLabel(m)}</span>
                        <span className={`faceit-chip ${m.result === 'win' ? 'is-win' : ''}`}>{resultText(m.result)}</span>
                        <a className="faceit-room-open" href={m.match_room_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
                        <div className="faceit-audit-roster">
                          {(m.players || []).map((p) => (
                            <span key={p.id || p.faceit_nickname}>
                              {p.faceit_nickname} · {p.kills}/{p.deaths}/{p.assists} · {Number(p.rating || 0).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </main>

            <aside className="faceit-command-side">
              <section className="faceit-section-card">
                <div className="faceit-section-head is-simple">
                  <span><Activity size={16} /> 任务压力</span>
                </div>
                <div className="faceit-pressure-list">
                  <div><span>平均还需净胜</span><strong>{fmtNum(progress.required_net_wins)}</strong></div>
                  <div><span>每日净胜</span><strong>{fmtNum(progress.required_daily_net_wins)}</strong></div>
                  <div><span>当前进度</span><strong>{eloProgress}%</strong></div>
                </div>
              </section>

              <section className="faceit-section-card">
                <div className="faceit-section-head is-simple">
                  <span><CheckCircle2 size={16} /> 今日场次记录</span>
                </div>
                <div className="faceit-latest-list">
                  {todayRecords.length === 0 ? <div className="faceit-empty-line">今日暂无 FACEIT 战绩</div> : todayRecords.map((m) => (
                    <a key={m.faceit_match_id} href={m.match_room_url} target="_blank" rel="noreferrer">
                      <span>{m.match_date} {fmtTime(m.started_at)}</span>
                      <strong>{scoreText(m)}</strong>
                      <em>{m.map || '—'}</em>
                      <small className={`faceit-match-kind is-${matchTypeKey(m)}`}>{matchTypeLabel(m)}</small>
                    </a>
                  ))}
                </div>
              </section>

              <section className="faceit-section-card">
                <div className="faceit-section-head is-simple">
                  <span><Clock3 size={16} /> 节点</span>
                </div>
                <div className="faceit-timeline">
                  <div><b>19:00</b><span>今日任务开始</span></div>
                  <div><b>22:00</b><span>检查 FACEIT 记录</span></div>
                  <div><b>00:30</b><span>结算今日压力</span></div>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      {activeTab === 'config' && (
        <div className="faceit-panel faceit-config">
          <div className="faceit-panel-title">
            <span><Settings size={18} /> 后台配置</span>
            <span className="faceit-chip">{canAdmin ? '可保存' : '需要管理员/领队权限'}</span>
          </div>

          <div className="faceit-config-grid">
            <label><strong>队伍名称</strong><input value={configDraft.team_name || ''} onChange={(e) => setConfigDraft({ ...configDraft, team_name: e.target.value })} /></label>
            <label><strong>目标平均 ELO</strong><input type="number" value={configDraft.target_elo || 3200} onChange={(e) => setConfigDraft({ ...configDraft, target_elo: e.target.value })} /></label>
            <label><strong>截止日期</strong><input type="date" value={configDraft.deadline || '2026-07-31'} onChange={(e) => setConfigDraft({ ...configDraft, deadline: e.target.value })} /></label>
            <label><strong>默认单胜加分</strong><input type="number" value={configDraft.avg_elo_per_win || 25} onChange={(e) => setConfigDraft({ ...configDraft, avg_elo_per_win: e.target.value })} /></label>
            <label><strong>样本场数 N</strong><input type="number" value={configDraft.sample_size || 10} onChange={(e) => setConfigDraft({ ...configDraft, sample_size: e.target.value })} /></label>
            <label><strong>每日开始</strong><input type="time" value={configDraft.daily_start_time || '19:00'} onChange={(e) => setConfigDraft({ ...configDraft, daily_start_time: e.target.value })} /></label>
            <label><strong>每日结算</strong><input type="time" value={configDraft.settlement_time || '00:30'} onChange={(e) => setConfigDraft({ ...configDraft, settlement_time: e.target.value })} /></label>
            <label><strong>提醒开关</strong><select value={String(configDraft.reminders_enabled ?? '1')} onChange={(e) => setConfigDraft({ ...configDraft, reminders_enabled: e.target.value })}><option value="1">开启</option><option value="0">关闭</option></select></label>
          </div>

          <div className="faceit-config-block">
            <div className="faceit-panel-title" style={{ marginBottom: 10 }}>FACEIT SEA 队员账号</div>
            {configPlayers.map(({ p, idx }) => (
              <div key={p.id || idx} className="faceit-config-player">
                <label><strong>显示名</strong><input value={p.player_name || ''} onChange={(e) => setPlayerDraft(idx, { player_name: e.target.value })} /></label>
                <label><strong>FACEIT 昵称</strong><input value={p.faceit_nickname || ''} onChange={(e) => setPlayerDraft(idx, { faceit_nickname: e.target.value })} /></label>
                <label><strong>角色</strong><input value={p.role || ''} onChange={(e) => setPlayerDraft(idx, { role: e.target.value })} /></label>
                <label><strong>当前 ELO</strong><input type="number" value={p.current_elo || 0} onChange={(e) => setPlayerDraft(idx, { current_elo: e.target.value })} /></label>
                <label><strong>计入</strong><select value={Number(p.is_active) ? '1' : '0'} onChange={(e) => setPlayerDraft(idx, { is_active: Number(e.target.value) })}><option value="1">是</option><option value="0">否</option></select></label>
              </div>
            ))}
          </div>

          <div className="faceit-config-block">
            <div className="faceit-panel-title" style={{ marginBottom: 10 }}><ShieldCheck size={17} /> FACEIT API Key</div>
            <div className="faceit-config-grid">
              <label><strong>API Key</strong><input type="password" value={apiKeyDraft} placeholder={configDraft.api_key_configured ? '已配置；留空不修改' : '粘贴 Server side API Key'} onChange={(e) => setApiKeyDraft(e.target.value)} /></label>
            </div>
            <div className="faceit-page-sub">API Key 只写入后端 `.env`，不会返回给前端页面。</div>
          </div>

          <div className="faceit-toolbar">
            <button type="button" disabled={saving || !canAdmin} onClick={saveConfig}><Save size={14} /> {saving ? '保存中' : '保存配置'}</button>
            <button type="button" disabled={saving || !canAdmin} onClick={syncPlayers}><RefreshCw size={14} /> 同步队员分数</button>
            <button className="faceit-sync-btn" type="button" disabled={saving || !canAdmin} onClick={syncMatches}><RefreshCw size={14} /> 同步 FACEIT 战绩</button>
          </div>
        </div>
      )}
    </div>
  );
}
