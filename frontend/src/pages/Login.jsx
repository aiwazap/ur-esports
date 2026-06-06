import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'player', label: '选手' },
  { value: 'coach', label: '教练' },
  { value: 'team_lead', label: '领队' },
  { value: 'analyst', label: '分析师' },
  { value: 'manager', label: '经理' },
  { value: 'ceo', label: 'CEO' },
];

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '', steam_id: '', role: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.username || !form.password || !form.steam_id || !form.role) {
      setErr('请填写所有字段');
      return;
    }
    if (!/^\d{17}$/.test(form.steam_id.trim())) {
      setErr('Steam64 ID 格式不正确，应为 17 位数字');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        username: form.username,
        password: form.password,
        steam_id: form.steam_id.trim(),
        role: form.role,
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      nav('/overview');
    } catch (err) {
      setErr(err.response?.data?.error || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ur-bg">
      <form onSubmit={submit} className="glass-panel rounded-2xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <h1 className="font-display text-2xl font-bold text-white">UR ESPORTS</h1>
          <p className="text-gray-500 text-sm mt-1">数据管理中心 · 身份验证</p>
        </div>

        {err && (
          <div className="p-3 bg-ur-rose/10 border border-ur-rose/30 rounded-lg text-sm text-ur-rose text-center">
            {err}
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">用户名</label>
          <input
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            autoFocus
            placeholder="请输入用户名"
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">密码</label>
          <input
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            type="password"
            placeholder="请输入密码"
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Steam64 ID</label>
          <input
            value={form.steam_id}
            onChange={e => setForm({ ...form, steam_id: e.target.value })}
            placeholder="7656119XXXXXXXXXXXX（17位数字）"
            maxLength={17}
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600 transition-colors
                       font-mono tracking-wide"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">职位</label>
          <div className="grid grid-cols-4 gap-2">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, role: opt.value })}
                className={`py-2.5 px-2 rounded-lg text-sm font-display border transition-all duration-200
                  ${form.role === opt.value
                    ? 'bg-ur-cyan/15 border-ur-cyan/50 text-ur-cyan shadow-[0_0_12px_rgba(104,232,255,0.15)]'
                    : 'bg-ur-bg border-ur-border text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-glass btn-glass-primary w-full !h-[44px] !text-sm mt-2 disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
