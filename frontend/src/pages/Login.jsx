import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || { username: form.username }));
      nav('/overview');
    } catch {
      setErr('登录失败，请检查账号密码');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ur-bg">
      <form onSubmit={submit} className="bg-ur-card border border-ur-border rounded-2xl p-8 w-full max-w-sm space-y-4">
        <h1 className="font-display text-2xl font-bold text-white text-center">UR ESPORTS</h1>
        <p className="text-gray-500 text-sm text-center">管理员登录</p>
        {err && <p className="text-ur-rose text-sm text-center">{err}</p>}
        <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
               placeholder="用户名" className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white" />
        <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
               type="password" placeholder="密码" className="w-full bg-ur-bg border border-ur-border rounded-lg px-3 py-2 text-white" />
        <button type="submit" className="btn-primary w-full">登录</button>
      </form>
    </div>
  );
}
