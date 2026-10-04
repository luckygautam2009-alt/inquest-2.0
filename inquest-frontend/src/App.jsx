import { useState, useEffect } from 'react';
import { submitComplaint } from './api/client';
import ComplaintForm from './components/ComplaintForm';
import ResultPanel from './components/ResultPanel';
import EvidenceGraph from './components/EvidenceGraph';
import LoadingSkeleton from './components/LoadingSkeleton';
import { useTheme } from './hooks/useTheme';
import AdminPanel from './components/AdminPanel';
import StoryPage from './pages/StoryPage';
import StorePage from './pages/StorePage';
import AuthPage from './pages/AuthPage';
import GatePage from './pages/GatePage';
import { goTo } from './auth/nav';
import { Scale, Activity, ChevronRight, Sun, Moon, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import logoMark from './assets/logo-mark.png';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const [showAdmin, setShowAdmin] = useState(false);
  const [prefill, setPrefill] = useState(null);

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (route === '/') {
    return <GatePage />;
  }

  if (route === '/admin') {
    return (
      <div className="min-h-screen bg-ink">
        <AdminPanel onClose={() => goTo('/')} />
      </div>
    );
  }

  if (route === '/login') {
    return <AuthPage />;
  }

  if (route === '/store') {
    return (
      <StorePage
        onOpenConsole={(data) => {
          setResult(data);
          setError(null);
          goTo('/console');
        }}
      />
    );
  }

  if (route === '/story') {
    return (
      <StoryPage
        onNavigateHome={() => {
          window.history.pushState({}, '', '/');
          setRoute('/');
        }}
      />
    );
  }

  async function handleSubmit(customerId, complaintText, photos = []) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitComplaint(customerId, complaintText, photos, { skipAuth: true });
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Something went wrong. Ensure the backend is running on port 5001.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-paper selection:bg-amber/30 transition-colors duration-200">

      {/* ── Top nav ── */}
      <header
        className="sticky top-0 z-50 border-b border-border backdrop-blur-md transition-colors"
        style={{ background: 'var(--header-glass)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-18 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-dim border border-amber/40 flex items-center justify-center shadow-xs overflow-hidden p-1.5">
              <img src="/favicon.png" alt="INQUEST Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-paper">INQUEST</span>
              <span className="text-border-strong text-base select-none">/</span>
              <span className="text-xs sm:text-sm text-paper-dim dark:text-muted font-semibold">Agent Console</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {result && (
              <div className="hidden md:flex items-center gap-2 text-xs bg-ink-light px-3.5 py-2 rounded-xl border border-border-strong shadow-xs">
                <Activity className="w-3.5 h-3.5 text-verified animate-pulse" />
                <span className="text-verified font-bold">Investigation Complete</span>
              </div>
            )}

            {/* Back to the gate */}
            <button
              type="button"
              onClick={() => goTo('/')}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-ink-light hover:bg-ink-lighter border border-border-strong text-paper text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98]"
              title="Back to the home screen"
            >
              <ArrowLeft className="w-4 h-4 text-amber shrink-0" />
              <span className="hidden sm:inline">Home</span>
            </button>

            {/* See how it works button */}
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/story');
                setRoute('/story');
              }}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-dim hover:bg-amber-dim/80 border border-amber/40 text-amber text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.98]"
              title="See how INQUEST investigates complaints"
            >
              <Sparkles className="w-4 h-4 text-amber shrink-0" />
              <span className="hidden sm:inline">See how it works</span>
              <span className="sm:hidden">Story</span>
            </button>

            {/* Admin Panel Button */}
            <button
              type="button"
              onClick={() => setShowAdmin(true)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-ink-light hover:bg-ink-lighter border border-border-strong text-paper text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm active:scale-[0.98]"
              title="Open admin panel"
            >
              <ShieldCheck className="w-4.5 h-4.5 text-amber shrink-0" />
              <span>Admin</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-ink-light hover:bg-ink-lighter border border-border-strong text-paper text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm active:scale-[0.98]"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4.5 h-4.5 text-amber-light shrink-0" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-ink-light/80 border border-border-strong shadow-2xs" title="Backend service connected">
              <span className="w-2.5 h-2.5 rounded-full bg-verified animate-pulse" />
              <span className="hidden sm:inline font-semibold text-verified">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero tagline — only when no result ── */}
      {!result && !loading && (
        <div className="border-b border-border-strong bg-gradient-to-b from-ink-light/80 to-ink-light/30 shadow-xs relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-dim border border-amber-600/30 dark:border-amber-400/30 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                <span>Autonomous Investigation System</span>
              </div>
              <h1 className="font-display text-3xl sm:text-5xl text-paper leading-[1.16] font-bold tracking-tight">
                Every customer complaint is investigated<br className="hidden sm:block" />
                <span className="text-paper-dim/85 dark:text-muted font-normal block sm:inline mt-1.5 sm:mt-0"> with connected evidence before a verdict.</span>
              </h1>
              <p className="mt-4 sm:mt-5 text-base sm:text-lg text-paper-dim dark:text-muted leading-relaxed max-w-2xl font-sans font-normal">
                INQUEST autonomously audits order records, payment gateways, ticket history,
                and business policies — synthesizing root causes and actionable resolutions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
        <div className={`grid gap-8 sm:gap-10 ${result || loading ? 'lg:grid-cols-[400px_1fr]' : 'lg:grid-cols-[440px_1fr]'}`}>

          {/* ── Left: Intake form ── */}
          <aside className="lg:self-start lg:sticky lg:top-28 space-y-6">
            <div className="rounded-2xl border border-border-strong p-6 sm:p-7 bg-ink-light shadow-md backdrop-blur-xs">
              <ComplaintForm key={prefill?.key || 'default'} onSubmit={handleSubmit} loading={loading} prefill={prefill} />
            </div>

            {/* How it works — visible when idle */}
            {!result && !loading && (
              <div className="rounded-2xl border border-border-strong p-6 bg-ink-light space-y-4.5 shadow-sm">
                <div className="text-xs font-bold text-paper-dim dark:text-muted uppercase tracking-wider flex items-center justify-between border-b border-border pb-2.5">
                  <span>How INQUEST Works</span>
                  <span className="text-[11px] font-semibold text-amber">4-Stage Pipeline</span>
                </div>
                {[
                  ['1. Intent & Sentiment', 'Extracts exact problem domain, emotion, and urgency from text (multilingual/Hinglish).'],
                  ['2. Evidence Gathering', 'Cross-references customer purchase history, payment gateway statuses, and prior tickets.'],
                  ['3. Policy Evaluation', 'Validates issue against company SLA policies and refund/replacement criteria.'],
                  ['4. Verdict & Handoff', 'Issues automated resolution (AUTO_RESOLVE, CONFIRM, or ESCALATE with ready brief).'],
                ].map(([step, desc], i) => (
                  <div key={i} className="flex items-start gap-3.5 pt-0.5">
                    <div className="w-6 h-6 rounded-lg bg-amber-dim border border-amber/40 flex items-center justify-center text-xs font-bold text-amber shrink-0 mt-0.5 shadow-xs">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-paper">{step.replace(/^\d+\.\s*/, '')}</div>
                      <div className="text-xs text-paper-dim dark:text-muted mt-1 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* ── Right: Results ── */}
          <div className="space-y-8 min-w-0">

            {/* Error state */}
            {error && (
              <div className="border border-alert/30 bg-alert-dim text-alert px-5 py-4 rounded-xl text-base flex items-start gap-3 fade-up font-medium">
                <span className="text-lg">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && <LoadingSkeleton />}

            {/* Results */}
            {result && !loading && (
              <div className="space-y-8">
                {/* Breadcrumb header */}
                <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-border">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-muted">
                    <span className="font-semibold text-muted">Active Case</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span className="text-paper font-semibold">{result.customerId}</span>
                  </div>

                  <span className="text-xs text-muted bg-ink-lighter px-3 py-1 rounded-full border border-border">
                    {result.analysis?.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Rule Engine Analysis'}
                  </span>
                </div>

                {/* ── Evidence Graph — centrepiece ── */}
                <div className="rounded-2xl border border-border-strong overflow-hidden bg-ink-light shadow-sm">
                  <div className="px-6 py-4.5 border-b border-border flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-6 bg-amber rounded-full" />
                      <div>
                        <h2 className="font-display text-xl text-paper font-semibold">Evidence Graph</h2>
                        <p className="text-xs text-muted">End-to-end timeline from complaint intake to verdict</p>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-muted bg-ink-lighter px-3 py-1.5 rounded-lg border border-border">
                      {result.evidenceGraph?.nodes?.length || 0} nodes ·{' '}
                      {result.evidenceGraph?.edges?.length || 0} connections
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    <EvidenceGraph evidenceGraph={result.evidenceGraph} />
                  </div>
                </div>

                {/* ── Analysis, Root Cause, Decision, Handoff cards ── */}
                <ResultPanel data={result} />
              </div>
            )}

            {/* Empty idle state in the right column */}
            {!result && !loading && !error && (
              <div className="hidden lg:flex flex-col items-center justify-center min-h-[500px] rounded-2xl border border-border-strong bg-ink-light shadow-sm text-center px-10 py-12 relative overflow-hidden">
                {/* Background ambient lighting */}
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-amber/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                {/* Standby badge */}
                <div className="w-20 h-20 rounded-2xl bg-amber-dim border border-amber/40 flex items-center justify-center mb-5 shadow-sm ring-4 ring-amber-dim/50 p-3.5">
                  <img src="/favicon.png" alt="INQUEST" className="w-12 h-12 object-contain" />
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink-lighter border border-border-strong text-xs font-semibold text-paper-dim dark:text-muted mb-3.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-verified animate-pulse" />
                  <span>Autonomous Engine Standby</span>
                </div>

                <h3 className="font-display text-2xl sm:text-3xl text-paper font-bold tracking-tight">
                  Investigation Board Ready
                </h3>
                
                <p className="text-paper-dim dark:text-muted text-sm sm:text-base mt-2.5 max-w-md leading-relaxed font-sans font-normal">
                  Select a customer profile, enter or paste a complaint, and trigger the AI investigation to generate real-time evidence synthesis.
                </p>

                {/* Feature preview chips */}
                <div className="mt-8 grid grid-cols-3 gap-3.5 w-full max-w-md pt-6 border-t border-border">
                  <div className="flex flex-col items-center p-3 rounded-xl bg-ink-lighter border border-border-strong shadow-2xs">
                    <Activity className="w-4 h-4 text-amber mb-1.5" />
                    <span className="text-xs font-bold text-paper">Live Graph</span>
                    <span className="text-[11px] text-muted">Node timeline</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-xl bg-ink-lighter border border-border-strong shadow-2xs">
                    <ShieldCheck className="w-4 h-4 text-verified mb-1.5" />
                    <span className="text-xs font-bold text-paper">Policy SLA</span>
                    <span className="text-[11px] text-muted">Auto check</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-xl bg-ink-lighter border border-border-strong shadow-2xs">
                    <Scale className="w-4 h-4 text-indigo-400 mb-1.5" />
                    <span className="text-xs font-bold text-paper">Verdict</span>
                    <span className="text-[11px] text-muted">Resolution</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-20 py-8 px-8 bg-ink-light/40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="INQUEST" className="w-4 h-4 object-contain" />
            <span className="font-display font-semibold text-paper">INQUEST</span>
            <span>· RootCause AI · Autonomous Complaint Resolution</span>
          </div>
          
        </div>
      </footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
