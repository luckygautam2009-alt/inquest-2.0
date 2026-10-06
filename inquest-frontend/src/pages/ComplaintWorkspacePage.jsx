import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import ResultPanel from '../components/ResultPanel';
import { getAdminComplaintDetail, investigateAdminComplaint, resolveAdminComplaint } from '../api/client';
import { getAdminSession } from '../auth/adminSession';
import { goTo } from '../auth/nav';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const OK = 'text-verified border-verified/40 bg-verified-dim';
const WARN = 'text-amber border-amber/40 bg-amber-dim';
const BAD = 'text-alert border-alert/40 bg-alert-dim';
const NEUTRAL = 'text-muted border-border-strong bg-ink-lighter';
const STATUS = {
  registered: ['New', NEUTRAL], investigating: ['Investigating…', WARN], auto_resolved: ['Auto-resolved', OK], human_review: ['Human review', BAD],
  investigated: ['Review needed', BAD], needs_info: ['Needs customer info', WARN], awaiting_customer: ['Awaiting customer', WARN], resolved: ['Resolved', OK],
};
const KIND = { EXECUTE: 'Eligible for automatic resolution', OFFER: 'Eligible for an automatic offer to the customer', INFO: 'Customer information is required', REVIEW: 'Needs a human decision' };

// A broken stored result must never blank the whole page
class SafeBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return <div className="rounded-xl border border-alert/40 bg-alert-dim p-4 text-sm">Could not render the stored investigation ({String(this.state.err.message || this.state.err)}). Use “Re-run investigation” to regenerate it.</div>;
    }
    return this.props.children;
  }
}

function Box({ title, children }) {
  return (
    <section className="rounded-xl border border-border bg-ink-light p-5 shadow-2xs">
      {title && <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">{title}</div>}
      {children}
    </section>
  );
}

function Gates({ automation }) {
  if (!automation) return null;
  return (
    <Box title="Automation gates">
      <div className="text-sm font-bold text-paper mb-1">{KIND[automation.kind] || automation.kind}</div>
      {automation.reason && <p className="text-xs text-muted mb-3">{automation.reason}</p>}
      {automation.gates && automation.gates.length > 0 && (
        <ul className="space-y-1.5">
          {automation.gates.map((g) => (
            <li key={g.key} className="flex items-start gap-2 text-xs">
              {g.ok ? <Check className="w-4 h-4 text-verified shrink-0" /> : <X className="w-4 h-4 text-alert shrink-0" />}
              <span className={g.ok ? 'text-paper' : 'text-alert font-semibold'}>{g.label}</span>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

export default function ComplaintWorkspacePage({ complaintId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({ note: '', message: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [formError, setFormError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const top = useRef(null);

  const back = new URLSearchParams(window.location.search).get('back') || '?view=complaints';
  let queue = [];
  try { queue = JSON.parse(sessionStorage.getItem('inquest.complaintQueue') || '[]'); } catch { /* ignore */ }
  const idx = queue.indexOf(complaintId);
  const prevId = idx > 0 ? queue[idx - 1] : null;
  const nextId = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : null;

  const goList = () => goTo('/admin' + back);
  const goTo2 = (id) => goTo(`/admin/complaints/${id}?back=${encodeURIComponent(back)}`);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const r = await getAdminComplaintDetail(complaintId);
      setDetail(r.data);
      setError(null);
    } catch (e) {
      if (e.status === 401) setExpired(true);
      else setError(e.message || 'Could not load this complaint');
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    if (!getAdminSession()) {
      try { sessionStorage.setItem('inquest.afterAdminLogin', window.location.pathname + window.location.search); } catch { /* ignore */ }
      goTo('/admin');
      return;
    }
    setDetail(null); setMode(null); setFlash(null); setRunError(null);
    load();
  }, [complaintId, load]);

  useEffect(() => {
    const h = () => setExpired(true);
    window.addEventListener('inquest:admin-expired', h);
    return () => window.removeEventListener('inquest:admin-expired', h);
  }, []);

  const status = detail ? detail.complaint.status : null;
  useEffect(() => {
    if (status !== 'investigating') return undefined;
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
  }, [status, load]);

  async function runInvestigation(force) {
    if (running) return;
    setRunning(true);
    setRunError(null);
    try {
      await investigateAdminComplaint(complaintId, force);
      await load(true);
    } catch (e) {
      if (e.status === 401) setExpired(true);
      else setRunError(e.message || 'The investigation failed. You can retry.');
    } finally {
      setRunning(false);
    }
  }

  function pick(m) {
    setMode(m);
    setFormError(null);
    setForm({ note: '', message: '', amount: detail && detail.order ? String(detail.order.amount) : '' });
  }

  async function submit() {
    setFormError(null);
    if (mode === 'REQUEST_INFO' && form.message.trim().length < 8) { setFormError('Write what you need from the customer (at least 8 characters).'); return; }
    if (mode === 'REFUND') {
      const a = Number(form.amount);
      if (!(a > 0) || (detail.order && a > detail.order.amount)) { setFormError(`Enter an amount between 1 and ${detail.order ? detail.order.amount : 'the order value'}.`); return; }
    }
    setBusy(true);
    try {
      await resolveAdminComplaint({
        complaintId, action: mode, amount: mode === 'REFUND' ? Number(form.amount) : undefined,
        customerMessage: form.message.trim() || undefined, note: form.note.trim() || undefined,
      });
      const labels = { CONFIRM_AI: 'AI recommendation confirmed and executed.', SEND_OFFER: 'Offer sent to the customer.', REFUND: 'Refund approved.', NO_REFUND: 'Complaint closed without a refund.', REQUEST_INFO: 'Information requested from the customer.' };
      setFlash(labels[mode]);
      setMode(null);
      await load(true);
      if (top.current) top.current.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      if (e.status === 401) setExpired(true);
      else setFormError(e.message || 'Could not complete the action');
    } finally {
      setBusy(false);
    }
  }

  function signInAgain() {
    try { sessionStorage.setItem('inquest.afterAdminLogin', window.location.pathname + window.location.search); } catch { /* ignore */ }
    goTo('/admin');
  }

  const c = detail ? detail.complaint : null;
  const inv = detail ? detail.investigation : null;
  const st = c ? (STATUS[c.status] || [c.status, NEUTRAL]) : null;
  const canAct = c && ['investigated', 'human_review'].includes(c.status) && !!inv;
  const rec = inv && inv.decision ? inv.decision.decision : null;
  const input = 'w-full bg-ink-inset border border-border rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:ring-1 focus:ring-amber/50';
  const btn = (m, label, tone) => (
    <button key={m} type="button" onClick={() => pick(m)}
      className={`text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer border ${mode === m ? 'bg-amber text-ink border-amber' : tone || 'border-border-strong text-paper hover:bg-ink-lighter'}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-ink text-paper" ref={top}>
      <header className="sticky top-0 z-30 border-b border-border backdrop-blur-md" style={{ background: 'var(--header-glass)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">
          <button type="button" onClick={goList} className="flex items-center gap-2 text-sm font-semibold hover:text-amber cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Complaints
          </button>
          <div className="flex items-center gap-2.5">
            {st && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${st[1]}`}>{st[0]}</span>}
            <button type="button" disabled={!prevId} onClick={() => goTo2(prevId)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-strong disabled:opacity-40 cursor-pointer flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Previous</button>
            <button type="button" disabled={!nextId} onClick={() => goTo2(nextId)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-strong disabled:opacity-40 cursor-pointer flex items-center gap-1">Next complaint <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {expired && (
          <div className="rounded-xl border border-amber/40 bg-amber-dim p-4 flex flex-wrap items-center justify-between gap-3">
            <div><div className="font-bold text-sm">Your admin session has expired</div><div className="text-xs text-muted">Sign in again and you will return to complaint #{complaintId}.</div></div>
            <button type="button" onClick={signInAgain} className="bg-amber text-ink font-bold text-xs px-4 py-2 rounded-lg cursor-pointer">Sign in again</button>
          </div>
        )}
        {loading && !detail && <p className="text-sm text-muted">Loading complaint #{complaintId}…</p>}
        {error && (
          <div className="rounded-xl border border-alert/40 bg-alert-dim p-4 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-alert">{error}</span>
            <button type="button" onClick={() => load()} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-alert/40 text-alert cursor-pointer">Retry</button>
          </div>
        )}
        {flash && <div className="rounded-xl border border-verified/40 bg-verified-dim p-3 text-sm font-semibold text-verified flex items-center gap-2"><Check className="w-4 h-4" /> {flash}</div>}

        {detail && (
          <>
            <div className="grid lg:grid-cols-3 gap-4">
              <Box title={`Complaint #${c.id}`}>
                <p className="text-sm text-paper leading-relaxed whitespace-pre-wrap">{c.complaintText}</p>
                <div className="mt-3 text-[11px] text-muted space-y-0.5">
                  <div>Registered: {new Date(c.createdAt).toLocaleString('en-IN')}</div>
                  <div>Category: <span className="capitalize">{(c.issueKey || 'other').replace(/_/g, ' ')}</span></div>
                  {c.investigatedAt && <div>Investigated: {new Date(c.investigatedAt).toLocaleString('en-IN')}</div>}
                  {c.resolvedAt && <div>Resolved: {new Date(c.resolvedAt).toLocaleString('en-IN')}{c.resolvedBy ? ` by ${c.resolvedBy}` : ''}</div>}
                </div>
                {detail.photos.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Attached photos</div>
                    <div className="flex gap-2 flex-wrap">
                      {detail.photos.map((p) => (
                        <button key={p.id} type="button" onClick={() => setLightbox(p.dataUrl)} className="w-20 h-20 rounded-lg overflow-hidden border border-border-strong cursor-pointer">
                          <img src={p.dataUrl} alt={p.name || 'evidence'} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Box>
              <Box title="Customer">
                {detail.customer ? (
                  <div className="text-sm space-y-0.5">
                    <div className="font-bold">{detail.customer.name}</div>
                    <div className="font-mono text-xs text-muted">{detail.customer.id} · {String(detail.customer.tier).toUpperCase()}</div>
                    <div className="text-xs text-muted">{detail.customer.email}</div>
                    <div className="text-[11px] text-muted">Joined {detail.customer.joinedOn}</div>
                  </div>
                ) : <p className="text-sm text-muted">Customer record not found.</p>}
              </Box>
              <Box title="Order">
                {detail.order ? (
                  <div className="text-sm space-y-1">
                    <div className="font-bold">{detail.order.id} · {detail.order.product}</div>
                    <div className="text-xs text-muted">{inr(detail.order.amount)} · {String(detail.order.status).replace(/_/g, ' ')}{detail.order.estimatedDelivery ? ` · ETA ${detail.order.estimatedDelivery}` : ''}</div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {detail.payments.map((p) => <span key={p.id} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-ink-lighter">{p.id} · {inr(p.amount)} · {p.gatewayStatus}/{p.localStatus}</span>)}
                      {detail.refunds.map((r) => <span key={r.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${r.status === 'cancelled' ? NEUTRAL : OK}`}>Refund {r.id} · {inr(r.amount)} · {r.status}</span>)}
                    </div>
                  </div>
                ) : <p className="text-sm text-muted">No order linked to this complaint.</p>}
              </Box>
            </div>

            {c.status === 'investigating' && (
              <Box><div className="flex items-center gap-3 text-sm"><div className="w-5 h-5 rounded-full border-2 border-amber border-t-transparent animate-spin" /> Automatic investigation is running…</div></Box>
            )}
            {c.status === 'auto_resolved' && <div className="rounded-xl border border-verified/40 bg-verified-dim p-4"><div className="font-bold text-verified text-sm">Resolved automatically by the AI</div><div className="text-sm text-paper mt-0.5">{c.actionSummary || 'All automation gates passed.'}</div></div>}
            {c.status === 'resolved' && <div className="rounded-xl border border-verified/40 bg-verified-dim p-4"><div className="font-bold text-verified text-sm">Resolved{c.resolvedBy ? ` by ${c.resolvedBy}` : ''}</div></div>}
            {c.status === 'awaiting_customer' && <div className="rounded-xl border border-amber/40 bg-amber-dim p-4 text-sm"><b>Waiting for the customer</b> to choose an option from the offer.</div>}
            {c.status === 'needs_info' && <div className="rounded-xl border border-amber/40 bg-amber-dim p-4 text-sm"><b>Waiting for the customer to provide:</b> {c.infoRequest}</div>}

            {!inv && ['registered', 'human_review', 'needs_info', 'investigated'].includes(c.status) && (
              <Box title="Investigation">
                <p className="text-sm text-muted mb-3">This complaint has not been investigated yet.</p>
                <button type="button" onClick={() => runInvestigation(false)} disabled={running} className="bg-amber text-ink font-bold text-sm px-5 py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
                  {running ? 'Investigating… this takes a few seconds' : 'Investigate now'}
                </button>
                {runError && <p className="mt-3 text-sm font-semibold text-alert">{runError} <button type="button" onClick={() => runInvestigation(false)} className="underline cursor-pointer">Retry</button></p>}
              </Box>
            )}

            {inv && (
              <>
                <SafeBoundary key={c.auditId}><ResultPanel data={inv} /></SafeBoundary>
                <Gates automation={c.automation || inv.automation} />
                {['registered', 'human_review', 'needs_info', 'investigated'].includes(c.status) && (
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => runInvestigation(true)} disabled={running} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-strong cursor-pointer disabled:opacity-50">{running ? 'Re-running…' : 'Re-run investigation'}</button>
                    {runError && <span className="text-xs font-semibold text-alert">{runError}</span>}
                  </div>
                )}
              </>
            )}

            {canAct && (
              <Box title="Your decision">
                <p className="text-xs text-muted mb-3">The AI recommended <b className="text-paper">{String(rec || '').replace(/_/g, ' ').toLowerCase()}</b>. Every action here is recorded in the audit log under your name.</p>
                <div className="flex flex-wrap gap-2">
                  {rec === 'AUTO_RESOLVE' && btn('CONFIRM_AI', 'Confirm AI recommendation', 'bg-verified text-ink border-verified')}
                  {rec === 'CUSTOMER_CONFIRM' && btn('SEND_OFFER', 'Send offer to customer', 'bg-verified text-ink border-verified')}
                  {detail.order && btn('REFUND', 'Approve refund')}
                  {btn('NO_REFUND', 'Close without refund')}
                  {btn('REQUEST_INFO', 'Request more information')}
                </div>

                {mode && (
                  <div className="mt-4 space-y-3 max-w-xl">
                    {mode === 'REFUND' && (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Refund amount (max {detail.order ? inr(detail.order.amount) : '–'})</label>
                        <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
                      </div>
                    )}
                    {mode !== 'CONFIRM_AI' && mode !== 'SEND_OFFER' && (
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">{mode === 'REQUEST_INFO' ? 'What do you need from the customer? (required)' : 'Message to the customer (optional)'}</label>
                        <textarea rows={2} maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={input} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Internal note (optional)</label>
                      <textarea rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
                    </div>
                    {formError && <p className="text-sm font-semibold text-alert">{formError}</p>}
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={submit} className="bg-amber text-ink font-bold text-sm px-5 py-2.5 rounded-lg cursor-pointer disabled:opacity-50">{busy ? 'Saving…' : 'Confirm'}</button>
                      <button type="button" onClick={() => setMode(null)} className="text-sm font-semibold text-muted cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}
              </Box>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
              <button type="button" onClick={goList} className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-lg border border-border-strong cursor-pointer hover:bg-ink-lighter"><ArrowLeft className="w-4 h-4" /> Back to Complaints</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => top.current && top.current.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-semibold px-4 py-2.5 rounded-lg border border-border-strong cursor-pointer">View complaint details</button>
                <button type="button" disabled={!nextId} onClick={() => goTo2(nextId)} className="text-sm font-bold px-4 py-2.5 rounded-lg bg-amber text-ink disabled:opacity-40 cursor-pointer flex items-center gap-1.5">Next complaint <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </main>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="evidence" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
