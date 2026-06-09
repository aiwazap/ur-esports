import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ============================================================
// 模块配置
// ============================================================
const ALL_MODULES = [
  { id: 'contact',   label: '接洽表',     icon: '🤝', desc: '接机准备清单、沟通记录' },
  { id: 'personal',  label: '个人信息表',  icon: '📋', desc: '选手基本信息、账号、外设偏好' },
  { id: 'scoring',   label: '考核评分表',  icon: '📊', desc: '五维度评分、周期统计' },
  { id: 'plan',      label: '入队方案',    icon: '📄', desc: '入队流程、时间规划' },
  { id: 'cost',      label: '成本支出表',  icon: '💰', desc: '试训成本录入与汇总' },
];

const API = '/api/trial';

// ============================================================
// 工具函数
// ============================================================
function getRole() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.role || '';
  } catch { return ''; }
}

/** 根据角色过滤可见模块 */
function filterModulesByRole(role) {
  if (role === 'CEO' || role === '经理') return ALL_MODULES;
  if (role === '教练' || role === '领队') return ALL_MODULES.filter(m => m.id !== 'cost');
  if (role === '队员') return ALL_MODULES.filter(m => m.id === 'personal');
  return ALL_MODULES; // 兜底
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-lg text-sm font-medium
    shadow-lg transition-all duration-300
    ${type === 'success' ? 'bg-emerald-500/90 text-white' :
      type === 'error' ? 'bg-red-500/90 text-white' :
      'bg-cyan-500/90 text-black'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ============================================================
// 主组件
// ============================================================
export default function TrialPlayers() {
  const role = getRole();
  const modules = filterModulesByRole(role);
  const defaultModule = modules[0]?.id || 'personal';
  const [active, setActive] = useState(defaultModule);

  // 如果当前激活的模块被权限过滤掉了，切换到第一个可见模块
  useEffect(() => {
    if (!modules.find(m => m.id === active)) {
      setActive(modules[0]?.id || 'personal');
    }
  }, [role]);

  return (
    <div className="min-h-screen" style={{ background: '#060b14', padding: '20px 28px' }}>
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🧪</span> 试训人员管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            全流程管理：接洽 → 信息登记 → 考核评分 → 入队方案 → 成本核算
            <span className="ml-3 text-[11px] text-cyan-600">
              当前角色：{role || '未登录'}
            </span>
          </p>
        </div>
      </div>

      {/* 功能标签 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {modules.map(mod => {
          const isActive = active === mod.id;
          return (
            <button key={mod.id} onClick={() => setActive(mod.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 border whitespace-nowrap
                ${isActive
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.06]'}`}>
              <span>{mod.icon}</span>
              <span>{mod.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs text-gray-500">
        <span className="text-cyan-400 font-medium">{modules.find(m => m.id === active)?.label}</span>
        ：{modules.find(m => m.id === active)?.desc}
      </div>

      {/* 内容区 */}
      {active === 'contact' && <ContactModule role={role} />}
      {active === 'personal' && <PersonalModule role={role} />}
      {active === 'scoring' && <ScoreModule role={role} />}
      {active === 'plan' && <PlanModule role={role} />}
      {active === 'cost' && <CostModule role={role} />}
    </div>
  );
}

// ============================================================
// 1. 接洽表模块
// ============================================================
function ContactModule({ role }) {
  const [players, setPlayers] = useState([]);
  const [selectedPid, setSelectedPid] = useState('');
  const [form, setForm] = useState({
    contact_date: today(), contact_person: '',
    checklist: Array(10).fill(false),
    chinese_listening: 0, chinese_speaking: 0, chinese_notes: '',
    q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q8: '',
    handler_sign: '', manager_confirm: '',
  });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPlayers(); }, []);
  useEffect(() => { if (selectedPid) loadHistory(selectedPid); }, [selectedPid]);

  const loadPlayers = async () => {
    try {
      const { data } = await axios.get(`${API}/players`);
      setPlayers(data);
    } catch {}
  };

  const loadHistory = async (pid) => {
    try {
      const { data } = await axios.get(`${API}/contacts?player_id=${pid}`);
      setHistory(data);
    } catch {}
  };

  const setCheck = (idx, val) => {
    const c = [...form.checklist];
    c[idx] = val;
    setForm(p => ({ ...p, checklist: c }));
  };

  const handleSave = async () => {
    if (!selectedPid) { toast('请先选择试训队员', 'error'); return; }
    if (!form.contact_person.trim()) { toast('请填写接洽人', 'error'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/contacts`, {
        player_id: parseInt(selectedPid),
        contact_person: form.contact_person,
        contact_date: form.contact_date,
        checklist_json: form.checklist,
        chinese_listening: form.chinese_listening,
        chinese_speaking: form.chinese_speaking,
        chinese_notes: form.chinese_notes,
        q1: form.q1, q2: form.q2, q3: form.q3, q4: form.q4,
        q5: form.q5, q6: form.q6, q7: form.q7, q8: form.q8,
        handler_sign: form.handler_sign,
        manager_confirm: form.manager_confirm,
      });
      toast('接洽记录已保存', 'success');
      if (selectedPid) loadHistory(selectedPid);
    } catch (e) {
      toast('保存失败: ' + (e.response?.data?.error || e.message), 'error');
    }
    setSaving(false);
  };

  const checklistItems = [
    '确认接机信息（航班/航站楼/时间）', '训练室工位布置（设备/网络/软件）',
    '住宿房间准备（清洁/空调/Wi-Fi）', '生活用品采购（床褥/洗漱/拖鞋等）',
    '外设携带提醒（键盘/鼠标/耳机）', '账号收集（5E/Faceit/Steam/Discord）',
    '通讯工具（SIM卡/微信/微信群）', '场地导览（训练室/宿舍/餐厅）',
    '训练日程表交付（中英双语）', '安全与规则告知（纪律/紧急联系人）',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 左侧：队员选择 + 历史 */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">选择试训队员</h3>
          <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white mb-3">
            <option value="">-- 请选择队员 --</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.ign || '无ID'})</option>)}
          </select>
          <p className="text-[11px] text-gray-500">共 {players.length} 名试训队员</p>
        </div>

        {history.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 max-h-[500px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">📋 历史接洽记录</h3>
            {history.map(h => (
              <div key={h.id} className="border-b border-white/[0.05] py-2 text-xs text-gray-400">
                <span className="text-cyan-400">{h.contact_date}</span>
                {' | '}{h.contact_person}{h.handler_sign ? ' | 已签' : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：表单 */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">🤝 接洽信息</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">接洽人</label>
              <input value={form.contact_person} onChange={e => setForm(p => ({...p, contact_person: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">日期</label>
              <input type="date" value={form.contact_date} onChange={e => setForm(p => ({...p, contact_date: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
          </div>

          {/* 清单 */}
          <h4 className="text-xs font-semibold text-cyan-300 mb-2">接机前准备清单</h4>
          <div className="space-y-1.5 mb-4">
            {checklistItems.map((item, i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.checklist[i]} onChange={e => setCheck(i, e.target.checked)}
                  className="accent-cyan-400" />
                <span className="text-xs text-gray-300">{i+1}. {item}</span>
              </label>
            ))}
          </div>

          {/* 车上观察 */}
          <h4 className="text-xs font-semibold text-cyan-300 mb-2">🚗 车上闲聊观察</h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="text-[11px] text-gray-500">中文听力 (1-5)</label>
              <input type="number" min="0" max="5" value={form.chinese_listening}
                onChange={e => setForm(p => ({...p, chinese_listening: parseInt(e.target.value) || 0}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
            <div><label className="text-[11px] text-gray-500">中文口语 (1-5)</label>
              <input type="number" min="0" max="5" value={form.chinese_speaking}
                onChange={e => setForm(p => ({...p, chinese_speaking: parseInt(e.target.value) || 0}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
          </div>
          <textarea value={form.chinese_notes} onChange={e => setForm(p => ({...p, chinese_notes: e.target.value}))}
            placeholder="观察记录（中文实际水平描述）"
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white mb-3" rows={2} />

          {/* 8个问题 */}
          {['为何来中国打职业？','为何这个年龄才寻求职业道路？','为何没有加入蒙古本土队伍？',
            '过往比赛经历？','对自己在UR的期望？','对CS2职业赛场的了解？',
            '生活方面的顾虑（饮食/作息/信仰）？','其他补充信息？'].map((q, i) => {
            const key = `q${i+1}`;
            return (
              <div key={key} className="mb-2">
                <label className="text-[11px] text-gray-500">{q}</label>
                <textarea value={form[key]} onChange={e => setForm(p => ({...p, [key]: e.target.value}))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" rows={1} />
              </div>
            );
          })}

          {/* 签字 */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div><label className="text-[11px] text-gray-500">领队签字</label>
              <input value={form.handler_sign} onChange={e => setForm(p => ({...p, handler_sign: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
            <div><label className="text-[11px] text-gray-500">经理确认</label>
              <input value={form.manager_confirm} onChange={e => setForm(p => ({...p, manager_confirm: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="mt-4 px-6 py-2.5 bg-cyan-500/20 border border-cyan-400/30
              text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/30
              transition-all disabled:opacity-50">
            {saving ? '保存中...' : '💾 保存接洽记录'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 2. 个人信息表模块
// ============================================================
function PersonalModule({ role }) {
  const [players, setPlayers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyPersonalForm());
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    try {
      const { data } = await axios.get(`${API}/players`);
      setPlayers(data);
    } catch {}
  };

  const handleSelect = async (id) => {
    setEditId(id);
    setShowNew(false);
    try {
      const { data } = await axios.get(`${API}/players/${id}`);
      setForm(data);
    } catch { setForm(emptyPersonalForm()); }
  };

  const handleNew = () => {
    setEditId(null);
    setShowNew(true);
    setForm(emptyPersonalForm());
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('请填写选手姓名', 'error'); return; }
    try {
      if (editId) {
        await axios.put(`${API}/players/${editId}`, form);
        toast('信息已更新', 'success');
      } else {
        await axios.post(`${API}/players`, form);
        toast('新增成功', 'success');
        setShowNew(false);
      }
      loadPlayers();
    } catch (e) {
      toast('保存失败: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 左侧：队员列表 */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">👥 试训队员列表</h3>
            <button onClick={handleNew}
              className="px-3 py-1.5 text-xs bg-cyan-500/20 border border-cyan-400/30
                text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-all">
              + 新增队员
            </button>
          </div>

          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {players.map(p => (
              <div key={p.id} onClick={() => handleSelect(p.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs transition-all
                  ${editId === p.id
                    ? 'bg-cyan-500/10 border border-cyan-400/20 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03] border border-transparent'}`}>
                <div>
                  <span className="font-medium">{p.name}</span>
                  {p.ign && <span className="text-gray-500 ml-2">({p.ign})</span>}
                </div>
                <span className="text-[10px] text-gray-600">{p.nationality || '—'}</span>
              </div>
            ))}
            {players.length === 0 && <p className="text-xs text-gray-600 text-center py-4">暂无试训队员</p>}
          </div>
        </div>
      </div>

      {/* 右侧：表单 */}
      <div className="lg:col-span-3">
        {(editId || showNew) ? (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">
              {editId ? '✏️ 编辑队员信息' : '➕ 新增试训队员'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['name','姓名','text'],[ 'ign','游戏 ID','text'],
                ['nationality','国籍','text'], ['age','年龄','number'],
                ['steam_id','Steam 64 ID','text'], ['faceit','Faceit','text'],
                ['phone','联系电话','text'], ['wechat','微信','text'],
                ['translator','翻译陪同','text'], ['translator_phone','翻译电话','text'],
                ['flight_info','航班信息','text'], ['room_no','住宿房间','text'],
                ['workstation','工位编号','text'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
                  <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({...p, [key]: e.target.value}))}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-[11px] text-gray-500 mb-1">备注</label>
                <textarea value={form.notes || ''} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" rows={2} />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleSave}
                className="px-6 py-2.5 bg-cyan-500/20 border border-cyan-400/30
                  text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition-all">
                💾 保存信息
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 text-center text-gray-500 text-sm">
            请从左侧选择队员查看详情，或点击「+ 新增队员」录入新选手
          </div>
        )}
      </div>
    </div>
  );
}

function emptyPersonalForm() {
  return {
    name: '', ign: '', nationality: '', age: '', steam_id: '', faceit: '',
    phone: '', wechat: '', translator: '', translator_phone: '',
    flight_info: '', room_no: '', workstation: '', notes: '',
  };
}

// ============================================================
// 3. 考核评分表模块
// ============================================================
function ScoreModule({ role }) {
  const [players, setPlayers] = useState([]);
  const [selectedPid, setSelectedPid] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [comments, setComments] = useState([]);

  // 评分表单
  const [scoreForm, setScoreForm] = useState({
    score_date: today(), evaluator: '主教练', trial_week: 1, phase: '队内对抗',
    d1: 0, d1_note: '', d2: 0, d2_note: '', d3: 0, d3_note: '',
    d4: 0, d4_note: '', d5: 0, d5_note: '', comment: '',
  });
  const [saving, setSaving] = useState(false);

  const DIM_NAMES = { d1: '游戏理解', d2: '自我纠错', d3: '个人能力', d4: '团队沟通', d5: '职业态度' };
  const WEIGHTS = { d1: 0.30, d2: 0.20, d3: 0.25, d4: 0.15, d5: 0.10 };

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    try {
      const { data } = await axios.get(`${API}/players`);
      setPlayers(data);
    } catch {}
  };

  const queryScores = useCallback(async () => {
    if (!selectedPid) return;
    let url = `${API}/scores?player_id=${selectedPid}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;

    try {
      const [recRes, statRes] = await Promise.all([
        axios.get(url),
        axios.get(url.replace('/scores?', '/scores/stats?')),
      ]);
      setRecords(recRes.data);
      setStats(statRes.data.stats);
      setComments(statRes.data.comments);
    } catch {}
  }, [selectedPid, dateFrom, dateTo]);

  useEffect(() => { queryScores(); }, [queryScores]);

  const handleScoreSubmit = async () => {
    if (!selectedPid) { toast('请选择试训队员', 'error'); return; }
    setSaving(true);
    const payload = { player_id: parseInt(selectedPid), ...scoreForm };
    try {
      const { data } = await axios.post(`${API}/scores`, payload);
      toast(`评分已保存，加权分：${data.weighted}`, 'success');
      setScoreForm(p => ({
        ...p, d1: 0, d1_note: '', d2: 0, d2_note: '', d3: 0, d3_note: '',
        d4: 0, d4_note: '', d5: 0, d5_note: '', comment: '',
      }));
      queryScores();
    } catch (e) {
      toast('保存失败: ' + (e.response?.data?.error || e.message), 'error');
    }
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* 左侧 */}
      <div className="lg:col-span-2 space-y-4">
        {/* 队员选择 */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">选择队员</h3>
          <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
            <option value="">-- 请选择 --</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.ign || '—'})</option>)}
          </select>
        </div>

        {/* 日期范围 */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">📅 查询周期</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500">开始</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">结束</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
          </div>
          <button onClick={queryScores}
            className="mt-3 w-full px-3 py-1.5 text-xs bg-cyan-500/20 border border-cyan-400/30
              text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-all">
            🔍 查询
          </button>
        </div>

        {/* 统计概览 */}
        {stats && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">📊 统计概览</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="text-center bg-white/[0.03] rounded-lg p-2">
                <div className="text-lg font-bold text-cyan-300">{stats.avg_weighted || '—'}</div>
                <div className="text-[10px] text-gray-500">加权均分</div>
              </div>
              <div className="text-center bg-white/[0.03] rounded-lg p-2">
                <div className="text-lg font-bold text-cyan-300">{stats.total_count || 0}</div>
                <div className="text-[10px] text-gray-500">评分次数</div>
              </div>
            </div>
            <div className="space-y-1 text-xs text-gray-400">
              {['d1','d2','d3','d4','d5'].map(d => (
                <div key={d} className="flex justify-between">
                  <span>{DIM_NAMES[d]} ({Math.round(WEIGHTS[d]*100)}%)</span>
                  <span className="text-cyan-300">{stats[`avg_${d}`] || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 综合评语 */}
        {comments.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 max-h-[300px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">💬 综合评语</h3>
            {comments.map((c, i) => (
              <div key={i} className="border-b border-white/[0.05] py-2 text-xs">
                <div className="text-cyan-400">{c.score_date} | {c.evaluator}</div>
                <div className="text-gray-400 mt-1">{c.comment || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：今日评分 */}
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">📝 提交评分</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[11px] text-gray-500">评估日期</label>
              <input type="date" value={scoreForm.score_date}
                onChange={e => setScoreForm(p => ({...p, score_date: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">评估人</label>
              <select value={scoreForm.evaluator} onChange={e => setScoreForm(p => ({...p, evaluator: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
                <option>主教练</option><option>战术教练</option><option>Smokky 领队</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">试训周期</label>
              <select value={scoreForm.trial_week} onChange={e => setScoreForm(p => ({...p, trial_week: parseInt(e.target.value)}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
                <option value={1}>Week 1（观察期）</option>
                <option value={2}>Week 2（实战期）</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">评估阶段</label>
              <select value={scoreForm.phase} onChange={e => setScoreForm(p => ({...p, phase: e.target.value}))}
                className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
                <option>队内对抗</option><option>训练赛</option><option>日常训练</option><option>复盘</option><option>综合</option>
              </select>
            </div>
          </div>

          {/* 五维度评分 */}
          <h4 className="text-xs font-semibold text-cyan-300 mb-3">五维度评分（1-5）</h4>
          <div className="grid grid-cols-1 gap-3 mb-4">
            {['d1','d2','d3','d4','d5'].map(d => (
              <div key={d} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">{DIM_NAMES[d]}</span>
                  <span className="text-[10px] text-gray-600">权重 {Math.round(WEIGHTS[d]*100)}%</span>
                </div>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(v => (
                    <button key={v} onClick={() => setScoreForm(p => ({...p, [d]: v}))}
                      className={`flex-1 px-2 py-1.5 text-xs rounded border transition-all
                        ${scoreForm[d] === v
                          ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-300'
                          : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:text-white'}`}>
                      {v}{v===1?'很差':v===2?'不足':v===3?'合格':v===4?'良好':'卓越'}
                    </button>
                  ))}
                </div>
                <input value={scoreForm[`${d}_note`] || ''}
                  onChange={e => setScoreForm(p => ({...p, [`${d}_note`]: e.target.value}))}
                  placeholder="评分依据..."
                  className="mt-1.5 w-full bg-white/[0.05] border border-white/[0.1] rounded p-1.5 text-xs text-white" />
              </div>
            ))}
          </div>

          <div className="mb-3">
            <label className="text-[11px] text-gray-500">综合评语</label>
            <textarea value={scoreForm.comment} onChange={e => setScoreForm(p => ({...p, comment: e.target.value}))}
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" rows={2} />
          </div>

          <button onClick={handleScoreSubmit} disabled={saving}
            className="px-6 py-2.5 bg-cyan-500/20 border border-cyan-400/30
              text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/30
              transition-all disabled:opacity-50">
            {saving ? '保存中...' : '💾 保存评分'}
          </button>
        </div>

        {/* 评分历史 */}
        {records.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 max-h-[400px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">📋 评分记录（共{records.length}条）</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/[0.05]">
                    <th className="text-left py-1.5 pr-2">日期</th>
                    <th className="text-left py-1.5 pr-2">评估人</th>
                    <th className="text-center py-1.5 px-1">理</th>
                    <th className="text-center py-1.5 px-1">纠</th>
                    <th className="text-center py-1.5 px-1">能</th>
                    <th className="text-center py-1.5 px-1">沟</th>
                    <th className="text-center py-1.5 px-1">态</th>
                    <th className="text-center py-1.5 pl-2">加权</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b border-white/[0.03] text-gray-300 hover:bg-white/[0.02]">
                      <td className="py-1.5 pr-2 text-cyan-400">{r.score_date}</td>
                      <td className="py-1.5 pr-2">{r.evaluator}</td>
                      <td className="text-center py-1.5 px-1">{r.d1 || '-'}</td>
                      <td className="text-center py-1.5 px-1">{r.d2 || '-'}</td>
                      <td className="text-center py-1.5 px-1">{r.d3 || '-'}</td>
                      <td className="text-center py-1.5 px-1">{r.d4 || '-'}</td>
                      <td className="text-center py-1.5 px-1">{r.d5 || '-'}</td>
                      <td className="text-center py-1.5 pl-2 text-cyan-300 font-bold">{r.weighted_score || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 4. 入队方案模块
// ============================================================
function PlanModule({ role }) {
  const [players, setPlayers] = useState([]);
  const [selectedPid, setSelectedPid] = useState('');
  const [plan, setPlan] = useState({ title: '', content: '' });
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPlayers(); }, []);
  useEffect(() => { if (selectedPid) loadPlans(selectedPid); }, [selectedPid]);

  const loadPlayers = async () => {
    try { const { data } = await axios.get(`${API}/players`); setPlayers(data); } catch {}
  };
  const loadPlans = async (pid) => {
    try { const { data } = await axios.get(`${API}/plans?player_id=${pid}`); setPlans(data); } catch {}
  };

  const handleSave = async () => {
    if (!selectedPid) { toast('请选择队员', 'error'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/plans`, {
        player_id: parseInt(selectedPid),
        title: plan.title || '入队方案',
        content: plan.content,
      });
      toast('方案已保存', 'success');
      setPlan({ title: '', content: '' });
      loadPlans(selectedPid);
    } catch (e) { toast('保存失败', 'error'); }
    setSaving(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">选择队员</h3>
          <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
            <option value="">-- 请选择 --</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.ign || '—'})</option>)}
          </select>
        </div>
        {plans.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 max-h-[400px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">📄 历史方案</h3>
            {plans.map(p => (
              <div key={p.id} className="border-b border-white/[0.05] py-2">
                <div className="text-xs text-cyan-400">{p.title} <span className="text-gray-600">{p.created_at}</span></div>
                <div className="text-xs text-gray-400 mt-1 whitespace-pre-wrap line-clamp-3">{p.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="lg:col-span-3">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">📄 入队方案</h3>
          <div className="mb-3">
            <label className="text-[11px] text-gray-500">方案标题</label>
            <input value={plan.title} onChange={e => setPlan(p => ({...p, title: e.target.value}))}
              placeholder="例：蒙古选手入队方案"
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">方案内容（Markdown）</label>
            <textarea value={plan.content} onChange={e => setPlan(p => ({...p, content: e.target.value}))}
              placeholder={`# 入队方案\n\n## 时间规划\n- 第一周：...\n- 第二周：...\n\n## 资源配置\n- 住宿：...\n- 训练：...\n\n## 注意事项\n- ...`}
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-3 text-sm text-white font-mono"
              rows={18} />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 bg-cyan-500/20 border border-cyan-400/30 text-cyan-300
                rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-50">
              {saving ? '保存中...' : '💾 保存方案'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 5. 成本支出表模块（受权限控制）
// ============================================================
function CostModule({ role }) {
  const [players, setPlayers] = useState([]);
  const [selectedPid, setSelectedPid] = useState('');
  const [costData, setCostData] = useState({ items: [], total: 0, byType: [] });
  const [newCost, setNewCost] = useState({ cost_type: '机票', description: '', amount: '', notes: '' });

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    try { const { data } = await axios.get(`${API}/players`); setPlayers(data); } catch {}
  };

  const loadCosts = useCallback(async () => {
    if (!selectedPid) return;
    try {
      const { data } = await axios.get(`${API}/costs?player_id=${selectedPid}`);
      setCostData(data);
    } catch {}
  }, [selectedPid]);

  useEffect(() => { loadCosts(); }, [loadCosts]);

  const handleAdd = async () => {
    if (!selectedPid) { toast('请选择队员', 'error'); return; }
    if (!newCost.amount) { toast('请输入金额', 'error'); return; }
    try {
      await axios.post(`${API}/costs`, {
        player_id: parseInt(selectedPid),
        ...newCost,
        amount: parseFloat(newCost.amount),
      });
      toast('成本项已添加', 'success');
      setNewCost({ cost_type: '机票', description: '', amount: '', notes: '' });
      loadCosts();
    } catch (e) { toast('添加失败', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除此成本项？')) return;
    try {
      await axios.delete(`${API}/costs/${id}`);
      toast('已删除');
      loadCosts();
    } catch (e) { toast('删除失败', 'error'); }
  };

  const lock = role !== 'CEO' && role !== '经理';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">选择队员</h3>
          <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
            <option value="">-- 请选择 --</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.ign || '—'})</option>)}
          </select>
        </div>

        {costData.total > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">💰 汇总</h3>
            <div className="text-2xl font-bold text-cyan-300 mb-3">
              ¥{costData.total.toLocaleString()}
            </div>
            <div className="space-y-1.5">
              {costData.byType.map((t, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-400">{t.cost_type}（{t.cnt}项）</span>
                  <span className="text-white">¥{t.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-3 space-y-4">
        {!lock && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">➕ 添加成本项</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-500">费用类型</label>
                <select value={newCost.cost_type} onChange={e => setNewCost(p => ({...p, cost_type: e.target.value}))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white">
                  <option>机票</option><option>住宿</option><option>签证</option><option>翻译</option>
                  <option>外设</option><option>餐饮</option><option>交通</option><option>其他</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">金额 (¥)</label>
                <input type="number" step="0.01" value={newCost.amount}
                  onChange={e => setNewCost(p => ({...p, amount: e.target.value}))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-gray-500">说明</label>
                <input value={newCost.description} onChange={e => setNewCost(p => ({...p, description: e.target.value}))}
                  placeholder="如：乌兰巴托→上海往返"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-gray-500">备注</label>
                <input value={newCost.notes} onChange={e => setNewCost(p => ({...p, notes: e.target.value}))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg p-2 text-sm text-white" />
              </div>
            </div>
            <button onClick={handleAdd}
              className="mt-3 px-6 py-2.5 bg-cyan-500/20 border border-cyan-400/30
                text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition-all">
              + 添加
            </button>
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 max-h-[500px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-white mb-3">📋 支出明细</h3>
          {costData.items.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">暂无支出记录</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/[0.05]">
                  <th className="text-left py-1.5">类型</th>
                  <th className="text-left py-1.5">说明</th>
                  <th className="text-right py-1.5">金额</th>
                  <th className="text-right py-1.5">操作</th>
                </tr>
              </thead>
              <tbody>
                {costData.items.map(item => (
                  <tr key={item.id} className="border-b border-white/[0.03] text-gray-300">
                    <td className="py-1.5">{item.cost_type}</td>
                    <td className="py-1.5">{item.description || '—'}</td>
                    <td className="py-1.5 text-right text-cyan-300">¥{item.amount?.toLocaleString()}</td>
                    <td className="py-1.5 text-right">
                      {!lock && (
                        <button onClick={() => handleDelete(item.id)}
                          className="text-[10px] text-red-400 hover:text-red-300">删除</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
