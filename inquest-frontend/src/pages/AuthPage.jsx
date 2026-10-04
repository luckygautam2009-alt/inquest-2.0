import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { goTo } from '../auth/nav';

export default function AuthPage() {
  const { customer, signup, login, logout } = useAuth();
  const rawNext = new URLSearchParams(window.location.search).get('next') || '/store';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && name.trim().length < 2) { setError('Please enter your full name.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await signup({ name: name.trim(), email: email.trim(), password });
      else await login({ email: email.trim(), password });
      goTo(next);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full bg-ink-lighter border border-border-strong rounded-xl px-4 py-3 text-base text-paper focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber';

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="px-4 sm:px-8 h-16 flex items-center">
        <button type="button" onClick={() => goTo('/')} className="flex items-center gap-2 text-sm font-semibold hover:text-amber cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to Inquest
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-border-strong bg-ink-light p-7 shadow-md">
          <div className="mb-5">
            <div className="font-display text-2xl font-bold tracking-tight">INQUEST</div>
            <p className="text-sm text-muted mt-1">Your orders, payments and complaints in one account.</p>
          </div>

          {customer ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-verified/40 bg-verified-dim p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-verified mb-1">Signed in</div>
                <div className="font-bold">{customer.name} <span className="font-mono text-xs text-muted">· {customer.id}</span></div>
                <div className="text-xs text-muted">{customer.email}</div>
              </div>
              <button type="button" onClick={() => goTo(next)} className="w-full bg-amber text-ink font-bold py-3 rounded-xl cursor-pointer">Continue</button>
              <button type="button" onClick={logout} className="w-full text-sm font-semibold text-muted hover:text-paper cursor-pointer">Sign out</button>
            </div>
          ) : (
            <>
              <div className="flex rounded-xl border border-border-strong overflow-hidden mb-5 text-sm font-bold">
                {[['login', 'Sign in'], ['signup', 'Create account']].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 py-2.5 cursor-pointer ${mode === m ? 'bg-amber text-ink' : 'bg-ink-lighter text-muted'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Full name</label>
                    <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Email</label>
                  <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} required />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Password</label>
                  <div className="relative">
                    <input className={input + ' pr-11'} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} maxLength={128} required />
                    <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted cursor-pointer">
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === 'signup' && <p className="text-[11px] text-muted mt-1.5">At least 8 characters.</p>}
                </div>
                {error && <p className="text-sm font-semibold text-alert">{error}</p>}
                <button type="submit" disabled={busy} className="w-full bg-amber text-ink font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50">
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>
              {mode === 'signup' && (
                <p className="text-[11px] text-muted mt-4">A unique customer ID is created for you automatically, and every order and payment you make is saved to it.</p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
