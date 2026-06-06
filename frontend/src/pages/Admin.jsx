import { useState, useEffect, useCallback } from 'react';
import api from '../api';

/* ── 常量 ── */
const ROLE_MAP = { admin: '管理员', player: '选手', coach: '教练', team_lead: '领队', analyst: '分析师', manager: '经理', ceo: 'CEO', pending: '待审核' };
const ROLE_COLORS = {
  admin: 'bg-ur-purple/20 text-ur-purple border-ur-purple/30',
  player: 'bg-ur-cyan/15 text-ur-cyan border-ur-cyan/30',
  coach: 'bg-ur-amber/15 text-ur-amber border-ur-amber/30',
  team_lead: 'bg-ur-indigo/15 text-ur-indigo border-ur-indigo/30',
  analyst: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  manager: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  ceo: 'bg-ur-rose/15 text-ur-rose border-ur-rose/30',
  pending: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};
const DIVISION_MAP = { cs2: 'CS2', val: 'Valorant', all: '全部' };
const EMPTY_FORM = { username: '', password: '', steam_id: '', role: 'player', division: 'cs2' };

/* ================================================================
   用户表单弹窗（创建 / 编辑复用）
   ================================================================ */
function UserFormModal({ mode, init, onClose, onSave, error }) {
  const [f, setF] = useState(
    mode === 'edit'
      ? { username: init.username, steam_id: init.steam_id, role: init.role, division: init.division || 'cs2', password: '' }
      : { ...EMPTY_FORM }
  );
  const isCreate = mode === 'create';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!f.username || !f.steam_id || !f.role)
      return;
    if (isCreate && !f.password)
      return;
    if (!/^\d{17}$/.test(f.steam_id.trim()))
      return;
    onSave({
      username: f.username.trim(),
      steam_id: f.steam_id.trim(),
      role: f.role,
      division: f.division,
      password: f.password || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="data-card w-full max-w-md mx-4 space-y-4 animate-fade-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">
            {isCreate ? '创建用户' : '编辑用户'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {error && <div className="p-2.5 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-xs text-ur-rose">{error}</div>}

        <div>
          <label className="block text-xs text-gray-500 mb-1">用户名 <span className="text-ur-rose">*</span></label>
          <input value={f.username} onChange={e => setF({ ...f, username: e.target.value })}
            placeholder="登录用户名" maxLength={32}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {isCreate ? '密码' : '新密码'}
            {isCreate && <span className="text-ur-rose"> *</span>}
            {!isCreate && <span className="text-gray-600 ml-1">(留空不修改)</span>}
          </label>
          <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })}
            placeholder={isCreate ? '设置登录密码' : '留空则保持原密码'} minLength={6}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Steam64 ID <span className="text-ur-rose">*</span></label>
          <input value={f.steam_id} onChange={e => setF({ ...f, steam_id: e.target.value })}
            placeholder="7656119XXXXXXXXXXXX（17位数字）" maxLength={17}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600 font-mono tracking-wide" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">职位 <span className="text-ur-rose">*</span></label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}
              className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                         focus:border-ur-cyan focus:outline-none cursor-pointer">
              <option value="admin">管理员</option>
              <option value="player">选手</option>
              <option value="coach">教练</option>
              <option value="team_lead">领队</option>
              <option value="analyst">分析师</option>
              <option value="manager">经理</option>
              <option value="ceo">CEO</option>
              <option value="pending">待审核</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">分部</label>
            <select value={f.division} onChange={e => setF({ ...f, division: e.target.value })}
              className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                         focus:border-ur-cyan focus:outline-none cursor-pointer">
              <option value="cs2">CS2</option>
              <option value="val">Valorant</option>
              <option value="all">全部</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 text-sm border border-ur-border rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
            取消
          </button>
          <button type="submit"
            className="flex-1 py-2.5 text-sm font-display bg-ur-cyan text-ur-bg rounded-lg hover:bg-ur-cyan/80 transition-all">
            {isCreate ? '创建' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ================================================================
   赛程表单（创建 / 编辑复用）
   ================================================================ */
function ScheduleForm({ init, onSave, onClose }) {
  const isEdit = !!init.editId;
  const [f, setF] = useState(init.editId ? { ...init } : { match_date: '', match_time: '', opponent: '', event_name: '', match_type: 'official', bo_format: 'BO1', notes: '', division: 'cs2', location_type: 'online', source_link: '', stage: '', region: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!f.match_date || !f.opponent) return;
    onSave(f);
  };

  const field = (label, key, opts = {}) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {opts.options ? (
        <select value={f[key] || ''} onChange={e => setF({ ...f, [key]: e.target.value })}
          className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan focus:outline-none cursor-pointer">
          {opts.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={opts.type || 'text'} value={f[key] || ''} onChange={e => setF({ ...f, [key]: e.target.value })}
          placeholder={opts.placeholder || ''} className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan focus:outline-none placeholder:text-gray-600" />
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {field('日期 *', 'match_date', { type: 'date' })}
        {field('时间', 'match_time', { type: 'time' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('对手 *', 'opponent', { placeholder: '对手名称' })}
        {field('赛事名称', 'event_name', { placeholder: '如 IEM Chengdu 2026' })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {field('赛制', 'bo_format', { options: [{ value: 'BO1', label: 'BO1' }, { value: 'BO3', label: 'BO3' }, { value: 'BO5', label: 'BO5' }] })}
        {field('类型', 'match_type', { options: [{ value: 'official', label: '正式赛' }, { value: 'scrim', label: '训练赛' }] })}
        {field('方式', 'location_type', { options: [{ value: 'online', label: '线上' }, { value: 'offline', label: '线下' }, { value: 'hybrid', label: '混合' }] })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('阶段', 'stage', { placeholder: '如 Qualifier / 海选' })}
        {field('区域', 'region', { placeholder: '如 Asia / China' })}
      </div>
      {field('来源链接', 'source_link', { placeholder: 'https://liquipedia.net/...' })}
      {field('备注', 'notes', { placeholder: '额外说明' })}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2 text-xs border border-ur-border rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors">取消</button>
        <button type="submit" className="flex-1 py-2 text-xs font-display bg-ur-amber/80 text-ur-bg rounded-lg hover:bg-ur-amber transition-all">{isEdit ? '保存' : '添加'}</button>
      </div>
    </form>
  );
}

/* ================================================================
   主组件
   ================================================================ */
export default function Admin() {
  /* ── JSON Import State ── */
  const [jsonFiles, setJsonFiles] = useState([]);
  const [opponent, setOpponent] = useState('');
  const [importing, setImporting] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [importError, setImportError] = useState(null);

  /* ── User Management State ── */
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  /* ── Modal State ── */
  const [modal, setModal] = useState(null);        // { type: 'create'|'edit', user? }
  const [modalError, setModalError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // user id to delete

  /* ── Logs State ── */
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  /* ── Schedule State ── */
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  const [scheduleDelete, setScheduleDelete] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkResult, setLinkResult] = useState(null);

  const EMPTY_SCHEDULE = { match_date: '', match_time: '', opponent: '', event_name: '', match_type: 'official', bo_format: 'BO1', notes: '', division: 'cs2', location_type: 'online', source_link: '', stage: '', region: '' };

  /* ── 数据加载 ── */
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const [uRes, pRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/pending-users'),
      ]);
      setUsers(uRes.data);
      setPendingUsers(pRes.data);
    } catch (e) {
      setUsersError('加载用户列表失败');
    }
    setUsersLoading(false);
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await api.get('/admin/logs');
      setLogs(data);
    } catch { /* ignore */ }
    setLogsLoading(false);
  }, []);

  useEffect(() => { loadUsers(); loadLogs(); }, [loadUsers, loadLogs]);

  /* ── 赛程管理 ── */
  const loadUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    try { const { data } = await api.get('/admin/upcoming'); setUpcoming(data); } catch {}
    setUpcomingLoading(false);
  }, []);
  useEffect(() => { loadUpcoming(); }, [loadUpcoming]);

  const handleScheduleSave = async (form) => {
    setScheduleError(null);
    try {
      if (scheduleModal?.editId) {
        await api.put(`/admin/upcoming/${scheduleModal.editId}`, form);
      } else {
        await api.post('/admin/upcoming', form);
      }
      setScheduleModal(null);
      loadUpcoming();
      loadLogs();
    } catch (e) {
      setScheduleError(e.response?.data?.error || '保存失败');
    }
  };

  const handleScheduleDelete = async (id) => {
    try { await api.delete(`/admin/upcoming/${id}`); setScheduleDelete(null); loadUpcoming(); loadLogs(); } catch {}
  };

  const handleLinkLookup = async () => {
    if (!linkUrl.trim()) return;
    setLinkLoading(true); setLinkResult(null);
    try {
      const { data } = await api.post('/admin/lookup-tournament', { url: linkUrl.trim() });
      setLinkResult(data);
    } catch (e) {
      setLinkResult({ error: e.response?.data?.error || '查询失败' });
    }
    setLinkLoading(false);
  };

  /* ── JSON 导入逻辑 ── */
  const extractOpponentFromFilename = (filename) => {
    const m = filename.match(/^\d{4}[_-](.+?)_[Mm]\d+/);
    return m ? m[1] : '';
  };

  const removeFile = (idx) => {
    const newFiles = jsonFiles.filter((_, i) => i !== idx);
    setJsonFiles(newFiles);
    if (newFiles.length > 0 && !opponent) {
      const inferred = extractOpponentFromFilename(newFiles[0].name);
      if (inferred) setOpponent(inferred);
    }
    setImportError(null);
    setBatchResults(null);
  };

  const handleJsonImport = async () => {
    if (jsonFiles.length === 0) { setImportError('请选择至少一个 JSON 文件'); return; }
    setImporting(true);
    setImportError(null);
    setBatchResults(null);
    try {
      const form = new FormData();
      jsonFiles.forEach(f => form.append('files', f));
      form.append('opponent', opponent.trim());
      const { data } = await api.post('/training/import-match-json-batch', form);
      setBatchResults(data.results);
      if (data.results.every(r => r.success)) {
        setJsonFiles([]);
        setOpponent('');
        const input = document.getElementById('json-file-input');
        if (input) input.value = '';
      }
    } catch (e) {
      setImportError(e.response?.data?.error || '批量导入失败');
    }
    setImporting(false);
  };

  /* ── 用户操作 ── */
  const handleCreate = async (form) => {
    setModalError(null);
    try {
      await api.post('/admin/create-user', form);
      setModal(null);
      loadUsers();
      loadLogs();
    } catch (e) {
      setModalError(e.response?.data?.error || '创建失败');
    }
  };

  const handleUpdate = async (form) => {
    if (!modal?.user) return;
    setModalError(null);
    try {
      await api.put(`/admin/user/${modal.user.id}`, form);
      setModal(null);
      loadUsers();
      loadLogs();
    } catch (e) {
      setModalError(e.response?.data?.error || '更新失败');
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/admin/approve-user/${id}`);
      loadUsers();
      loadLogs();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/admin/user/${id}`);
      setDeleteConfirm(null);
      loadUsers();
      loadLogs();
    } catch { /* ignore */ }
  };

  /* ── 渲染 ── */
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <h2 className="font-display text-2xl font-bold text-white mb-1">数据管理</h2>
      <p className="text-gray-500 text-sm mb-6">数据导入 · 用户管理 · 系统配置</p>

      {/* ════════════════════════════════════════════════════════════
          区块 1：训练赛 JSON 导入
         ════════════════════════════════════════════════════════════ */}
      <div className="data-card mb-5">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-ur-cyan" />
          训练赛 JSON 导入
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">对手名称 <span className="text-gray-600 text-xs">(可选，自动从文件名识别)</span></label>
            <input type="text" value={opponent} onChange={e => setOpponent(e.target.value)}
              placeholder="自动从文件名识别，如 0508_Mongolz.A_M1.json → Mongolz.A"
              className="w-full bg-ur-bg border border-ur-border text-white rounded-lg px-4 py-2.5 text-sm
                         focus:border-ur-cyan focus:outline-none placeholder:text-gray-600" />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1.5">JSON 数据文件 <span className="text-ur-rose">*</span></label>
          <input id="json-file-input" type="file" accept=".json" multiple
            onChange={e => {
              const selected = Array.from(e.target.files || []);
              setJsonFiles(prev => [...prev, ...selected]);
              if (selected.length > 0 && !opponent) {
                const inferred = extractOpponentFromFilename(selected[0].name);
                if (inferred && !opponent) setOpponent(inferred);
              }
              setImportError(null); setBatchResults(null);
            }}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg
                       file:border-0 file:text-sm file:font-display file:bg-ur-indigo/20 file:text-ur-cyan
                       hover:file:bg-ur-indigo/30 file:cursor-pointer" />
        </div>
        {jsonFiles.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">已选 {jsonFiles.length} 个文件</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {jsonFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-ur-bg rounded px-3 py-1.5 text-sm group">
                  <span className="text-gray-300 truncate mr-2">{f.name}</span>
                  <button onClick={() => removeFile(i)} disabled={importing}
                    className="text-gray-600 hover:text-ur-rose transition-colors shrink-0 disabled:opacity-30" title="移除">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={handleJsonImport} disabled={importing || jsonFiles.length === 0}
            className="px-6 py-2.5 text-sm font-display bg-ur-cyan text-ur-bg rounded-lg
                       hover:bg-ur-cyan/80 disabled:opacity-50 transition-all">
            {importing ? `导入中 (${jsonFiles.length} 文件)...` : `导入到数据库 (${jsonFiles.length > 0 ? jsonFiles.length + ' 文件' : ''})`}
          </button>
          <span className="text-xs text-gray-600">CS2 比赛 JSON → matches + player_stats</span>
        </div>
        {batchResults && (
          <div className="mt-4 space-y-2">
            <div className="p-3 bg-ur-indigo/10 border border-ur-indigo/30 rounded-lg text-sm flex items-center gap-3">
              <span className="font-display text-ur-cyan">
                批量导入完成：{batchResults.filter(r => r.success).length}/{batchResults.length} 成功
              </span>
            </div>
            {batchResults.map((r, i) => (
              <div key={i} className={`p-3 rounded-lg text-sm border ${r.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-ur-rose/10 border-ur-rose/30'}`}>
                <p className={`font-display mb-0.5 ${r.success ? 'text-emerald-400' : 'text-ur-rose'}`}>
                  {r.success ? '✓' : '✗'} {r.filename}
                </p>
                {r.success ? (
                  <p className="text-gray-400">{r.map} · {r.score} · {r.opponent && `${r.opponent} · `}{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '平'} · {r.players} 名选手数据
                    {r.players === 0 && r.totalEntries > 0 && <span className="text-ur-amber ml-1">({r.totalEntries} 条记录未匹配)</span>}
                  </p>
                ) : <p className="text-ur-rose/70">{r.error}</p>}
                {r.success && r.players === 0 && r.skippedReasons?.length > 0 && (
                  <div className="mt-1.5 bg-ur-amber/10 border border-ur-amber/20 rounded p-2 text-xs">
                    <p className="text-ur-amber/80 font-display mb-1">诊断信息：</p>
                    {r.skippedReasons.map((reason, j) => <p key={j} className="text-gray-500 ml-2 leading-relaxed">{reason}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {importError && (
          <div className="mt-4 p-3 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-sm text-ur-rose">{importError}</div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          区块 2：用户与成员管理
         ════════════════════════════════════════════════════════════ */}
      <div className="data-card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-ur-purple" />
            用户与成员管理
          </h3>
          <button onClick={() => { setModalError(null); setModal({ type: 'create' }); }}
            className="px-4 py-1.5 text-xs font-display bg-ur-purple/20 text-ur-purple border border-ur-purple/30 rounded-lg
                       hover:bg-ur-purple/30 transition-all flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            创建用户
          </button>
        </div>

        {/* 待审核提示 */}
        {pendingUsers.length > 0 && (
          <div className="mb-4 p-3 bg-ur-amber/10 border border-ur-amber/30 rounded-lg flex items-center justify-between">
            <p className="text-sm text-ur-amber">
              <span className="font-display">{pendingUsers.length}</span> 个账号待审核
            </p>
            <button onClick={() => {
              const section = document.getElementById('pending-section');
              if (section) section.scrollIntoView({ behavior: 'smooth' });
            }} className="text-xs text-ur-amber/70 hover:text-ur-amber transition-colors">
              查看 →
            </button>
          </div>
        )}

        {usersError && (
          <div className="mb-4 p-3 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-sm text-ur-rose">{usersError}</div>
        )}

        {/* 用户表格 */}
        {usersLoading ? (
          <div className="text-center py-8 text-gray-500 text-sm">加载中...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">暂无用户</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">用户名</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium hidden md:table-cell">Steam64 ID</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">职位</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium hidden sm:table-cell">分部</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium hidden lg:table-cell">创建时间</th>
                  <th className="text-right py-2.5 px-3 text-xs text-gray-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3">
                      <span className="text-white font-display">{u.username}</span>
                      {u.role === 'pending' && (
                        <span className="ml-2 tag tag-draw text-[10px]">待审</span>
                      )}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <span className="text-gray-400 font-mono text-xs tracking-wide">{u.steam_id}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`tag ${ROLE_COLORS[u.role] || ROLE_COLORS.pending}`}>
                        {ROLE_MAP[u.role] || u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell">
                      <span className="chip text-[11px]">{DIVISION_MAP[u.division] || u.division}</span>
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell">
                      <span className="text-gray-500 text-xs">{u.created_at?.split(' ')[0] || '-'}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.role === 'pending' && (
                          <button onClick={() => handleApprove(u.id)}
                            className="px-2.5 py-1 text-[11px] font-display rounded-md bg-emerald-500/15 text-emerald-400
                                       border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors"
                            title="审核通过">
                            通过
                          </button>
                        )}
                        <button onClick={() => { setModalError(null); setModal({ type: 'edit', user: u }); }}
                          className="px-2.5 py-1 text-[11px] font-display rounded-md bg-ur-cyan/10 text-ur-cyan
                                     border border-ur-cyan/20 hover:bg-ur-cyan/20 transition-colors"
                          title="编辑">
                          编辑
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => setDeleteConfirm(u.id)}
                            className="px-2.5 py-1 text-[11px] font-display rounded-md bg-ur-rose/10 text-ur-rose
                                       border border-ur-rose/20 hover:bg-ur-rose/20 transition-colors"
                            title="删除">
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 待审核列表 */}
        {pendingUsers.length > 0 && (
          <div id="pending-section" className="mt-6 pt-4 border-t border-white/[0.06]">
            <h4 className="text-sm font-display text-ur-amber mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ur-amber" />
              待审核账号 ({pendingUsers.length})
            </h4>
            <div className="space-y-2">
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-ur-bg rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-4">
                    <span className="text-white font-display text-sm">{u.username}</span>
                    <span className="text-gray-500 font-mono text-xs">{u.steam_id}</span>
                    <span className="text-gray-600 text-xs">{u.created_at}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleApprove(u.id)}
                      className="px-3 py-1 text-xs font-display rounded-md bg-emerald-500/15 text-emerald-400
                                 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors">
                      审核通过
                    </button>
                    <button onClick={() => setDeleteConfirm(u.id)}
                      className="px-3 py-1 text-xs font-display rounded-md bg-ur-rose/10 text-ur-rose
                                 border border-ur-rose/20 hover:bg-ur-rose/20 transition-colors">
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          区块 3：赛程管理
         ════════════════════════════════════════════════════════════ */}
      <div className="data-card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-4 rounded bg-ur-amber" />赛程管理
          </h3>
          <button onClick={() => { setScheduleError(null); setScheduleModal({}); }}
            className="px-4 py-1.5 text-xs font-display bg-ur-amber/20 text-ur-amber border border-ur-amber/30 rounded-lg hover:bg-ur-amber/30 transition-all flex items-center gap-1.5">
            + 添加赛事
          </button>
        </div>

        {/* Link 查询区 */}
        <div className="mb-4 p-3 bg-ur-bg rounded-lg border border-ur-border">
          <label className="text-xs text-gray-500 mb-1.5 block">赛事链接查询（粘贴链接后自动抓取赛事名称）</label>
          <div className="flex gap-2">
            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://liquipedia.net/counterstrike/..." className="flex-1 bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white text-xs focus:border-ur-cyan focus:outline-none placeholder:text-gray-600" />
            <button onClick={handleLinkLookup} disabled={linkLoading || !linkUrl.trim()}
              className="px-4 py-2 text-xs font-display bg-ur-cyan/20 text-ur-cyan border border-ur-cyan/30 rounded-lg hover:bg-ur-cyan/30 disabled:opacity-40 transition-all">
              {linkLoading ? '查询中...' : '查询'}
            </button>
          </div>
          {linkResult && (
            <div className="mt-2 p-2 bg-ur-indigo/10 border border-ur-indigo/20 rounded text-xs">
              {linkResult.error ? (
                <span className="text-ur-rose">{linkResult.error}</span>
              ) : (
                <div className="space-y-0.5">
                  <p><span className="text-gray-500">页面标题:</span> <span className="text-gray-200">{linkResult.pageTitle}</span></p>
                  {linkResult.ogTitle && <p><span className="text-gray-500">OG标题:</span> <span className="text-gray-200">{linkResult.ogTitle}</span></p>}
                  {linkResult.description && <p><span className="text-gray-500">描述:</span> <span className="text-gray-400">{linkResult.description.slice(0,200)}</span></p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 赛程列表 */}
        {upcomingLoading ? (
          <div className="text-center py-6 text-gray-500 text-sm">加载中...</div>
        ) : upcoming.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">暂无即将赛事</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map(m => (
              <div key={m.id} className="bg-ur-bg rounded-lg px-4 py-3 border border-ur-border hover:border-gray-600 transition-colors group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-display text-sm">{m.event_name || '未命名赛事'}</span>
                      <span className={`tag text-[10px] ${m.match_type === 'scrim' ? 'tag-draw' : 'bg-ur-amber/15 text-ur-amber border-ur-amber/30'}`}>
                        {m.match_type === 'scrim' ? '训练赛' : '正式赛'}
                      </span>
                      <span className="tag bg-ur-cyan/10 text-ur-cyan border-ur-cyan/20 text-[10px]">{m.bo_format || '-'}</span>
                      {m.location_type && m.location_type !== 'online' && (
                        <span className="tag bg-ur-purple/15 text-ur-purple border-ur-purple/25 text-[10px]">{m.location_type === 'offline' ? '线下' : '混合'}</span>
                      )}
                      {m.stage && <span className="text-ur-amber text-[11px]">{m.stage}</span>}
                      {m.region && <span className="text-gray-500 text-[11px]">{m.region}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="font-mono">{m.match_date}</span>
                      {m.match_time && <span>{m.match_time.slice(0,5)}</span>}
                      <span className="text-white font-display">vs {m.opponent}</span>
                      {m.notes && <span className="text-gray-500 truncate ml-2">{m.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setScheduleError(null); const { created_at, ...rest } = m; setScheduleModal({ editId: m.id, ...rest }); }}
                      className="px-2 py-1 text-[11px] font-display rounded bg-ur-cyan/10 text-ur-cyan border border-ur-cyan/20 hover:bg-ur-cyan/20 transition-colors">编辑</button>
                    <button onClick={() => setScheduleDelete(m.id)}
                      className="px-2 py-1 text-[11px] font-display rounded bg-ur-rose/10 text-ur-rose border border-ur-rose/20 hover:bg-ur-rose/20 transition-colors">删除</button>
                  </div>
                </div>
                {m.source_link && (
                  <a href={m.source_link} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-ur-cyan/60 hover:text-ur-cyan mt-1.5 inline-block truncate max-w-full">{m.source_link}</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          区块 4：操作日志
         ════════════════════════════════════════════════════════════ */}
      <div className="data-card">
        <h3 className="font-display text-base font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded bg-gray-600" />
          操作日志
        </h3>
        {logsLoading ? (
          <div className="text-center py-6 text-gray-500 text-sm">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">暂无操作记录</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">时间</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">操作者</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium">操作</th>
                  <th className="text-left py-2.5 px-3 text-xs text-gray-500 font-medium hidden md:table-cell">详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l.id || i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">{l.created_at || '-'}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-gray-300 text-xs">{l.username || '系统'}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="chip text-[11px]">{l.action || '-'}</span>
                    </td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <span className="text-gray-500 text-xs">{l.details || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          弹窗
         ════════════════════════════════════════════════════════════ */}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setDeleteConfirm(null)}>
          <div className="data-card w-full max-w-sm mx-4 space-y-4 animate-fade-up" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white">确认删除</h3>
            <p className="text-gray-400 text-sm">此操作将永久删除该用户账号，无法恢复。确定继续？</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 text-sm border border-ur-border rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
                取消
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 text-sm font-display bg-ur-rose/80 text-white rounded-lg hover:bg-ur-rose transition-all">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 赛程删除确认 */}
      {scheduleDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setScheduleDelete(null)}>
          <div className="data-card w-full max-w-sm mx-4 space-y-4 animate-fade-up" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-white">删除赛事</h3>
            <p className="text-gray-400 text-sm">确认删除此赛事？此操作不可撤销。</p>
            <div className="flex gap-3">
              <button onClick={() => setScheduleDelete(null)} className="flex-1 py-2.5 text-sm border border-ur-border rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors">取消</button>
              <button onClick={() => handleScheduleDelete(scheduleDelete)} className="flex-1 py-2.5 text-sm font-display bg-ur-rose/80 text-white rounded-lg hover:bg-ur-rose transition-all">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 赛程编辑/创建弹窗 */}
      {scheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setScheduleModal(null)}>
          <div className="data-card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto space-y-3 animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">{scheduleModal.editId ? '编辑赛事' : '添加赛事'}</h3>
              <button type="button" onClick={() => setScheduleModal(null)} className="text-gray-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {scheduleError && <div className="p-2 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-xs text-ur-rose">{scheduleError}</div>}
            <ScheduleForm init={scheduleModal} onSave={handleScheduleSave} onClose={() => setScheduleModal(null)} />
          </div>
        </div>
      )}

      {/* 创建 / 编辑用户弹窗 */}
      {modal && (
        <UserFormModal
          mode={modal.type}
          init={modal.user}
          onClose={() => setModal(null)}
          onSave={modal.type === 'create' ? handleCreate : handleUpdate}
          error={modalError}
        />
      )}
    </div>
  );
}
