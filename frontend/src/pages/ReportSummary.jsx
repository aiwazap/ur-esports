import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import './report-summary.css';

/* ════════════════════════════════════════════════════════════════
   赛训汇总报告 v2（问题导向版）· r29
   数据源（全真实，零新接口）：
   - GET /training-plans/review-report?from&to（problem_rate/by_type/players/core_issues/prev 环比/cmd_rate）
   - GET/PUT /training-plans/review-notes?from&to（教练总结 improve_text + P0/P1/P2 优先级）
   ════════════════════════════════════════════════════════════════ */

const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toDateStr(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toDateStr(d); };

// 失误类型色板（与 design 通用）
const TYPE_COLORS = {
  '走位': '#38bdf8', '枪法': '#f87171', '道具': '#f59e0b',
  '沟通': '#a78bfa', '战术': '#34d399', '经济': '#22d3ee', '未分类': '#7288bd',
};
const TYPE_GRADS = {
  '走位': 'linear-gradient(90deg,#1d4ed8,#38bdf8)', '枪法': 'linear-gradient(90deg,#b91c1c,#f87171)',
  '道具': 'linear-gradient(90deg,#b45309,#f59e0b)', '沟通': 'linear-gradient(90deg,#6d28d9,#a78bfa)',
  '战术': 'linear-gradient(90deg,#047857,#34d399)', '经济': 'linear-gradient(90deg,#0e7490,#22d3ee)',
  '未分类': 'linear-gradient(90deg,#475569,#7288bd)',
};
const typeColor = (t) => TYPE_COLORS[t] || '#7288bd';
const typeGrad = (t) => TYPE_GRADS[t] || TYPE_GRADS['未分类'];
const typeLabel = (t) => (t === '未分类' ? '未分类' : `${t}失误`);

// 队员照片（design assets，按归一化名匹配；无照片回退首字母徽章）
const PHOTOS = ['doomer', 'drace', '0z', 'glong', '4ever', 'hz', 'smokky'];
const photoOf = (name) => {
  const k = String(name || '').toLowerCase();
  return PHOTOS.includes(k) ? `/reshape/report/team/${k}.png` : null;
};

const PERIODS = [
  { key: '7', label: '近7天', days: 7 },
  { key: '30', label: '近30天', days: 30 },
  { key: 'custom', label: '自定义' },
];

function Delta({ cur, prev, invert }) {
  const d = (cur || 0) - (prev || 0);
  if (!d) return <span className="rs-delta rs-delta-flat">— 0</span>;
  const up = d > 0;
  const bad = invert ? !up : up; // 失误上升=坏(红)，执行率上升=好(绿)
  return (
    <span className={'rs-delta ' + (bad ? 'rs-delta-bad' : 'rs-delta-good')}>
      {up ? '▲' : '▼'} {Math.abs(d)}
    </span>
  );
}

export default function ReportSummary() {
  const [period, setPeriod] = useState('30');
  const [customFrom, setCustomFrom] = useState(daysAgo(29));
  const [customTo, setCustomTo] = useState(today());
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const [report, setReport] = useState(null);
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [selType, setSelType] = useState(null);     // 点击的失误类型 → 展开地图分布
  const [selPlayer, setSelPlayer] = useState(null); // 点击的队员 → 全景只看该队员
  const [selMap, setSelMap] = useState(null);        // 点击的地图 → 逐日错误记录弹窗
  const [dict, setDict] = useState([]);              // 失误类型字典（error_types）
  const [rosterNames, setRosterNames] = useState([]);
  const [activeNames, setActiveNames] = useState([]); // 在役且非下放(demoted)，用于现役/非现役拆分
  const [rowDraft, setRowDraft] = useState({});      // {incidentId: {typeVal, who, detail}}
  const [savingId, setSavingId] = useState(null);
  const [importing, setImporting] = useState(null);  // {done,total} 导入进度
  const [draftText, setDraftText] = useState('');
  const [draftPri, setDraftPri] = useState([]);
  const [saving, setSaving] = useState(false);

  const curUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canEdit = ['admin', 'coach', 'team_lead'].includes(curUser.role);

  const fetchAll = useCallback((from, to) => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/training-plans/review-report', { params: { from, to } }),
      api.get('/training-plans/review-notes', { params: { from, to } }),
    ]).then(([r1, r2]) => {
      setReport(r1.data);
      setNotes(r2.data);
    }).catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(range.from, range.to); }, [range, fetchAll]);

  useEffect(() => {
    api.get('/training-plans/error-types').then((r) => setDict(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get('/players?division=cs2&status=active&team_type=roster')
      .then((r) => {
        const arr = Array.isArray(r.data) ? r.data : [];
        setRosterNames(arr.map((p) => p.nickname).filter(Boolean));
        setActiveNames(arr.filter((p) => String(p.roster_status || '') !== 'demoted').map((p) => p.nickname).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  const pickPeriod = (key) => {
    setPeriod(key);
    setSelType(null); setSelPlayer(null); setSelMap(null); setRowDraft({});
    if (key === '7') setRange({ from: daysAgo(6), to: today() });
    else if (key === '30') setRange({ from: daysAgo(29), to: today() });
    // custom：等点"应用"
  };
  const applyCustom = () => { if (customFrom && customTo) setRange({ from: customFrom, to: customTo }); };

  const openEditor = () => {
    setDraftText(notes?.improve_text || '');
    const pri = Array.isArray(notes?.priorities) ? notes.priorities : [];
    setDraftPri(pri.length ? pri.map((p) => ({
      level: p.level || p.priority || 'P1',
      title: p.title || p.text || '',
      who: p.who || p.owner || '',
      advice: p.advice || p.detail || '',
    })) : [{ level: 'P0', title: '', who: '', advice: '' }]);
    setEditing(true);
  };
  const saveNotes = () => {
    setSaving(true);
    api.put('/training-plans/review-notes', { improve_text: draftText, priorities: draftPri.filter((p) => p.title) },
      { params: { from: range.from, to: range.to } })
      .then(() => { setEditing(false); fetchAll(range.from, range.to); })
      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setSaving(false));
  };

  if (loading && !report) return <div className="rs-root"><div className="rs-loading">报告生成中…</div></div>;
  if (error && !report) return <div className="rs-root"><div className="rs-loading" style={{ color: '#f87171' }}>报告加载失败：{error}</div></div>;
  if (!report) return null;

  const s = report.summary || {};
  const prev = report.prev || {};
  const byType = s.by_type || {};
  const prevByType = prev.by_type || {};
  const players = (report.players || []).filter((p) => p.name !== '全队');
  const coreIssues = report.core_issues || [];

  const incidents = (report.incidents || []).filter((x) => x.type !== '教练点赞');
  // 地图名归一：ANC/anc→Ancient；大小写变体统一（Dust2/dust2、Anubis/anubis 等）
  const MAP_NORM = {
    mirage: 'Mirage', dust2: 'Dust2', nuke: 'Nuke', anubis: 'Anubis',
    ancient: 'Ancient', anc: 'Ancient', overpass: 'Overpass',
    inferno: 'Inferno', train: 'Train', vertigo: 'Vertigo', cache: 'Cache',
  };
  const normMap = (m) => {
    const k = String(m || '').trim().toLowerCase();
    if (!k) return '未知';
    return MAP_NORM[k] || (k.charAt(0).toUpperCase() + k.slice(1));
  };
  const mapIcon = (name) => {
    const k = String(name || '').toLowerCase();
    return ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'].includes(k)
      ? `/reshape/home/maps/${k}.png` : null;
  };
  const involves = (x, name) => (x.whos || []).includes(name) || (x.co_responsible || []).includes(name);

  // ── 失误类型全景（剔除正向"教练点赞"，按次数降序）──
  // 无队员筛选：用 summary.by_type（后端口径）；筛选队员：用 players[].by_type（与 prev.players 同算法，环比仍真实）
  const selCur = selPlayer ? players.find((p) => p.name === selPlayer) : null;
  const selPrev = selPlayer ? ((prev.players || []).find((p) => p.name === selPlayer) || null) : null;
  const typeRows = (selPlayer
    ? Object.entries(selCur?.by_type || {}).map(([t, n]) => ({ type: t, count: n || 0, prev: (selPrev?.by_type || {})[t] || 0 }))
    : Object.entries(byType).map(([t, n]) => ({ type: t, count: n || 0, prev: prevByType[t] || 0 }))
  )
    .filter((r) => r.type !== '教练点赞')
    .filter((r) => r.count > 0 || r.prev > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...typeRows.map((r) => Math.max(r.count, r.prev)));

  // ── 选中类型 → 地图分布（次数降序）──
  const mapStatsOf = (t) => {
    const agg = {};
    for (const x of incidents) {
      if (x.type !== t) continue;
      if (selPlayer && !involves(x, selPlayer)) continue;
      const m = normMap(x.map);
      agg[m] = (agg[m] || 0) + 1;
    }
    return Object.entries(agg).map(([map, n]) => ({ map, n })).sort((a, b) => b.n - a.n);
  };

  // 每类型 top3 责任人（从 players.by_type 汇总）
  const topWho = (t) => players
    .map((p) => ({ who: p.name, n: (p.by_type || {})[t] || 0 }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);

  // ── 结论横幅：自动结论句（本期最大两类 + 合计占比）──
  const totalErr = typeRows.reduce((a, r) => a + r.count, 0);
  const top2 = typeRows.slice(0, 2);
  const top2Share = totalErr > 0 ? Math.round((top2.reduce((a, r) => a + r.count, 0) / totalErr) * 100) : 0;
  const rateDelta = Math.round(((s.problem_rate || 0) - (prev.problem_rate || 0)) * 10) / 10;
  const cmdDelta = (s.cmd_rate != null && prev.cmd_rate != null) ? s.cmd_rate - prev.cmd_rate : null;
  const rateWorse = rateDelta >= 0;

  // ── 队员失误榜（现役/非现役拆分）──
  const _isActiveName = (name) => {
    const nl = String(name || '').toLowerCase().trim(); if (!nl) return false;
    return activeNames.some((n) => {
      const nk = String(n || '').toLowerCase();
      return nk === nl || (nl.length >= 3 && (nk.includes(nl) || nl.includes(nk)));
    });
  };
  const activePlayers   = players.filter((p) => _isActiveName(p.name));
  const inactivePlayers = players.filter((p) => !_isActiveName(p.name));
  const topPlayers = activePlayers.slice(0, 6);
  const maxPlayerTotal = Math.max(1, ...topPlayers.map((p) => p.total));
  const maxInactiveTotal = Math.max(1, ...inactivePlayers.map((p) => p.total));

  // ── 典型失误场景：core_issues 各取一条样例 ──
  const scenes = [];
  for (const ci of coreIssues) {
    const sm = (ci.samples || [])[0];
    if (sm) scenes.push({ type: ci.type, detail: sm.detail, meta: `${(sm.date || '').slice(5)} ${sm.map || ''} ${sm.round || ''}`, top: (ci.top_players || [])[0] });
    if (scenes.length >= 4) break;
  }

  // ── 优先级卡 ──
  const priList = (Array.isArray(notes?.priorities) ? notes.priorities : []).map((p) => ({
    level: p.level || p.priority || 'P1',
    title: p.title || p.text || '',
    who: p.who || p.owner || '',
    advice: p.advice || p.detail || '',
  })).filter((p) => p.title);
  const priCls = (lv) => (lv === 'P0' ? 'rs-pri-p0' : lv === 'P1' ? 'rs-pri-p1' : 'rs-pri-p2');

  // ── 失误记录行编辑（人工录入+系统匹配可能出错，允许纠正）──
  const draftOf = (x) => rowDraft[x.id] || {
    typeVal: x.type_id ? `id:${x.type_id}` : `cat:${x.type}`,
    who: x.who || '全队',
    detail: x.detail || '',
  };
  const saveIncident = (x) => {
    const d = draftOf(x);
    const payload = {
      error_type_id: d.typeVal.startsWith('id:') ? Number(d.typeVal.slice(3)) : null,
      category: d.typeVal.startsWith('cat:') ? d.typeVal.slice(4) : undefined,
      responsible: d.who,
      co_responsible: x.co_responsible || [],
      detail: d.detail,
    };
    setSavingId(x.id);
    api.put(`/training-plans/review/incident/${x.id}`, payload)
      .then(() => fetchAll(range.from, range.to))
      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setSavingId(null));
  };
  const dictByCat = {};
  for (const t of dict) { (dictByCat[t.category || '未分类'] = dictByCat[t.category || '未分类'] || []).push(t); }
  const whoOptions = (cur) => {
    const base = ['全队', ...rosterNames];
    if (cur && !base.includes(cur)) base.push(cur);
    return base;
  };

  // ── 失误导出（跟随当前筛选：选了队员只导该队员；周期跟随当前区间）──
  const CSV_HEADS = ['id', '日期', '对手', '地图', '回合', '边', '类型大类', '类型明细', '责任人', '连带责任', '失误详情'];
  const csvEsc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const exportCsv = () => {
    const rows = incidents.filter((x) => !selPlayer || involves(x, selPlayer));
    if (!rows.length) { alert('当前筛选下没有可导出的失误记录'); return; }
    const lines = [CSV_HEADS.join(',')];
    for (const x of rows) {
      lines.push([
        x.id, x.date, x.opponent, normMap(x.map), x.round, x.side || '',
        x.type, x.type_name || '', x.who || '全队',
        (x.co_responsible || []).join('/'), x.detail || '',
      ].map(csvEsc).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `失误导出_${selPlayer || '全部'}_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── CSV 解析（支持引号包裹、逗号/换行转义）──
  const parseCsv = (text) => {
    const t = text.replace(/^\ufeff/, '');
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  };

  // ── 导入更新：仅更新已有 id 的行（diff 后只提交有改动的）──
  const onImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseCsv(String(reader.result || ''));
      if (rows.length < 2) { alert('文件为空或缺少表头'); return; }
      const head = rows[0].map((h) => String(h).trim());
      const col = (n) => head.indexOf(n);
      if (col('id') < 0) { alert('缺少 id 列，无法定位记录（请用本页导出的文件修改后导入）'); return; }
      const byId = {}; incidents.forEach((x) => { byId[x.id] = x; });
      const dictByName = {}; dict.forEach((t) => { dictByName[String(t.name).trim()] = t; });
      const CATS = ['道具', '沟通', '战术', '走位', '枪法', '经济', '未分类'];
      const updates = []; const errors = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const id = Number(String(r[col('id')] || '').trim());
        if (!id) continue;
        const x = byId[id];
        if (!x) { errors.push(`第${i + 1}行 id=${id} 不在当前周期记录内，跳过`); continue; }
        const g = (n) => (col(n) >= 0 ? String(r[col(n)] ?? '').trim() : null);
        const typeName = g('类型明细'); const cat = g('类型大类');
        let error_type_id = null; let category;
        if (typeName) {
          const d = dictByName[typeName];
          if (d) error_type_id = d.id;
          else { errors.push(`第${i + 1}行 类型明细"${typeName}"不在字段库，跳过`); continue; }
        } else if (cat) {
          if (!CATS.includes(cat)) { errors.push(`第${i + 1}行 类型大类"${cat}"不合法，跳过`); continue; }
          category = cat;
        }
        const who = g('责任人') || x.who || '全队';
        const coRaw = g('连带责任');
        const co = coRaw != null ? coRaw.split(/[,，/、]/).map((s) => s.trim()).filter(Boolean) : (x.co_responsible || []);
        const detail = g('失误详情') != null ? g('失误详情') : (x.detail || '');
        const changed =
          (error_type_id != null && error_type_id !== x.type_id) ||
          (error_type_id == null && category && category !== x.type) ||
          who !== (x.who || '全队') ||
          co.join('/') !== (x.co_responsible || []).join('/') ||
          detail !== (x.detail || '');
        if (!changed) continue;
        updates.push({ id, payload: { error_type_id, category, responsible: who, co_responsible: co, detail } });
      }
      if (!updates.length) { alert(`没有检测到改动。${errors.length ? '\n' + errors.join('\n') : ''}`); return; }
      if (!window.confirm(`将更新 ${updates.length} 条失误记录${errors.length ? `（另有 ${errors.length} 行跳过）` : ''}，确认导入？`)) return;
      setImporting({ done: 0, total: updates.length });
      let ok = 0; const fails = [];
      for (const u of updates) {
        try { await api.put(`/training-plans/review/incident/${u.id}`, u.payload); ok++; }
        catch (err) { fails.push(`id=${u.id}: ${err.response?.data?.error || err.message}`); }
        setImporting({ done: ok + fails.length, total: updates.length });
      }
      setImporting(null);
      alert(`导入完成：更新 ${ok} 条${fails.length ? `，失败 ${fails.length} 条\n${fails.slice(0, 5).join('\n')}` : ''}${errors.length ? `\n跳过 ${errors.length} 行` : ''}`);
      fetchAll(range.from, range.to);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="rs-root">
      <div className="rs-glow" />

      {/* ══ 页头 ══ */}
      <div className="rs-head">
        <div className="rs-head-left">
          <div className="rs-eyebrow">SAIXUN SUMMARY REPORT · 系统自动生成</div>
          <div className="rs-title-row">
            <span className="rs-title">赛训汇总报告</span>
            <span className="rs-title-sub">{report.range?.from} ~ {report.range?.to} · {s.matches ?? 0} 场训练赛 · {s.total_rounds ?? 0} 回合</span>
          </div>
        </div>
        <div className="rs-head-right">
          <div className="rs-pills">
            {PERIODS.map((p) => (
              <span key={p.key} className={'rs-pill ' + (period === p.key ? 'rs-pill-on' : '')} onClick={() => pickPeriod(p.key)}>{p.label}</span>
            ))}
          </div>
          <span className="rs-classic" onClick={exportCsv} title={selPlayer ? `仅导出 ${selPlayer} 相关失误` : '导出当前周期全部失误'}>
            导出{selPlayer ? ` ${selPlayer} ` : '全部'}失误
          </span>
          {canEdit && (
            <label className="rs-classic" style={{ cursor: importing ? 'wait' : 'pointer' }} title="导入本页导出并修改后的 CSV，直接更新记录">
              {importing ? `导入中 ${importing.done}/${importing.total}` : '导入更新'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={onImportFile} disabled={!!importing} />
            </label>
          )}
          {period === 'custom' && (
            <div className="rs-custom">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span>~</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              <span className="rs-apply" onClick={applyCustom}>应用</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ 结论横幅 ══ */}
      <div className={'rs-banner ' + (rateWorse ? '' : 'rs-banner-good')}>
        <div className="rs-banner-rate">
          <div className="rs-banner-tag"><span className="rs-dot" />本期最大问题</div>
          <div className="rs-banner-big-row">
            <span className="rs-banner-big">{s.problem_rate != null ? `${s.problem_rate}%` : '—'}</span>
            {prev.problem_rate != null && (
              <span className={'rs-pp ' + (rateWorse ? 'rs-pp-bad' : 'rs-pp-good')}>{rateWorse ? '▲' : '▼'} {Math.abs(rateDelta)}pp</span>
            )}
          </div>
          <div className="rs-banner-note">问题发生率 · 上期 {prev.problem_rate != null ? `${prev.problem_rate}%` : '—'}</div>
        </div>
        <div className="rs-vline" />
        <div className="rs-banner-mid">
          <div className="rs-banner-conc">
            {top2.length >= 1 ? (<>
              {typeLabel(top2[0].type)} <span className="rs-red">环比 {top2[0].count - top2[0].prev >= 0 ? '+' : ''}{top2[0].count - top2[0].prev} 次</span>
              {top2.length >= 2 && (<>、{typeLabel(top2[1].type)} <span className="rs-red">{top2[1].count - top2[1].prev >= 0 ? '+' : ''}{top2[1].count - top2[1].prev} 次</span></>)}
              ，{top2.length >= 2 ? '两项' : '该项'}合计占本期全部失误的 <span className="rs-amber">{top2Share}%</span>
            </>) : '本期暂无失误记录'}
          </div>
          <div className="rs-banner-coach">
            {notes?.improve_text
              ? <>{notes.improve_text} <span className="rs-dim">—— 教练总结</span></>
              : <span className="rs-dim">暂无教练总结{canEdit ? '（右下"编辑"可填写）' : ''}</span>}
          </div>
        </div>
        <div className="rs-vline" />
        <div className="rs-banner-side">
          <div className="rs-side-item">
            <span className="rs-side-big rs-green">{s.cmd_rate != null ? `${s.cmd_rate}%` : '—'}</span>
            <div className="rs-side-note">指令执行率<br />
              {cmdDelta != null && <span className={cmdDelta >= 0 ? 'rs-green-b' : 'rs-red-b'}>{cmdDelta >= 0 ? '▲' : '▼'} {Math.abs(cmdDelta)}pp</span>}
              {prev.cmd_rate != null && <> · 上期 {prev.cmd_rate}%</>}
            </div>
          </div>
          <div className="rs-side-item">
            <span className="rs-side-big">{s.total_rounds ?? 0}</span>
            <div className="rs-side-note">总回合数<br />{s.matches ?? 0} 场训练赛</div>
          </div>
        </div>
      </div>

      {/* ══ 主视图：失误全景 + 队员榜 ══ */}
      <div className="rs-main">
        <div className="rs-card">
          <div className="rs-card-head">
            <div className="rs-card-title"><span className="rs-tick" />失误类型全景 <span className="rs-dim-note">{selPlayer ? '按次数排序 · 点击类型看地图分布' : '按次数排序 · 灰条为上期 · 点击类型看地图分布'}</span></div>
            {selPlayer && (
              <span className="rs-filterchip" onClick={() => { setSelPlayer(null); setSelType(null); }}>仅看 {selPlayer} 相关 ✕</span>
            )}
          </div>
          {typeRows.length === 0 ? <div className="rs-empty">该周期暂无失误数据</div> : (
            <div className="rs-typelist">
              {typeRows.map((r, i) => {
                const who3 = topWho(r.type);
                const open = selType === r.type;
                const maps = open ? mapStatsOf(r.type) : [];
                const maxMap = Math.max(1, ...maps.map((m) => m.n));
                return (
                  <div key={r.type}>
                    <div className={'rs-type-row rs-type-click ' + (open ? 'rs-type-on' : '')}
                      onClick={() => setSelType(open ? null : r.type)} title="点击查看该类型的地图分布">
                      <span className="rs-type-idx">{String(i + 1).padStart(2, '0')}</span>
                      <span className="rs-type-name">{typeLabel(r.type)}</span>
                      <span className="rs-type-num" style={{ color: typeColor(r.type) }}>{r.count}</span>
                      <Delta cur={r.count} prev={r.prev} />
                      <span className="rs-type-who">{selPlayer ? `${selPlayer} ${r.count}` : (who3.map((w) => `${w.who} ${w.n}`).join(' · ') || '—')}</span>
                      <span className="rs-type-caret">{open ? '▾' : '›'}</span>
                    </div>
                    <div className="rs-type-bars">
                      <div className="rs-ghost"><div style={{ width: `${(r.prev / maxCount) * 100}%` }} /></div>
                      <div className="rs-bar"><div style={{ width: `${(r.count / maxCount) * 100}%`, background: typeGrad(r.type), animationDelay: `${0.2 + i * 0.15}s`, boxShadow: i < 2 ? `0 0 14px ${typeColor(r.type)}80` : 'none' }} /></div>
                    </div>
                    {open && (
                      <div className="rs-mapstat">
                        <div className="rs-mapstat-title">{typeLabel(r.type)} · 地图分布{selPlayer ? `（仅 ${selPlayer} 相关）` : ''} · 次数降序</div>
                        {maps.length === 0 ? (
                          <div className="rs-mapstat-empty">该周期此类型暂无地图明细</div>
                        ) : maps.map((m) => (
                          <div key={m.map} className="rs-mapstat-row rs-mapstat-click" title="点击查看该图逐日错误记录（可修改）"
                            onClick={() => { setSelMap(m.map); setRowDraft({}); }}>
                            {mapIcon(m.map) && <img src={mapIcon(m.map)} alt="" />}
                            <span className="rs-mapstat-name">{m.map}</span>
                            <div className="rs-mapstat-bar"><div style={{ width: `${(m.n / maxMap) * 100}%`, background: typeGrad(r.type) }} /></div>
                            <span className="rs-mapstat-n" style={{ color: typeColor(r.type) }}>{m.n}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rs-card">
          <div className="rs-card-head">
            <div className="rs-card-title"><span className="rs-tick" />队员失误榜</div>
            <div className="rs-legend">
              {Object.entries(TYPE_COLORS).filter(([t]) => t !== '未分类').map(([t, c]) => (
                <span key={t}><i style={{ background: c }} />{t}</span>
              ))}
            </div>
          </div>
          {topPlayers.length === 0 ? <div className="rs-empty">该周期暂无个人失误数据</div> : (
            <div className="rs-plist">
              {topPlayers.map((p, i) => (
                <div key={p.name}
                  className={'rs-prow rs-prow-click ' + (selPlayer === p.name ? 'rs-prow-on' : selPlayer ? 'rs-prow-dim' : '')}
                  onClick={() => { setSelPlayer(selPlayer === p.name ? null : p.name); setSelType(null); }}
                  title={selPlayer === p.name ? '点击取消筛选' : '点击只看该队员相关失误'}>
                  <div className="rs-pmeta">
                    {photoOf(p.name)
                      ? <img className={'rs-pava ' + (i === 0 ? 'rs-pava-p0' : '')} src={photoOf(p.name)} alt={p.name} />
                      : <span className={'rs-pava rs-pava-txt ' + (i === 0 ? 'rs-pava-p0' : '')}>{String(p.name)[0]}</span>}
                    <span className="rs-pname">{p.name}</span>
                    {i === 0 && <span className="rs-p0chip">P0 责任人</span>}
                    <span className="rs-ptotal">{p.total}</span>
                  </div>
                  <div className="rs-pstack" style={{ width: `${(p.total / maxPlayerTotal) * 100}%` }}>
                    {Object.entries(p.by_type || {}).filter(([t, n]) => n > 0 && t !== '教练点赞').map(([t, n]) => (
                      <div key={t} title={`${t} ${n}`} style={{ flex: n, background: typeColor(t) }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {inactivePlayers.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: '#8fa5d8', userSelect: 'none', padding: '4px 0', listStyle: 'none' }}>
                ▸ 非现役队员数据（下放 / 离队 · {inactivePlayers.length} 人）
              </summary>
              <div className="rs-plist" style={{ marginTop: 6, opacity: 0.72 }}>
                {inactivePlayers.map((p) => (
                  <div key={p.name}
                    className={'rs-prow rs-prow-click ' + (selPlayer === p.name ? 'rs-prow-on' : selPlayer ? 'rs-prow-dim' : '')}
                    onClick={() => { setSelPlayer(selPlayer === p.name ? null : p.name); setSelType(null); }}
                    title={selPlayer === p.name ? '点击取消筛选' : '点击只看该队员相关失误'}>
                    <div className="rs-pmeta">
                      {photoOf(p.name)
                        ? <img className="rs-pava" src={photoOf(p.name)} alt={p.name} style={{ filter: 'grayscale(1)' }} />
                        : <span className="rs-pava rs-pava-txt">{String(p.name)[0]}</span>}
                      <span className="rs-pname">{p.name}</span>
                      <span className="rs-ptotal">{p.total}</span>
                    </div>
                    <div className="rs-pstack" style={{ width: `${(p.total / maxInactiveTotal) * 100}%` }}>
                      {Object.entries(p.by_type || {}).filter(([t, n]) => n > 0 && t !== '教练点赞').map(([t, n]) => (
                        <div key={t} title={`${t} ${n}`} style={{ flex: n, background: typeColor(t) }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* ══ 场景 + 优先级 ══ */}
      <div className="rs-main rs-main-2">
        <div className="rs-card">
          <div className="rs-card-head">
            <div className="rs-card-title"><span className="rs-tick" />典型失误场景 <span className="rs-dim-note">摘自训练日志</span></div>
          </div>
          {scenes.length === 0 ? <div className="rs-empty">该周期暂无场景记录</div> : (
            <div className="rs-scenes">
              {scenes.map((sc, i) => (
                <div key={i} className="rs-scene" style={{ borderLeftColor: typeColor(sc.type) }}>
                  <span className="rs-scene-chip" style={{ color: typeColor(sc.type), borderColor: typeColor(sc.type) + '66', background: typeColor(sc.type) + '1a' }}>{sc.type}</span>
                  <div className="rs-scene-body">
                    <div className="rs-scene-text">{sc.detail}</div>
                    <div className="rs-scene-meta">{sc.meta}{sc.top ? ` · 高频责任人 ${sc.top.who} ×${sc.top.n}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rs-card">
          <div className="rs-card-head">
            <div className="rs-card-title"><span className="rs-tick" />改进优先级</div>
            {canEdit && <span className="rs-editbtn" onClick={openEditor}>编辑</span>}
          </div>
          {priList.length === 0 ? <div className="rs-empty">暂无改进优先级{canEdit ? '（点右上"编辑"添加）' : ''}</div> : (
            <div className="rs-prilist">
              {priList.map((p, i) => (
                <div key={i} className={'rs-pri ' + priCls(p.level)}>
                  <div className="rs-pri-head">
                    <span className="rs-pri-lv">{p.level}</span>
                    <span className="rs-pri-title">{p.title}</span>
                    {p.who && (photoOf(p.who)
                      ? <img className="rs-pri-ava" src={photoOf(p.who)} alt={p.who} title={p.who} />
                      : <span className="rs-pri-who">{p.who}</span>)}
                  </div>
                  {p.advice && <div className="rs-pri-advice">{p.advice}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ 地图逐日错误记录弹窗（字段可修改）══ */}
      {selType && selMap && (() => {
        const rows = incidents
          .filter((x) => x.type === selType && normMap(x.map) === selMap)
          .filter((x) => !selPlayer || involves(x, selPlayer))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.round).localeCompare(String(b.round)));
        const byDate = {};
        rows.forEach((x) => { (byDate[x.date] = byDate[x.date] || []).push(x); });
        return (
          <div className="rs-modal-mask" onClick={() => setSelMap(null)}>
            <div className="rs-modal" style={{ width: 760 }} onClick={(e) => e.stopPropagation()}>
              <div className="rs-modal-head">
                <span>{selMap} · {typeLabel(selType)} · 逐日错误记录{selPlayer ? `（仅 ${selPlayer} 相关）` : ''} · 共 {rows.length} 条</span>
                <span className="rs-modal-close" onClick={() => setSelMap(null)}>✕</span>
              </div>
              {rows.length === 0 ? <div className="rs-empty" style={{ marginTop: 14 }}>暂无记录</div> : (
                <div className="rs-inc-scroll">
                  {Object.entries(byDate).map(([d, list]) => (
                    <div key={d}>
                      <div className="rs-inc-date">{d} · vs {list[0].opponent} · {list.length} 条</div>
                      {list.map((x) => {
                        const dr = draftOf(x);
                        return (
                          <div key={x.id} className="rs-inc-row">
                            <span className="rs-inc-round">{x.round}{x.side ? ` · ${x.side}` : ''}</span>
                            <select className="rs-sel" value={dr.typeVal} onChange={(e) => setRowDraft((dd) => ({ ...dd, [x.id]: { ...dr, typeVal: e.target.value } }))} disabled={!canEdit}>
                              <optgroup label="大类直改">
                                {['道具', '沟通', '战术', '走位', '枪法', '经济', '未分类'].map((c) => <option key={c} value={`cat:${c}`}>{c}</option>)}
                              </optgroup>
                              {Object.entries(dictByCat).map(([cat, arr]) => (
                                <optgroup key={cat} label={cat}>
                                  {arr.map((t) => <option key={t.id} value={`id:${t.id}`}>{t.name}</option>)}
                                </optgroup>
                              ))}
                            </select>
                            <select className="rs-sel" style={{ width: 92 }} value={dr.who} onChange={(e) => setRowDraft((dd) => ({ ...dd, [x.id]: { ...dr, who: e.target.value } }))} disabled={!canEdit}>
                              {whoOptions(dr.who).map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input className="rs-inp" value={dr.detail} onChange={(e) => setRowDraft((dd) => ({ ...dd, [x.id]: { ...dr, detail: e.target.value } }))} disabled={!canEdit} placeholder="失误详情…" />
                            {canEdit && (
                              <span className={'rs-savebtn ' + (savingId === x.id ? 'rs-savebtn-busy' : '')}
                                onClick={() => savingId ? null : saveIncident(x)}>{savingId === x.id ? '保存中' : '保存'}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ 编辑弹窗（教练总结 + 优先级）══ */}
      {editing && (
        <div className="rs-modal-mask" onClick={() => setEditing(false)}>
          <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rs-modal-head">
              <span>编辑报告备注 · {range.from} ~ {range.to}</span>
              <span className="rs-modal-close" onClick={() => setEditing(false)}>✕</span>
            </div>
            <div className="rs-modal-label">教练总结</div>
            <textarea className="rs-ta" rows={3} value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="本期训练问题总结与方向…" />
            <div className="rs-modal-label">改进优先级</div>
            {draftPri.map((p, i) => (
              <div key={i} className="rs-pri-edit">
                <select value={p.level} onChange={(e) => setDraftPri((d) => d.map((x, j) => j === i ? { ...x, level: e.target.value } : x))}>
                  <option>P0</option><option>P1</option><option>P2</option>
                </select>
                <input placeholder="问题标题" value={p.title} onChange={(e) => setDraftPri((d) => d.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <input placeholder="责任人" style={{ width: 90 }} value={p.who} onChange={(e) => setDraftPri((d) => d.map((x, j) => j === i ? { ...x, who: e.target.value } : x))} />
                <input placeholder="具体建议" value={p.advice} onChange={(e) => setDraftPri((d) => d.map((x, j) => j === i ? { ...x, advice: e.target.value } : x))} />
                <span className="rs-pri-del" onClick={() => setDraftPri((d) => d.filter((_, j) => j !== i))}>✕</span>
              </div>
            ))}
            <div className="rs-addpri" onClick={() => setDraftPri((d) => [...d, { level: 'P1', title: '', who: '', advice: '' }])}>+ 添加一条</div>
            <div className="rs-modal-foot">
              <span className="rs-btn-ghost" onClick={() => setEditing(false)}>取消</span>
              <span className="rs-btn-main" onClick={saving ? undefined : saveNotes}>{saving ? '保存中…' : '保存'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
