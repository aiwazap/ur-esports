import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, RefreshCw, Target, TimerReset } from 'lucide-react';
import '../pages/faceit-sea.css';

const statusClass = {
  completed: 'faceit-ok',
  behind: 'faceit-warn',
  not_started: 'faceit-idle',
  in_progress: 'faceit-live',
  data_error: 'faceit-bad',
};

function fmtNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—';
}

function timeShort(s) {
  return String(s || '').replace('T', ' ').slice(11, 16) || '—';
}

function dateShort(m) {
  const raw = m?.match_date || String(m?.started_at || '').slice(0, 10);
  return raw ? raw.slice(5) : '—';
}

function scoreText(m) {
  const team = m?.team_score ?? '—';
  const opponent = m?.opponent_score ?? '—';
  return `${team}:${opponent}`;
}

function mapText(m) {
  return String(m?.map || '—').trim() || '—';
}

const mapLogoSlugs = {
  ancient: 'ancient',
  anubis: 'anubis',
  cache: 'cache',
  dust2: 'dust2',
  dustii: 'dust2',
  inferno: 'inferno',
  mirage: 'mirage',
  nuke: 'nuke',
  overpass: 'overpass',
  train: 'train',
  vertigo: 'vertigo',
};

function mapLogoSrc(m) {
  const normalized = mapText(m)
    .toLowerCase()
    .replace(/^de[_\s-]*/, '')
    .replace(/[^a-z0-9]/g, '');
  const slug = mapLogoSlugs[normalized];
  return slug ? `/reshape/home/maps/${slug}.png` : '';
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

const compactPlayerOrder = ['melody', 'glong', '4ever', '0z', 'drace'];
const compactRosterFillers = [
  { player_name: '0Z', faceit_nickname: '0Z', current_elo: 2138, today_matches: 0, month_matches: 13 },
  { player_name: 'drace', faceit_nickname: 'drace', current_elo: 1987, today_matches: 0, month_matches: 9 },
];

function compactPlayerName(p) {
  const raw = String(p?.player_name || p?.faceit_nickname || '');
  return raw.split('/')[0].trim() || '—';
}

function compactPlayerRank(p) {
  const name = compactPlayerName(p).toLowerCase();
  const idx = compactPlayerOrder.indexOf(name);
  return idx === -1 ? 99 : idx;
}

function resultClass(result) {
  if (result === 'win') return 'is-win';
  if (result === 'loss') return 'is-loss';
  return 'is-draw';
}

function resultLabel(result) {
  if (result === 'win') return 'W';
  if (result === 'loss') return 'L';
  return 'D';
}

export default function FaceitSeaSummaryCard({ summary, compact = false, onOpen, onSync, syncing = false, canSync = true }) {
  const [rosterSort, setRosterSort] = useState({ key: 'month_matches', direction: 'desc' });

  if (!summary) {
    return (
      <div className={`ov8-card faceit-card ${compact ? 'faceit-card--compact' : ''}`}>
        <div className="faceit-card-head">
          <div className="faceit-title"><Target size={17} /> 今日 FACEIT SEA 任务</div>
        </div>
        <div className="faceit-skeleton">加载 FACEIT SEA 任务数据中</div>
      </div>
    );
  }

  const { config, progress, players = [], matches = [], sync = {} } = summary;
  const todayRecords = [...matches].sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const targetElo = Number(config.target_elo || progress.target_average_elo || 3200);
  const averageElo = Number(progress.current_average_elo ?? progress.current_best_elo ?? 0);
  const remainingAverage = Number(progress.remaining_average_elo ?? progress.remaining_elo ?? 0);
  const rosterSize = Number(progress.roster_size || players.length || 0);
  const pct = targetElo > 0 ? Math.max(0, Math.min(100, Math.round((averageElo / targetElo) * 100))) : 0;
  const compactPlayerPool = compact
    ? [
      ...players,
      ...compactRosterFillers.filter((f) => !players.some((p) => compactPlayerName(p).toLowerCase() === compactPlayerName(f).toLowerCase())),
    ]
    : players;
  const compactPlayers = [...compactPlayerPool].sort((a, b) => {
    const direction = rosterSort.direction === 'asc' ? 1 : -1;
    const av = Number(a[rosterSort.key] || 0);
    const bv = Number(b[rosterSort.key] || 0);
    return ((av - bv) * direction)
      || compactPlayerRank(a) - compactPlayerRank(b)
      || compactPlayerName(a).localeCompare(compactPlayerName(b));
  });
  const handleRosterSort = (key) => {
    setRosterSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };
  const renderRosterSortButton = (key, label) => {
    const active = rosterSort.key === key;
    const Icon = active ? (rosterSort.direction === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
    const directionText = active && rosterSort.direction === 'asc' ? '升序' : '降序';
    return (
      <button
        className={`faceit-sort-label ${active ? 'is-active' : ''}`}
        type="button"
        aria-pressed={active}
        title={`${label}${directionText}排序`}
        onClick={() => handleRosterSort(key)}
      >
        <span>{label}</span>
        <Icon size={12} strokeWidth={2.6} />
      </button>
    );
  };

  if (compact) {
    const todayMatchCount = todayRecords.length;
    const todayWins = todayRecords.filter((m) => m.result === 'win').length;
    const todayWinRate = todayMatchCount > 0 ? Math.round((todayWins / todayMatchCount) * 100) : 0;
    return (
      <div className="ov8-card faceit-card faceit-card--compact faceit-mini-card">
        <div className="faceit-mini-head">
          <div>
            <div className="faceit-title"><Target size={17} /> FACEIT SEA</div>
            <div className="faceit-sub">{summary.date} · 队员平均目标 {fmtNum(targetElo)}</div>
          </div>
          <div className="faceit-mini-actions">
            <button className="faceit-sync-btn" type="button" onClick={onOpen}>
              更多 FACEIT 数据 <ExternalLink size={14} />
            </button>
            <button className={`faceit-status ${statusClass[progress.status] || ''}`} type="button" onClick={onOpen}>
              当日战绩 →
            </button>
          </div>
        </div>

        <div className="faceit-mini-grid">
          <section className="faceit-mini-panel faceit-mini-summary-panel">
            <div className="faceit-mini-panel-title">平均 ELO</div>
            <div className="faceit-mini-focus">
              <span>距 {fmtNum(targetElo)} 还差</span>
              <strong>{fmtNum(remainingAverage)}</strong>
              <em>当前 {fmtNum(averageElo)} · {rosterSize} 人计入</em>
            </div>

            <div className="faceit-mini-progress" aria-label={`FACEIT 平均 ELO 进度 ${pct}%`}>
              <span style={{ width: `${pct}%` }} />
            </div>

            <div className="faceit-mini-stats">
              <div><span>还需净胜</span><strong>{fmtNum(progress.required_net_wins)} 场</strong></div>
              <div><span>今日还差</span><strong>{fmtNum(progress.today_remaining_wins)} 个胜场</strong></div>
            </div>
          </section>

          <section className="faceit-mini-panel faceit-mini-roster-panel">
            <div className="faceit-mini-panel-title">个人 ELO</div>
            <div className="faceit-mini-roster">
              {compactPlayers.length === 0 ? (
                <div className="faceit-mini-roster-empty">暂无队员分数</div>
              ) : (
                <>
                  <div className="faceit-mini-roster-row is-head">
                    <span>ID</span>
                    {renderRosterSortButton('current_elo', 'ELO')}
                    {renderRosterSortButton('today_matches', '今日场次')}
                    {renderRosterSortButton('month_matches', '本月场次')}
                  </div>
                  {compactPlayers.map((p) => (
                    <div className="faceit-mini-roster-row" key={p.id || p.faceit_nickname || p.player_name}>
                      <span>{compactPlayerName(p)}</span>
                      <strong>{fmtNum(p.current_elo)}</strong>
                      <em>{fmtNum(p.today_matches ?? p.matches_played)}</em>
                      <em>{fmtNum(p.month_matches)}</em>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          <section className="faceit-mini-panel faceit-mini-latest-panel">
            <div className="faceit-mini-panel-title">今日记录</div>
            <div className="faceit-today-summary">
              <div><span>今日比赛场次</span><strong>{fmtNum(todayMatchCount)}</strong></div>
              <div><span>今日胜场</span><strong>{fmtNum(todayWins)}</strong></div>
              <div><span>今日胜率</span><strong>{todayWinRate}%</strong></div>
            </div>
          </section>
        </div>

        <div className="faceit-card-foot">
          <span>{sync.api_key_configured ? 'FACEIT API 已配置' : 'FACEIT API 未配置'}</span>
          <button type="button" onClick={onOpen}>进入看板</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ov8-card faceit-card ${compact ? 'faceit-card--compact' : ''}`}>
      <div className="faceit-card-head">
        <div>
          <div className="faceit-title"><Target size={17} /> 今日 FACEIT SEA 任务</div>
          <div className="faceit-sub">{summary.date} · 截止 {config.deadline} · 队员平均目标 {fmtNum(targetElo)} ELO</div>
        </div>
        <div className="faceit-mini-actions">
          {onSync && (
            <button className="faceit-sync-btn" type="button" disabled={syncing || !canSync} onClick={onSync}>
              <RefreshCw size={14} /> {syncing ? '同步中' : '同步 FACEIT 战绩'}
            </button>
          )}
          <button className={`faceit-status ${statusClass[progress.status] || ''}`} type="button" onClick={onOpen}>
            {progress.status_text}
          </button>
        </div>
      </div>

      <div className="faceit-metrics">
        <div><span>队员平均</span><strong>{fmtNum(averageElo)}</strong><em>{rosterSize} 人计入</em></div>
        <div><span>距平均目标</span><strong>{fmtNum(remainingAverage)}</strong><em>目标 {fmtNum(targetElo)} ELO</em></div>
        <div><span>还需净胜</span><strong>{fmtNum(progress.required_net_wins)}</strong><em>按 {fmtNum(config.avg_elo_per_win)} 分/胜</em></div>
        <div><span>每日压力</span><strong>{fmtNum(progress.required_daily_net_wins)}</strong><em>剩 {fmtNum(progress.remaining_days)} 天</em></div>
      </div>

      <div className="faceit-daily">
        <div className="faceit-daily-bar">
          <span><TimerReset size={14} /> 今日净胜 {fmtNum(progress.today_net_wins)}</span>
          <b>还差 {fmtNum(progress.today_remaining_wins)} 场</b>
        </div>
        <div className="faceit-stack-counts">
          <span>今日组排 {fmtNum(progress.today_full_stack_matches)}</span>
          <span>部分组排 {fmtNum(progress.today_partial_matches)}</span>
          <span>自由排 {fmtNum(progress.today_solo_matches)}</span>
        </div>
      </div>

      <div className="faceit-player-grid">
        {players.map((p) => (
          <div key={p.id || p.faceit_nickname} className="faceit-player-slot">
            <div className="faceit-player-top">
              <strong>{p.player_name}</strong>
              <span className={statusClass[p.status] || ''}>{p.status_text}</span>
            </div>
            <div className="faceit-player-nick">{p.faceit_nickname}</div>
            <div className="faceit-player-stats">
              <span>ELO {fmtNum(p.current_elo)}</span>
              <span>{fmtNum(p.matches_played)} 场</span>
              <span>{p.wins}-{p.losses}</span>
              <span>{p.elo_delta > 0 ? '+' : ''}{fmtNum(p.elo_delta)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="faceit-room-list">
        {todayRecords.length === 0 ? (
          <div className="faceit-empty-room">今日暂无 FACEIT 战绩</div>
        ) : todayRecords.map((m) => (
          <a key={m.faceit_match_id} className="faceit-room" href={m.match_room_url} target="_blank" rel="noreferrer">
            <span>{m.match_date || String(m.started_at || '').slice(0, 10)} {timeShort(m.started_at)}</span>
            <strong>{scoreText(m)}</strong>
            <em>{mapText(m)}</em>
            <small className={`faceit-match-kind is-${matchTypeKey(m)}`}>{matchTypeLabel(m)}</small>
            <em>{m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : '平'}</em>
            <ExternalLink size={13} />
          </a>
        ))}
      </div>

      <div className="faceit-card-foot">
        <span>{sync.api_key_configured ? 'FACEIT API 已配置' : 'FACEIT API 未配置'}</span>
        <button type="button" onClick={onOpen}>查看记录</button>
      </div>
    </div>
  );
}
