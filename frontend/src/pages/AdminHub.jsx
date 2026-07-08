import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Users from './Users';
import './admin-hub.css';

/* ════════════════════════════════════════════════════════════════
   数据管理后台 · 1b 卡片枢纽（r34）
   数据全真实（接口均取自现有代码实拍）：
   /dashboard/overview · /training-plans/review-report · /training-plans/error-types
   /tournaments · /players · /admin/users · /admin/pending-users · /admin/logs
   旧数据管理页保留在 /admin-legacy（手动录入/JSON导入/字段库编辑等功能不丢）
   ════════════════════════════════════════════════════════════════ */

const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => toDateStr(new Date());

export default function AdminHub() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState(null);
  const [rev, setRev] = useState(null);
  const [errTypes, setErrTypes] = useState(null);
  const [tours, setTours] = useState(null);
  const [roster, setRoster] = useState(null);
  const [users, setUsers] = useState(null);
  const [pendingUsers, setPendingUsers] = useState(null);
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState('');
  const [todoOpen, setTodoOpen] = useState(false);   // 未分类失误待办展开
  const [rowDraft, setRowDraft] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [modal, setModal] = useState(null);          // 'users' | 'dict' | 'mappool'
  const [dictDraft, setDictDraft] = useState({});    // {id: 行草稿}
  const [dictNew, setDictNew] = useState(null);      // 新增行草稿
  const [dictBusy, setDictBusy] = useState(false);
  const [mapPool, setMapPool] = useState(null);      // {active:[], firstBan}
  const [poolDraft, setPoolDraft] = useState(null);
  const [importing, setImporting] = useState(null);

  const ALL_MAPS = ['Ancient', 'Anubis', 'Cache', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Overpass', 'Train', 'Vertigo'];
  const DEFAULT_ACTIVE = ['Ancient', 'Anubis', 'Dust2', 'Mirage', 'Nuke', 'Overpass'];
  const mapIcon = (n) => {
    const k = String(n).toLowerCase();
    return ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'].includes(k) ? `/reshape/home/maps/${k}.png` : null;
  };
  const refetchDict = () => api.get('/training-plans/error-types').then((r) => setErrTypes(Array.isArray(r.data) ? r.data : [])).catch(() => {});

  const refetchRev = () => api.get('/training-plans/review-report', { params: { from: '2020-01-01', to: today() } })
    .then((r) => setRev(r.data)).catch(() => {});

  useEffect(() => {
    api.get('/dashboard/overview', { params: { start: '2020-01-01', end: today() } })
      .then((r) => setKpi(r.data)).catch(() => setKpi({}));
    api.get('/training-plans/review-report', { params: { from: '2020-01-01', to: today() } })
      .then((r) => setRev(r.data)).catch(() => setRev({}));
    api.get('/training-plans/error-types')
      .then((r) => setErrTypes(Array.isArray(r.data) ? r.data : [])).catch(() => setErrTypes([]));
    api.get('/tournaments')
      .then((r) => setTours(Array.isArray(r.data) ? r.data : [])).catch(() => setTours([]));
    api.get('/players?division=cs2&status=active&team_type=roster')
      .then((r) => setRoster(Array.isArray(r.data) ? r.data : [])).catch(() => setRoster([]));
    api.get('/admin/users')
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => setUsers(null));
    api.get('/admin/pending-users')
      .then((r) => setPendingUsers(Array.isArray(r.data) ? r.data : [])).catch(() => setPendingUsers(null));
    api.get('/admin/logs')
      .then((r) => setLogs(Array.isArray(r.data) ? r.data : [])).catch(() => setLogs([]));
    api.get('/admin/map-pool').then((r) => setMapPool(r.data || null)).catch(() => setMapPool(null));
  }, []);

  // ── 真实统计 ──
  const scrimTotal = kpi?.kpi?.totalRecentMatches ?? null;
  const totalRounds = rev?.summary?.total_rounds ?? null;
  const byType = rev?.summary?.by_type || {};
  const errTotal = Object.entries(byType).filter(([t]) => t !== '教练点赞').reduce((a, [, n]) => a + (n || 0), 0);
  const unclassified = byType['未分类'] || 0;
  const dictCount = errTypes ? errTypes.length : null;
  const catCount = errTypes ? new Set(errTypes.map((x) => x.category).filter(Boolean)).size : null;
  const tourTotal = tours ? tours.length : null;
  const tourOpen = tours ? tours.filter((t) => !t.is_finished).length : null;
  const rosterN = roster ? roster.length : null;
  const userN = users ? users.length : null;
  const pendingN = pendingUsers ? pendingUsers.length : null;
  const visMaps = (kpi?.mapStats || []).filter((m) => !['Inferno', 'Train'].includes(m.map_name)).length;

  const CARDS = [
    {
      icon: 'schedule', name: '比赛记录', stat: scrimTotal != null ? `训练赛 ${scrimTotal} 场 · 展示与查询` : '统计加载中…',
      badge: null, note: '只看不改；数据修正走"赛事编辑"',
      actions: [{ t: '查看 →', to: '/matches' }],
    },
    {
      icon: 'log', name: '训练日志', stat: totalRounds != null ? `${totalRounds} 回合 · ${errTotal} 条失误` : '统计加载中…',
      badge: unclassified > 0 ? { n: unclassified, cls: 'ah-badge-red', tip: '未分类失误' } : null,
      actions: [{ t: '录入', to: '/workstation?tab=daily&sub=log' }, { t: '管理 →', to: '/workstation?tab=daily&sub=log' }],
    },
    {
      icon: 'trend', name: '汇总报告', stat: '系统自动生成 · 教练总结可编辑',
      badge: null, actions: [{ t: '查看 →', to: '/training-report' }],
    },
    {
      icon: 'mistakes', name: '犯错字段库', stat: dictCount != null ? `${dictCount} 条字典 · ${catCount} 大类` : '统计加载中…',
      badge: catCount ? { n: `${catCount} 类型`, cls: 'ah-badge-blue', tip: '分类数' } : null,
      actions: [{ t: '编辑 / 导入导出 →', open: 'dict' }],
    },
    {
      icon: 'trophy', name: '赛事编辑', stat: tourTotal != null ? `${tourTotal} 项赛事 · 进行中 ${tourOpen}` : '统计加载中…',
      badge: tourOpen > 0 ? { n: tourOpen, cls: 'ah-badge-amber', tip: '未结束赛事' } : null,
      actions: [{ t: '管理 →', to: '/matches?tab=official' }],
    },
    {
      icon: 'versus', name: '队员档案', stat: rosterN != null ? `现役 ${rosterN} 人` : '统计加载中…',
      badge: null, actions: [{ t: '管理 →', to: '/members' }],
    },
    {
      icon: 'mapstats', name: '地图池配置',
      stat: mapPool && Array.isArray(mapPool.active) && mapPool.active.length
        ? `服役 ${mapPool.active.length} 图${mapPool.firstBan ? ` · 首Ban ${mapPool.firstBan}` : ''}`
        : `服役 ${visMaps || '—'} 图（默认配置）`,
      badge: null, actions: [{ t: '配置服役 / 首Ban →', open: 'mappool' }],
    },
    {
      icon: 'hub', name: '用户与权限', stat: userN != null ? `${userN} 个账号` : '需管理员权限',
      badge: pendingN > 0 ? { n: pendingN, cls: 'ah-badge-amber', tip: '待审核用户' } : null,
      actions: [{ t: '管理 →', open: 'users' }],
    },
  ];

  // ── 待处理事项（真实拼装，空则暂无）──
  const todos = [];
  if (unclassified > 0) todos.push({ tag: '失误', cls: 'ah-tag-red', text: `${unclassified} 条失误未分类，点击展开直接归类`, expand: true });
  if (pendingN > 0) todos.push({ tag: '审核', cls: 'ah-tag-amber', text: `${pendingN} 个注册账号待审核`, to: '/users' });
  if (tourOpen > 0) todos.push({ tag: '赛事', cls: 'ah-tag-blue', text: `${tourOpen} 项赛事进行中，注意更新赛程与结果`, to: '/matches?tab=official' });

  const unclassifiedList = (rev?.incidents || []).filter((x) => x.type === '未分类');
  const dictByCat = {};
  for (const t of (errTypes || [])) { (dictByCat[t.category || '未分类'] = dictByCat[t.category || '未分类'] || []).push(t); }

  const openModal = (m) => {
    setModal(m);
    if (m === 'mappool') {
      const cur = mapPool && Array.isArray(mapPool.active) && mapPool.active.length ? mapPool : { active: DEFAULT_ACTIVE, firstBan: null };
      setPoolDraft({ active: [...cur.active], firstBan: cur.firstBan || null });
    }
    if (m === 'dict') { setDictDraft({}); setDictNew(null); }
  };

  // ── 字段库：行草稿 / 保存 / 删除 / 新增 ──
  const dRow = (t) => dictDraft[t.id] || { category: t.category || '', name: t.name || '', keywords: t.keywords || '', severity: t.severity || 'mid', is_active: t.is_active ? 1 : 0, sort_order: t.sort_order || 0, description: t.description || '' };
  const setDRow = (id, base, patch) => setDictDraft((d) => ({ ...d, [id]: { ...(d[id] || base), ...patch } }));
  const dictChanged = (t) => {
    const d = dRow(t);
    return d.category !== (t.category || '') || d.name !== (t.name || '') || d.keywords !== (t.keywords || '') ||
      d.severity !== (t.severity || 'mid') || Number(d.is_active) !== (t.is_active ? 1 : 0) || Number(d.sort_order) !== (t.sort_order || 0);
  };
  const saveDictRow = (t) => {
    const d = dRow(t);
    if (!d.name.trim()) { alert('名称必填'); return; }
    setDictBusy(true);
    api.put(`/training-plans/error-types/${t.id}`, { ...d, is_active: Number(d.is_active), sort_order: Number(d.sort_order) || 0 })
      .then(() => { setDictDraft((dd) => { const c = { ...dd }; delete c[t.id]; return c; }); refetchDict(); })
      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setDictBusy(false));
  };
  const delDictRow = (t) => {
    if (!window.confirm(`确认删除字典「${t.name}」？历史失误记录不受影响，但该类型将不可再选。`)) return;
    setDictBusy(true);
    api.delete(`/training-plans/error-types/${t.id}`)
      .then(refetchDict).catch((e) => alert('删除失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setDictBusy(false));
  };
  const addDictRow = () => {
    if (!dictNew || !dictNew.name.trim()) { alert('名称必填'); return; }
    setDictBusy(true);
    api.post('/training-plans/error-types', { ...dictNew, sort_order: Number(dictNew.sort_order) || 0 })
      .then(() => { setDictNew(null); refetchDict(); })
      .catch((e) => alert('新增失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setDictBusy(false));
  };

  // ── 字段库 CSV 导出/导入（Excel 直开；导入 id存在→更新，id空且有名称→新增）──
  const DICT_HEADS = ['id', '分类', '名称', '关键词', '说明', '严重度', '启用', '排序'];
  const csvEsc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const parseCsv = (text) => {
    const t = text.replace(/^\ufeff/, '');
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  };
  const exportDict = () => {
    const list = errTypes || [];
    if (!list.length) { alert('暂无字典数据'); return; }
    const lines = [DICT_HEADS.join(',')];
    for (const t of list) lines.push([t.id, t.category || '', t.name || '', t.keywords || '', t.description || '', t.severity || 'mid', t.is_active ? 1 : 0, t.sort_order || 0].map(csvEsc).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `犯错字段库_${today()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const importDict = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseCsv(String(reader.result || ''));
      if (rows.length < 2) { alert('文件为空或缺少表头'); return; }
      const head = rows[0].map((h) => String(h).trim());
      const col = (n) => head.indexOf(n);
      if (col('名称') < 0) { alert('缺少"名称"列（请用本弹窗导出的文件修改后导入）'); return; }
      const byId = {}; (errTypes || []).forEach((t) => { byId[t.id] = t; });
      const SEVS = ['low', 'mid', 'high'];
      const updates = []; const creates = []; const errs = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const g = (n) => (col(n) >= 0 ? String(r[col(n)] ?? '').trim() : '');
        const name = g('名称');
        if (!name) continue;
        const sevRaw = g('严重度') || 'mid';
        const severity = SEVS.includes(sevRaw) ? sevRaw : ({ 低: 'low', 中: 'mid', 高: 'high' }[sevRaw] || 'mid');
        const isActive = ['0', '否', 'false'].includes(g('启用')) ? 0 : 1;
        const payload = { category: g('分类'), name, keywords: g('关键词'), description: g('说明'), severity, is_active: isActive, sort_order: Number(g('排序')) || 0 };
        const id = Number(g('id'));
        if (id) {
          const t = byId[id];
          if (!t) { errs.push(`第${i + 1}行 id=${id} 不存在，跳过`); continue; }
          const changed = payload.category !== (t.category || '') || payload.name !== (t.name || '') || payload.keywords !== (t.keywords || '') || payload.description !== (t.description || '') || payload.severity !== (t.severity || 'mid') || payload.is_active !== (t.is_active ? 1 : 0) || payload.sort_order !== (t.sort_order || 0);
          if (changed) updates.push({ id, payload });
        } else {
          creates.push(payload);
        }
      }
      if (!updates.length && !creates.length) { alert(`没有检测到改动。${errs.length ? '\n' + errs.join('\n') : ''}`); return; }
      if (!window.confirm(`将更新 ${updates.length} 条、新增 ${creates.length} 条${errs.length ? `（跳过 ${errs.length} 行）` : ''}，确认导入？`)) return;
      setImporting({ done: 0, total: updates.length + creates.length });
      let ok = 0; const fails = [];
      for (const u of updates) {
        try { await api.put(`/training-plans/error-types/${u.id}`, u.payload); ok++; }
        catch (err) { fails.push(`id=${u.id}: ${err.response?.data?.error || err.message}`); }
        setImporting({ done: ok + fails.length, total: updates.length + creates.length });
      }
      for (const c of creates) {
        try { await api.post('/training-plans/error-types', c); ok++; }
        catch (err) { fails.push(`新增"${c.name}": ${err.response?.data?.error || err.message}`); }
        setImporting({ done: ok + fails.length, total: updates.length + creates.length });
      }
      setImporting(null);
      alert(`导入完成：成功 ${ok} 条${fails.length ? `，失败 ${fails.length} 条\n${fails.slice(0, 5).join('\n')}` : ''}`);
      refetchDict();
    };
    reader.readAsText(file, 'utf-8');
  };

  // ── 地图池保存 ──
  const savePool = () => {
    if (!poolDraft.active.length) { alert('至少勾选一张服役地图'); return; }
    const fb = poolDraft.active.includes(poolDraft.firstBan) ? poolDraft.firstBan : null;
    setDictBusy(true);
    api.put('/admin/map-pool', { active: poolDraft.active, firstBan: fb })
      .then(() => { setMapPool({ active: poolDraft.active, firstBan: fb }); setModal(null); })
      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
      .finally(() => setDictBusy(false));
  };

  const fmtTime = (s) => String(s || '').replace('T', ' ').slice(5, 16);
  const logText = (l) => l.action || l.detail || l.description || l.content || l.op || JSON.stringify(l).slice(0, 60);

  const filtered = q.trim() ? CARDS.filter((c) => (c.name + c.stat).toLowerCase().includes(q.trim().toLowerCase())) : CARDS;

  return (
    <div className="ah-root">
      {/* ══ 页头 ══ */}
      <div className="ah-head">
        <div>
          <div className="ah-eyebrow">DATA ADMIN · 数据管理后台</div>
          <div className="ah-title">数据管理</div>
        </div>
        <input className="ah-search" placeholder="搜索管理域…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* ══ 三表联动导入（真实入口，不装状态灯）══ */}
      <div className="ah-import">
        <div className="ah-import-title"><span className="ah-glowdot" />三表联动导入 <span className="ah-dim">简报 + 训练日志 + 比赛 JSON，三者齐全才纳入统计</span></div>
        <div className="ah-import-slots">
          <div className="ah-slot ah-click" onClick={() => navigate('/workstation?tab=daily&sub=briefing')}>
            <div className="ah-slot-name">① 每日简报</div><div className="ah-slot-sub">工作站 · 每日简报录入</div>
          </div>
          <div className="ah-slot ah-click" onClick={() => navigate('/workstation?tab=daily&sub=log')}>
            <div className="ah-slot-name">② 训练日志</div><div className="ah-slot-sub">工作站 · 回合与失误记录</div>
          </div>
          <div className="ah-slot ah-click" onClick={() => navigate('/admin-legacy')}>
            <div className="ah-slot-name">③ 比赛 JSON</div><div className="ah-slot-sub">批量导入 / 手动录入</div>
          </div>
          <div className="ah-import-cta ah-click" onClick={() => navigate('/admin-legacy')}>进入导入工作台 →</div>
        </div>
      </div>

      {/* ══ 管理域卡片 4×2 ══ */}
      <div className="ah-grid">
        {filtered.map((c) => (
          <div key={c.name} className="ah-card ah-click"
            onClick={() => { const a = c.actions[0]; if (a) (a.open ? openModal(a.open) : navigate(a.to)); }}>
            <div className="ah-card-top">
              <span className="ah-icon"><img src={`/reshape/home/icons/icon-${c.icon}.png`} alt="" /></span>
              {c.badge && <span className={'ah-badge ' + c.badge.cls} title={c.badge.tip}>{c.badge.n}</span>}
            </div>
            <div className="ah-card-name">{c.name}</div>
            <div className="ah-card-stat">{c.stat}</div>
            {c.note && <div className="ah-card-note">{c.note}</div>}
            <div className="ah-card-actions">
              {c.actions.map((a) => (
                <span key={a.t} className="ah-link" onClick={(e) => { e.stopPropagation(); (a.open ? openModal(a.open) : navigate(a.to)); }}>{a.t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ══ 待处理事项 + 操作日志 ══ */}
      <div className="ah-bottom">
        <div className="ah-panel">
          <div className="ah-panel-head">
            <div className="ah-panel-title"><span className="ah-tick" />待处理事项</div>
          </div>
          {todos.length === 0 ? <div className="ah-empty">暂无待处理事项</div> : (
            <div className="ah-todos">
              {todos.map((t, i) => (
                <div key={i}>
                  <div className="ah-todo ah-click" onClick={() => (t.expand ? setTodoOpen((o) => !o) : navigate(t.to))}>
                    <span className={'ah-tag ' + t.cls}>{t.tag}</span>
                    <span className="ah-todo-text">{t.text}</span>
                    <span className="ah-todo-go">{t.expand ? (todoOpen ? '收起 ▾' : '展开归类 ›') : '处理 →'}</span>
                  </div>
                  {t.expand && todoOpen && (
                    <div className="ah-inc-panel">
                      {unclassifiedList.length === 0 ? <div className="ah-empty">全部归类完成 🎉</div> : (
                        <div className="ah-inc-scroll">
                          {unclassifiedList.map((x) => {
                            const dr = rowDraft[x.id] || { typeVal: 'cat:未分类', who: x.who || '全队' };
                            return (
                              <div key={x.id} className="ah-inc-row">
                                <span className="ah-inc-meta">{(x.date || '').slice(5)} {x.map} {x.round}</span>
                                <span className="ah-inc-detail" title={x.detail}>{x.detail || '—'}</span>
                                <select className="ah-sel" value={dr.typeVal}
                                  onChange={(e) => setRowDraft((d) => ({ ...d, [x.id]: { ...dr, typeVal: e.target.value } }))}>
                                  <optgroup label="大类直改">
                                    {['道具', '沟通', '战术', '走位', '枪法', '经济'].map((c) => <option key={c} value={`cat:${c}`}>{c}</option>)}
                                    <option value="cat:未分类">未分类</option>
                                  </optgroup>
                                  {Object.entries(dictByCat).map(([cat, arr]) => (
                                    <optgroup key={cat} label={cat}>
                                      {arr.map((et) => <option key={et.id} value={`id:${et.id}`}>{et.name}</option>)}
                                    </optgroup>
                                  ))}
                                </select>
                                <select className="ah-sel" style={{ width: 88 }} value={dr.who}
                                  onChange={(e) => setRowDraft((d) => ({ ...d, [x.id]: { ...dr, who: e.target.value } }))}>
                                  {['全队', ...(roster || []).map((p) => p.nickname), ...(dr.who && dr.who !== '全队' && !(roster || []).some((p) => p.nickname === dr.who) ? [dr.who] : [])].map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span className={'ah-savebtn ' + (savingId === x.id ? 'ah-savebtn-busy' : '')}
                                  onClick={() => { if (savingId) return; setSavingId(x.id);
                                    api.put(`/training-plans/review/incident/${x.id}`, {
                                      error_type_id: dr.typeVal.startsWith('id:') ? Number(dr.typeVal.slice(3)) : null,
                                      category: dr.typeVal.startsWith('cat:') ? dr.typeVal.slice(4) : undefined,
                                      responsible: dr.who, co_responsible: x.co_responsible || [], detail: x.detail || '',
                                    }).then(refetchRev)
                                      .catch((e) => alert('保存失败：' + (e.response?.data?.error || e.message)))
                                      .finally(() => setSavingId(null)); }}>
                                  {savingId === x.id ? '保存中' : '归类'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ah-panel">
          <div className="ah-panel-head">
            <div className="ah-panel-title"><span className="ah-tick" />操作日志</div>
            <span className="ah-link" onClick={() => navigate('/admin-legacy')}>导入工作台 / 完整日志 →</span>
          </div>
          {logs === null ? <div className="ah-empty">加载中…</div>
            : logs.length === 0 ? <div className="ah-empty">暂无操作日志</div> : (
              <div className="ah-logs">
                {logs.slice(0, 6).map((l, i) => (
                  <div key={l.id || i} className="ah-log">
                    <span className="ah-log-time">{fmtTime(l.created_at)}</span>
                    <span className="ah-log-user">{l.username || '系统'}</span>
                    <span className="ah-log-text">{logText(l)}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* ══ 弹窗：用户与权限（内嵌现有用户管理页）══ */}
      {modal === 'users' && (
        <div className="ah-modal-mask" onClick={() => setModal(null)}>
          <div className="ah-modal ah-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="ah-modal-head"><span>用户与权限</span><span className="ah-modal-close" onClick={() => setModal(null)}>✕</span></div>
            <div className="ah-modal-body"><Users /></div>
          </div>
        </div>
      )}

      {/* ══ 弹窗：犯错字段库（编辑 + CSV 导入导出）══ */}
      {modal === 'dict' && (
        <div className="ah-modal-mask" onClick={() => setModal(null)}>
          <div className="ah-modal ah-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="ah-modal-head">
              <span>犯错字段库 · {dictCount ?? 0} 条 / {catCount ?? 0} 大类</span>
              <div className="ah-modal-tools">
                <span className="ah-toolbtn" onClick={exportDict}>导出 CSV</span>
                <label className="ah-toolbtn" style={{ cursor: importing ? 'wait' : 'pointer' }}>
                  {importing ? `导入中 ${importing.done}/${importing.total}` : '导入更新'}
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={importDict} disabled={!!importing} />
                </label>
                <span className="ah-toolbtn" onClick={() => setDictNew(dictNew ? null : { category: '', name: '', keywords: '', description: '', severity: 'mid', sort_order: 0 })}>{dictNew ? '取消新增' : '+ 新增类型'}</span>
                <span className="ah-modal-close" onClick={() => setModal(null)}>✕</span>
              </div>
            </div>
            <div className="ah-modal-body">
              <div className="ah-dict-headrow">
                <span style={{ width: 90 }}>分类</span><span style={{ flex: 1 }}>名称</span><span style={{ flex: 1.4 }}>关键词（归类规则）</span>
                <span style={{ width: 72 }}>严重度</span><span style={{ width: 52 }}>启用</span><span style={{ width: 52 }}>排序</span><span style={{ width: 96 }}>操作</span>
              </div>
              {dictNew && (
                <div className="ah-dict-row ah-dict-new">
                  <input className="ah-di" style={{ width: 90 }} placeholder="分类" value={dictNew.category} onChange={(e) => setDictNew({ ...dictNew, category: e.target.value })} />
                  <input className="ah-di" style={{ flex: 1 }} placeholder="名称*" value={dictNew.name} onChange={(e) => setDictNew({ ...dictNew, name: e.target.value })} />
                  <input className="ah-di" style={{ flex: 1.4 }} placeholder="逗号分隔关键词" value={dictNew.keywords} onChange={(e) => setDictNew({ ...dictNew, keywords: e.target.value })} />
                  <select className="ah-di" style={{ width: 72 }} value={dictNew.severity} onChange={(e) => setDictNew({ ...dictNew, severity: e.target.value })}><option value="low">低</option><option value="mid">中</option><option value="high">高</option></select>
                  <span style={{ width: 52 }} />
                  <input className="ah-di" style={{ width: 52 }} value={dictNew.sort_order} onChange={(e) => setDictNew({ ...dictNew, sort_order: e.target.value })} />
                  <span style={{ width: 96 }}><span className="ah-savebtn" onClick={dictBusy ? null : addDictRow}>新增</span></span>
                </div>
              )}
              <div className="ah-dict-scroll">
                {(errTypes || []).map((t) => {
                  const d = dRow(t);
                  const changed = dictChanged(t);
                  return (
                    <div key={t.id} className="ah-dict-row">
                      <input className="ah-di" style={{ width: 90 }} value={d.category} onChange={(e) => setDRow(t.id, d, { category: e.target.value })} />
                      <input className="ah-di" style={{ flex: 1 }} value={d.name} onChange={(e) => setDRow(t.id, d, { name: e.target.value })} />
                      <input className="ah-di" style={{ flex: 1.4 }} value={d.keywords} onChange={(e) => setDRow(t.id, d, { keywords: e.target.value })} />
                      <select className="ah-di" style={{ width: 72 }} value={d.severity} onChange={(e) => setDRow(t.id, d, { severity: e.target.value })}><option value="low">低</option><option value="mid">中</option><option value="high">高</option></select>
                      <select className="ah-di" style={{ width: 52 }} value={d.is_active} onChange={(e) => setDRow(t.id, d, { is_active: Number(e.target.value) })}><option value={1}>✓</option><option value={0}>✗</option></select>
                      <input className="ah-di" style={{ width: 52 }} value={d.sort_order} onChange={(e) => setDRow(t.id, d, { sort_order: e.target.value })} />
                      <span style={{ width: 96, display: 'flex', gap: 6 }}>
                        {changed && <span className="ah-savebtn" onClick={dictBusy ? null : () => saveDictRow(t)}>保存</span>}
                        <span className="ah-delbtn" onClick={dictBusy ? null : () => delDictRow(t)}>删</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="ah-dict-tip">改动后历史统计自动按新字典重算；导入规则：有 id 的行更新，id 留空且填了名称的行新增。</div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 弹窗：地图池配置（服役勾选 + 首Ban 单选）══ */}
      {modal === 'mappool' && poolDraft && (
        <div className="ah-modal-mask" onClick={() => setModal(null)}>
          <div className="ah-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ah-modal-head"><span>地图池配置</span><span className="ah-modal-close" onClick={() => setModal(null)}>✕</span></div>
            <div className="ah-modal-body">
              <div className="ah-pool-tip">勾选=服役（前台地图胜率只显示服役图）；首Ban 只能从服役图中选一张。</div>
              <div className="ah-pool-grid">
                {ALL_MAPS.map((m) => {
                  const on = poolDraft.active.includes(m);
                  const fb = poolDraft.firstBan === m;
                  return (
                    <div key={m} className={'ah-pool-card ' + (on ? 'ah-pool-on' : '')}>
                      <label className="ah-pool-top">
                        <input type="checkbox" checked={on} onChange={(e) => {
                          setPoolDraft((p) => ({
                            active: e.target.checked ? [...p.active, m] : p.active.filter((x) => x !== m),
                            firstBan: !e.target.checked && p.firstBan === m ? null : p.firstBan,
                          }));
                        }} />
                        {mapIcon(m) ? <img src={mapIcon(m)} alt="" /> : <span className="ah-pool-noimg">{m[0]}</span>}
                        <span className="ah-pool-name">{m}</span>
                      </label>
                      <label className={'ah-pool-fb ' + (fb ? 'ah-pool-fb-on' : '') + (on ? '' : ' ah-pool-fb-dis')}>
                        <input type="radio" name="firstban" disabled={!on} checked={fb}
                          onChange={() => setPoolDraft((p) => ({ ...p, firstBan: m }))} />
                        首Ban
                      </label>
                    </div>
                  );
                })}
              </div>
              <div className="ah-pool-foot">
                <span className="ah-dim">服役 {poolDraft.active.length} 图 · 首Ban {poolDraft.firstBan || '未选'}</span>
                <span className="ah-savebtn" style={{ padding: '8px 22px' }} onClick={dictBusy ? null : savePool}>{dictBusy ? '保存中…' : '保存配置'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
