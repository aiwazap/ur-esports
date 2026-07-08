import { useState } from 'react';
import api from '../api';

const TEAM_TYPES = {
  staff: '赛训团队',
  roster: '现役选手',
  former: '离队选手',
};

export default function PlayerEditModal({ player, onClose, onSaved }) {
  const [form, setForm] = useState({
    nickname: player.nickname || '',
    real_name: player.real_name || '',
    steam_id: player.steam_id || '',
    in_game_role: player.in_game_role || '',
    join_date: player.join_date || '',
    leave_date: player.leave_date || '',
    team_type: player.team_type || 'roster',
    roster_status: player.roster_status || 'starter',
    status: player.status || 'active',
    birth_date: player.birth_date || '',
    hltv_url: player.hltv_url || '',
    bio: player.bio || '',
    avatar_url: player.avatar_url || '',
    id_5e: player.id_5e || '',
    id_pw: player.id_pw || '',
    id_faceit_sea: player.id_faceit_sea || '',
  });
  const [saving, setSaving] = useState(false);

  // ── 头像：直接原图上传，不裁剪 ──
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setForm({ ...form, avatar_url: '' });
  };

  const update = (k, v) => setForm({ ...form, [k]: v });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (avatarFile) {
        const fd = new FormData();
        fd.append('file', avatarFile, avatarFile.name);
        const { data } = await api.post(`/players/${player.id}/avatar`, fd);
        payload.avatar_url = data.url;
      }
      await api.put(`/players/${player.id}`, payload);
      onSaved();
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此选手？')) return;
    try {
      await api.delete(`/players/${player.id}`);
      onSaved();
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '删除失败';
      alert('删除失败: ' + msg + '\n(状态码: ' + (e.response?.status || '?') + ')');
    }
  };

  const currentAvatar = avatarPreview || form.avatar_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ur-bg border border-ur-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 fade-in"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-white mb-4">编辑选手</h3>

        {/* ── 头像 ── */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-ur-card/30 rounded-xl">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ur-indigo/30 to-ur-purple/30
                          flex items-center justify-center text-2xl font-display font-bold text-ur-cyan
                          overflow-hidden shrink-0">
            {currentAvatar
              ? <img src={currentAvatar} alt="" className="w-full h-full object-cover" />
              : (form.nickname?.[0]?.toUpperCase() || '?')}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm text-white font-display truncate">{form.nickname}</span>
            <div className="flex gap-2">
              <label className="text-xs py-1.5 px-4 rounded-lg bg-ur-indigo/20 text-ur-cyan hover:bg-ur-indigo/30 transition-colors cursor-pointer inline-block text-center">
                {form.avatar_url || avatarPreview ? '更换头像' : '上传头像'}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
              {currentAvatar && (
                <button onClick={handleRemoveAvatar}
                  className="text-xs py-1.5 px-3 rounded-lg bg-ur-border/30 text-gray-400 hover:text-white transition-colors">
                  移除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="游戏昵称" value={form.nickname} onChange={v => update('nickname', v)} />
          <Field label="真实姓名" value={form.real_name} onChange={v => update('real_name', v)} />
          <Field label="Steam ID" value={form.steam_id} onChange={v => update('steam_id', v)} span />
          <Field label="5E 平台ID" value={form.id_5e} onChange={v => update('id_5e', v)} />
          <Field label="完美平台ID" value={form.id_pw} onChange={v => update('id_pw', v)} />
          <Field label="FACEIT 平台ID" value={form.id_faceit_sea} onChange={v => update('id_faceit_sea', v)} span />
          <Field label="场上角色" value={form.in_game_role} onChange={v => update('in_game_role', v)} />
          <Field label="入队日期" value={form.join_date} type="date" onChange={v => update('join_date', v)} />
          <Field label="离队日期" value={form.leave_date} type="date" onChange={v => update('leave_date', v)} />
          <Field label="出生日期" value={form.birth_date} type="date" onChange={v => update('birth_date', v)} />
          <TypeSelect label="类型" value={form.team_type} onChange={v => update('team_type', v)} />
          <TypeSelect label="梯队" value={form.roster_status} onChange={v => update('roster_status', v)}
            options={{ starter: '现役', bench: '板凳', demoted: '下放' }} />
          <TypeSelect label="状态" value={form.status} onChange={v => update('status', v)}
            options={{ active: '现役', inactive: '不活跃', left: '离队' }} />
          <Field label="HLTV链接" value={form.hltv_url} onChange={v => update('hltv_url', v)} span />
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">简介</label>
          <textarea value={form.bio} onChange={e => update('bio', e.target.value)}
            className="w-full bg-ur-card border border-ur-border rounded-lg px-3 py-2 text-sm text-white h-20 resize-none" />
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={handleDelete} className="btn-danger text-xs">删除选手</button>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-gray-400 text-sm hover:text-white">取消</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', span = false }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-ur-card border border-ur-border rounded-lg px-3 py-2 text-sm text-white
                   focus:border-ur-indigo/50 focus:outline-none" />
    </div>
  );
}

function TypeSelect({ label, value, onChange, options }) {
  const items = options || { staff: '赛训团队', roster: '现役选手', former: '离队选手' };
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-ur-card border border-ur-border rounded-lg px-3 py-2 text-sm text-white">
        {Object.entries(items).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}


