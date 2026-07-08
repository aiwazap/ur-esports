import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'coach', label: '教练' },
  { value: 'team_lead', label: '领队' },
  { value: 'player', label: '选手' },
];

export default function Register() {
  const [form, setForm] = useState({ username: '', password: '', confirm: '', role: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.username || !form.password || !form.confirm || !form.role) {
      setErr('请填写所有字段');
      return;
    }
    if (form.password !== form.confirm) {
      setErr('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register', {
        username: form.username,
        password: form.password,
        role: form.role,
      });
      nav('/login', { state: { message: '注册成功，请登录' } });
    } catch (err) {
      setErr(err.response?.data?.error || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ur-bg">
      <form onSubmit={submit} className="glass-panel rounded-2xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <h1 className="font-display text-2xl font-bold text-white">UR ESPORTS</h1>
          <p className="text-gray-500 text-sm mt-1">注册新账号</p>
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
          <label className="block text-xs text-gray-500 mb-1">确认密码</label>
          <input
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            type="password"
            placeholder="请再次输入密码"
            className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2.5 text-white text-sm
                       focus:border-ur-cyan focus:outline-none placeholder:text-gray-600 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">职位</label>
          <div className="grid grid-cols-2 gap-2">
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
          {loading ? '注册中...' : '注册'}
        </button>

        <div className="text-center text-xs text-gray-500">
          已有账号？{' '}
          <Link to="/login" className="text-ur-cyan hover:underline">返回登录</Link>
        </div>
      </form>
    </div>
  );
}
