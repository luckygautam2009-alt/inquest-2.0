import { useEffect } from 'react';
import { ShoppingBag, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { goTo } from '../auth/nav';

export default function GatePage() {
  const { customer } = useAuth();

  useEffect(() => {
    if (customer) goTo('/store');
  }, [customer]);

  const card = 'rounded-2xl border border-border-strong bg-ink-light p-7 shadow-md flex flex-col';
  const primary = 'w-full bg-amber text-ink font-bold py-3 rounded-xl cursor-pointer hover:opacity-90';
  const secondary = 'w-full border border-border-strong bg-ink-lighter text-paper font-semibold py-3 rounded-xl cursor-pointer hover:bg-ink';

  return (
    <div className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="max-w-5xl w-full mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-dim border border-amber/40 flex items-center justify-center p-1.5 overflow-hidden">
            <img src="/favicon.png" alt="INQUEST" className="w-full h-full object-contain" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">INQUEST</span>
        </div>
        <button type="button" onClick={() => goTo('/story')}
          className="flex items-center gap-2 text-sm font-semibold text-amber cursor-pointer hover:underline">
          <Sparkles className="w-4 h-4" /> See how it works
        </button>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 pb-16">
        <div className="text-center my-10 sm:my-14">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
            Complaints resolved with evidence,<br className="hidden sm:block" /> not guesswork.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            Shop, report a problem, and watch it get investigated against real order, payment and photo evidence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <section className={card}>
            <div className="w-11 h-11 rounded-xl bg-verified-dim border border-verified/40 flex items-center justify-center mb-4">
              <ShoppingBag className="w-5 h-5 text-verified" />
            </div>
            <h2 className="font-display text-2xl font-bold">I'm a customer</h2>
            <p className="text-sm text-muted mt-2 mb-6 flex-1">
              Browse products, track your orders and report a problem. Every order and payment is saved to your own account.
            </p>
            <div className="space-y-2.5">
              <button type="button" onClick={() => goTo('/login?next=/store')} className={primary}>Sign in</button>
              <button type="button" onClick={() => goTo('/login?mode=signup&next=/store')} className={secondary}>Create account</button>
            </div>
          </section>

          <section className={card}>
            <div className="w-11 h-11 rounded-xl bg-amber-dim border border-amber/40 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 text-amber" />
            </div>
            <h2 className="font-display text-2xl font-bold">I'm an admin</h2>
            <p className="text-sm text-muted mt-2 mb-6 flex-1">
              Dashboard, analytics, audit log and overrides. Admin access needs the admin password and ID verification.
            </p>
            <div className="space-y-2.5">
              <button type="button" onClick={() => goTo('/admin')} className={primary}>Admin sign-in</button>
              <button type="button" onClick={() => goTo('/console')} className={secondary}>Agent console (demo tool)</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
