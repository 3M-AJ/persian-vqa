import React, { useState } from 'react';
import { Logo } from './Icons.jsx';

export default function LoginScreen({ onLogin, onRegister, error, busy }) {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const submit = (e) => { e.preventDefault(); registering ? onRegister(username.trim(), displayName.trim(), password) : onLogin(username.trim(), password); };
  return (
    <div className="login-wrap">
      <form className="login glass" onSubmit={submit}>
        <div className="login-brand"><Logo size={40} /><div><h1>پرسش و پاسخ تصویری</h1><p>{registering ? 'ساخت حساب کاربری' : 'میز کار تحلیل تصویر'}</p></div></div>
        {registering && <label>نام نمایشی<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" /></label>}
        <label>نام کاربری<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" dir="ltr" /></label>
        <label>گذرواژه<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} dir="ltr" minLength={registering ? 8 : undefined} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn-primary" disabled={busy || !username || !password || (registering && !displayName.trim())}>{busy ? 'در حال پردازش...' : registering ? 'ساخت حساب' : 'ورود'}</button>
        <button type="button" className="auth-switch" onClick={() => { setRegistering((v) => !v); }}>
          {registering ? 'قبلاً حساب ساخته‌اید؟ ورود' : 'حساب ندارید؟ ثبت‌نام کنید'}
        </button>
        {registering && <small className="muted">گذرواژه باید دست‌کم ۸ نویسه باشد. نام کاربری فقط می‌تواند شامل حروف لاتین، عدد و . _ - باشد.</small>}
      </form>
    </div>
  );
}
