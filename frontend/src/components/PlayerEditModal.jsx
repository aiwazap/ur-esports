import { useState, useRef, useEffect } from 'react';
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
    status: player.status || 'active',
    birth_date: player.birth_date || '',
    hltv_url: player.hltv_url || '',
    bio: player.bio || '',
    avatar_url: player.avatar_url || '',
  });
  const [saving, setSaving] = useState(false);

  // ── 头像裁剪 ──
  const [cropFile, setCropFile] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dr = useRef({ sx: 0, sy: 0, px: 0, py: 0 });

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  // 全局拖拽
  useEffect(() => {
    if (!dragging) return;
    const mv = (e) => {
      e.preventDefault();
      const pt = e.touches ? e.touches[0] : e;
      setPan({
        x: dr.current.px + (pt.clientX - dr.current.sx) / zoom,
        y: dr.current.py + (pt.clientY - dr.current.sy) / zoom,
      });
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', mv, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', mv);
      window.removeEventListener('touchend', up);
    };
  }, [dragging, zoom]);

  const onDragStart = (e) => {
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    dr.current = { sx: pt.clientX, sy: pt.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };

  // Canvas 裁剪 → Blob
  const cropAndGetBlob = () => {
    return new Promise((resolve, reject) => {
      if (!cropSrc) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const out = 400;
        const cvs = document.createElement('canvas');
        cvs.width = out;
        cvs.height = out;
        const ctx = cvs.getContext('2d');
        const s = Math.min(img.width, img.height) / zoom / 2;
        const cx = img.width / 2 + pan.x;
        const cy = img.height / 2 + pan.y;
        ctx.drawImage(img, cx - s, cy - s, s * 2, s * 2, 0, 0, out, out);
        cvs.toBlob((b) => (b ? resolve(b) : reject(new Error('裁剪失败'))), 'image/jpeg', 0.9);
      };
      img.onerror = reject;
      img.src = cropSrc;
    });
  };

  const update = (k, v) => setForm({ ...form, [k]: v });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (cropFile) {
        const blob = await cropAndGetBlob();
        const fd = new FormData();
        fd.append('file', blob, 'avatar.jpg');
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

  const VP = 120; // 裁剪视口尺寸

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ur-bg border border-ur-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 fade-in"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-white mb-4">编辑选手</h3>

        {/* ── 头像裁剪 ── */}
        {cropSrc ? (
          <div className="mb-4 bg-ur-card/40 rounded-xl p-4 border border-ur-border/40">
            <p className="text-xs text-gray-500 mb-3">拖拽图片 + 调整缩放来设置头像裁剪区域</p>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* 圆形预览 */}
              <div
                className="relative rounded-full overflow-hidden border-2 border-ur-indigo/50 shrink-0 bg-ur-card cursor-move"
                style={{ width: VP, height: VP }}
                onMouseDown={onDragStart}
                onTouchStart={onDragStart}
              >
                <img
                  src={cropSrc}
                  className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                    transformOrigin: 'center',
                  }}
                  draggable={false}
                />
                {/* 中心十字参考线 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="0.5">
                    <line x1="16" y1="0" x2="16" y2="32"/><line x1="0" y1="16" x2="32" y2="16"/>
                  </svg>
                </div>
              </div>
              {/* 控制区 */}
              <div className="flex flex-col gap-2 flex-1 min-w-0 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">缩放: {Math.round(zoom * 100)}%</span>
                  <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    className="text-xs text-gray-500 hover:text-white transition-colors">重置位置</button>
                </div>
                <input type="range" min="0.5" max="2.5" step="0.01" value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-ur-indigo" />
                <div className="flex gap-2 mt-1.5">
                  <label className="text-xs py-1.5 px-4 rounded-lg bg-ur-indigo/20 text-ur-cyan hover:bg-ur-indigo/30 transition-colors cursor-pointer">
                    重新选择
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                  </label>
                  <button onClick={() => { setCropFile(null); setCropSrc(null); }}
                    className="text-xs py-1.5 px-4 rounded-lg bg-ur-border/30 text-gray-400 hover:text-white transition-colors">移除头像</button>
                </div>
                <span className="text-[10px] text-gray-600 mt-0.5">拖拽圆形预览区来调整裁剪位置</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-4 p-3 bg-ur-card/30 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ur-indigo/30 to-ur-purple/30
                            flex items-center justify-center text-2xl font-display font-bold text-ur-cyan
                            overflow-hidden shrink-0">
              {form.avatar_url
                ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
                : (form.nickname?.[0]?.toUpperCase() || '?')}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm text-white font-display truncate">{form.nickname}</span>
              <label className="text-xs py-1.5 px-4 rounded-lg bg-ur-indigo/20 text-ur-cyan hover:bg-ur-indigo/30 transition-colors cursor-pointer inline-block text-center">
                更换头像
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
          </div>
        )}

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="游戏昵称" value={form.nickname} onChange={v => update('nickname', v)} />
          <Field label="真实姓名" value={form.real_name} onChange={v => update('real_name', v)} />
          <Field label="Steam ID" value={form.steam_id} onChange={v => update('steam_id', v)} span />
          <Field label="场上角色" value={form.in_game_role} onChange={v => update('in_game_role', v)} />
          <Field label="入队日期" value={form.join_date} type="date" onChange={v => update('join_date', v)} />
          <Field label="离队日期" value={form.leave_date} type="date" onChange={v => update('leave_date', v)} />
          <Field label="出生日期" value={form.birth_date} type="date" onChange={v => update('birth_date', v)} />
          <TypeSelect label="类型" value={form.team_type} onChange={v => update('team_type', v)} />
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
