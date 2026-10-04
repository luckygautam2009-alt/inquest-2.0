import { useEffect, useState, useCallback } from 'react';
import { ShoppingBag, Truck, X, AlertTriangle, Camera, LogOut, User, Check } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { goTo } from '../auth/nav';
import {
  getShopProducts, placeShopOrder, getShopOrders, simulateShopOrder, submitComplaint, confirmProposal,
} from '../api/client';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const MODES = [
  { id: 'normal', label: 'Normal payment', hint: 'One clean charge' },
  { id: 'double_charge', label: 'Double charge glitch', hint: 'Gateway charges the card twice (demo)' },
  { id: 'gateway_glitch', label: 'Debited but order failed', hint: 'Money cut, order never placed (demo)' },
];

const ISSUES = [
  { key: 'double', label: 'I was charged twice', text: (o) => `bhai payment 2 baar kat gyi order ${o.id}, please jaldi fix karo` },
  { key: 'failed', label: 'Money deducted but order failed', text: (o) => `payment kat gya but my order ${o.id} did not go through, please refund` },
  { key: 'damaged', label: 'Item arrived damaged', text: (o) => `my order ${o.id} ${o.product} arrived with a cracked broken part, please refund` },
  { key: 'delay', label: 'My order is delayed', text: (o) => `mera order ${o.id} abhi tak nahi aaya, delivery date nikal gayi` },
  { key: 'refund', label: 'Where is my refund?', text: (o) => `where is my refund for order ${o.id}` },
  { key: 'other', label: 'Something else', text: () => '' },
];

const STATUS_STYLE = {
  in_transit: 'text-amber border-amber/40 bg-amber-dim',
  delivered: 'text-verified border-verified/40 bg-verified-dim',
  pending: 'text-alert border-alert/40 bg-alert-dim',
  cancelled: 'text-muted border-border-strong bg-ink-lighter',
  returned: 'text-muted border-border-strong bg-ink-lighter',
};

const STEPS = ['Shop & pay', 'Report a problem', 'Inquest investigates', 'Auto-action + audit', 'Admin override'];

function suggestIssue(o) {
  if (o.status === 'pending') return 'failed';
  if ((o.payments || []).filter((p) => p.gatewayStatus === 'success').length > 1) return 'double';
  if (o.status === 'delivered') return 'damaged';
  if (o.status === 'in_transit') return 'delay';
  return 'other';
}

export default function StorePage({ onOpenConsole }) {
  const { customer, ready, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState('normal');
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [presenter, setPresenter] = useState(() => {
    try { return localStorage.getItem('inquest.presenter') === '1'; } catch { return false; }
  });

  // complaint popup
  const [report, setReport] = useState(null);
  const [issue, setIssue] = useState('other');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [confirmState, setConfirmState] = useState({ busy: null, message: null, error: null });

  const customerId = customer ? customer.id : null;

  const loadOrders = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await getShopOrders(customerId);
      setOrders(res.data || []);
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'Could not load orders' });
    }
  }, [customerId]);

  useEffect(() => {
    if (ready && !customer) goTo('/login?next=/store');
  }, [ready, customer]);

  useEffect(() => {
    getShopProducts().then((r) => setProducts(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  function togglePresenter() {
    const next = !presenter;
    setPresenter(next);
    try { localStorage.setItem('inquest.presenter', next ? '1' : '0'); } catch { /* ignore */ }
  }

  async function pay() {
    if (!customerId || !checkout) return;
    setPlacing(true);
    setNotice(null);
    try {
      const res = await placeShopOrder({ customerId, productId: checkout.id, quantity: qty, paymentMode: mode });
      const { order } = res.data;
      setCheckout(null); setQty(1); setMode('normal');
      setNotice({ ok: true, text: `Order ${order.id} placed (${inr(order.amount)}).` });
      await loadOrders();
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Payment failed' });
    } finally {
      setPlacing(false);
    }
  }

  async function sim(order, action) {
    setBusy(order.id + action);
    try {
      await simulateShopOrder(order.id, customerId, action);
      await loadOrders();
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Action failed' });
    } finally {
      setBusy(null);
    }
  }

  // ---- complaint popup ----
  function openReport(order) {
    const key = suggestIssue(order);
    setReport(order);
    setIssue(key);
    setText(ISSUES.find((i) => i.key === key).text(order));
    setPhotos([]); setPhotoError(null); setFormError(null); setOutcome(null);
    setConfirmState({ busy: null, message: null, error: null });
  }

  function closeReport() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setReport(null); setPhotos([]); setOutcome(null);
    loadOrders();
  }

  function changeIssue(key) {
    setIssue(key);
    setText(ISSUES.find((i) => i.key === key).text(report));
  }

  function pickPhotos(e) {
    setPhotoError(null);
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    const next = [...photos];
    for (const file of picked) {
      if (!file.type.startsWith('image/')) { setPhotoError('Only image files are allowed.'); continue; }
      if (file.size > 5 * 1024 * 1024) { setPhotoError('Each photo must be under 5 MB.'); continue; }
      if (next.length >= 3) { setPhotoError('You can attach up to 3 photos.'); break; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
  }

  function removePhoto(i) {
    URL.revokeObjectURL(photos[i].url);
    setPhotos(photos.filter((_, idx) => idx !== i));
  }

  async function submitReport() {
    setFormError(null);
    let finalText = text.trim();
    if (finalText.length < 8) { setFormError('Please describe the problem (at least 8 characters).'); return; }
    if (!finalText.includes(report.id)) finalText = `order ${report.id}: ${finalText}`;
    setSubmitting(true);
    try {
      const res = await submitComplaint(customerId, finalText, photos.map((p) => p.file));
      setOutcome(res.data);
      loadOrders();
    } catch (err) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function answerProposal(proposal, choice, inModal) {
    setConfirmState({ busy: choice, message: null, error: null });
    try {
      const res = await confirmProposal({ auditId: proposal.auditId, customerId: proposal.customerId, choice });
      setConfirmState({ busy: null, message: res.data.message, error: null });
      await loadOrders();
      if (!inModal) setNotice({ ok: true, text: res.data.message });
    } catch (err) {
      setConfirmState({ busy: null, message: null, error: err.message || 'Could not record your choice' });
      if (!inModal) setNotice({ ok: false, text: err.message || 'Could not record your choice' });
    }
  }

  if (!customer) {
    return <div className="min-h-screen bg-ink text-paper flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  const input = 'w-full bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-amber/50';

  function ComplaintChip({ o }) {
    const c = o.complaint || { status: 'none' };
    if (c.status === 'none') {
      return (
        <button type="button" onClick={() => openReport(o)}
          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-alert-dim border border-alert/40 text-alert cursor-pointer">
          <AlertTriangle className="w-3.5 h-3.5" /> Report a problem
        </button>
      );
    }
    if (c.status === 'resolved') {
      return (
        <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg bg-verified-dim border border-verified/40 text-verified">
          <Check className="w-4 h-4 shrink-0" />
          <div><div className="font-bold">{c.label}</div><div className="font-medium">{c.detail}</div></div>
        </div>
      );
    }
    if (c.status === 'in_review') {
      return (
        <div className="text-xs px-3 py-2 rounded-lg bg-ink-lighter border border-border-strong text-muted">
          <div className="font-bold text-paper">{c.label}</div>
          <div>Case #{c.auditId}. We will update this order as soon as we have an answer.</div>
        </div>
      );
    }
    if (c.status === 'answered') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs px-3 py-2 rounded-lg bg-ink-lighter border border-border-strong max-w-md">
            <div className="font-bold text-paper">We checked your order</div>
            <div className="text-muted">{c.detail}</div>
          </div>
          <button type="button" onClick={() => openReport(o)}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-alert-dim border border-alert/40 text-alert cursor-pointer">
            <AlertTriangle className="w-3.5 h-3.5" /> Report again
          </button>
        </div>
      );
    }
    return (
      <div className="w-full rounded-lg border border-amber/40 bg-amber-dim p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber mb-1">Action needed</div>
        <p className="text-sm text-paper mb-2.5">{c.proposal.summary}</p>
        <div className="flex flex-wrap gap-2">
          {c.proposal.options.map((opt) => (
            <button key={opt.key} type="button" disabled={!!confirmState.busy} onClick={() => answerProposal(c.proposal, opt.key, false)}
              className={`text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer disabled:opacity-50 ${opt.key === 'DECLINE' ? 'border border-border-strong text-muted' : 'bg-amber text-ink'}`}>
              {confirmState.busy === opt.key ? 'Saving…' : opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function OutcomeView() {
    const d = outcome.decision.decision;
    const a = outcome.actions || {};
    const p = outcome.proposal;
    const v = outcome.customerView;
    return (
      <div className="space-y-4">
        {d === 'AUTO_RESOLVE' && v && v.status === 'answered' && (
          <div className="rounded-xl border border-border-strong bg-ink-lighter p-4">
            <div className="font-bold text-paper mb-1">We checked your order</div>
            <p className="text-sm text-muted">{v.detail}</p>
          </div>
        )}
        {d === 'AUTO_RESOLVE' && (!v || v.status === 'resolved') && (
          <div className="rounded-xl border border-verified/40 bg-verified-dim p-4">
            <div className="flex items-center gap-2 font-bold text-verified mb-1"><Check className="w-4 h-4" /> Resolved</div>
            <p className="text-sm text-paper">
              {a.refund
                ? `Refund ${a.refund.id} of ${inr(a.refund.amount)} has been initiated. It should reach your account in 5 to 7 business days.`
                : a.skipped === 'ALREADY_REFUNDED' || a.skipped === 'REFUND_ALREADY_EXISTS'
                  ? 'A refund has already been issued for this order.'
                  : 'We checked your order and your issue is resolved.'}
            </p>
          </div>
        )}
        {d === 'CUSTOMER_CONFIRM' && p && (
          <div className="rounded-xl border border-amber/40 bg-amber-dim p-4">
            <div className="font-bold text-amber mb-1">We need your confirmation</div>
            <p className="text-sm text-paper mb-3">{p.summary}</p>
            {confirmState.message ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-verified"><Check className="w-4 h-4" /> {confirmState.message}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {p.options.map((opt) => (
                  <button key={opt.key} type="button" disabled={!!confirmState.busy} onClick={() => answerProposal(p, opt.key, true)}
                    className={`text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer disabled:opacity-50 ${opt.key === 'DECLINE' ? 'border border-border-strong text-muted' : 'bg-amber text-ink'}`}>
                    {confirmState.busy === opt.key ? 'Saving…' : opt.label}
                  </button>
                ))}
              </div>
            )}
            {confirmState.error && <p className="mt-2 text-xs font-semibold text-alert">{confirmState.error}</p>}
          </div>
        )}
        {(d === 'HUMAN_ESCALATION' || (d === 'CUSTOMER_CONFIRM' && !p)) && (
          <div className="rounded-xl border border-border-strong bg-ink-lighter p-4">
            <div className="font-bold text-paper mb-1">Our team is reviewing this</div>
            <p className="text-sm text-muted">Your case #{outcome.auditId} has been passed to a support specialist. Your order will be updated as soon as we have an answer.</p>
          </div>
        )}
        {presenter && (
          <button type="button" onClick={() => { closeReport(); onOpenConsole(outcome); }}
            className="text-xs font-bold text-amber hover:underline cursor-pointer">
            Presenter: open the full investigation →
          </button>
        )}
        <button type="button" onClick={closeReport} className="w-full bg-amber text-ink font-bold py-2.5 rounded-lg cursor-pointer">Done</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="sticky top-0 z-40 border-b border-border backdrop-blur-md" style={{ background: 'var(--header-glass)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-bold">
            <ShoppingBag className="w-5 h-5 text-amber" />
            <span className="font-display text-lg tracking-tight">INQUEST Store</span>
          </div>
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted cursor-pointer select-none" title="Shows demo controls and a link to the full investigation">
              <input type="checkbox" checked={presenter} onChange={togglePresenter} /> Presenter mode
            </label>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-verified-dim border border-verified/40 text-xs font-semibold text-verified">
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{customer.name.split(' ')[0]} · {customer.id}</span>
              <button type="button" onClick={async () => { await logout(); goTo('/'); }} title="Sign out" aria-label="Sign out" className="cursor-pointer ml-1">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {presenter && (
          <div className="flex flex-wrap gap-2 items-center text-[11px]">
            {STEPS.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border-strong bg-ink-light font-semibold">
                  <span className="w-4 h-4 rounded-full bg-amber text-ink text-[10px] flex items-center justify-center font-bold">{i + 1}</span>{s}
                </span>
                {i < STEPS.length - 1 && <span className="text-muted">→</span>}
              </span>
            ))}
          </div>
        )}

        {notice && <p className={`text-sm font-semibold ${notice.ok ? 'text-verified' : 'text-alert'}`}>{notice.text}</p>}

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">Products</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-ink-light p-4 flex flex-col gap-2 shadow-2xs">
                <div className="text-4xl">{p.emoji}</div>
                <div className="font-bold text-sm leading-tight">{p.name}</div>
                <div className="text-[11px] text-muted flex-1">{p.blurb}</div>
                <div className="font-bold text-amber">{inr(p.price)}</div>
                <button type="button" onClick={() => { setCheckout(p); setQty(1); setMode('normal'); }}
                  className="bg-amber text-ink font-bold text-xs px-3 py-2 rounded-lg cursor-pointer">Buy now</button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">My orders</h2>
          {!orders.length && <p className="text-sm text-muted">No orders yet. Buy something above to get started.</p>}
          <div className="space-y-3.5">
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-ink-light p-4 shadow-2xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{o.id} · {o.product}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {inr(o.amount)}
                      {o.courierTracking ? ` · ${o.courierTracking}` : ''}
                      {o.estimatedDelivery ? ` · ETA ${o.estimatedDelivery}` : ''}
                      {o.courierStatus ? ` · ${o.courierStatus}` : ''}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border ${STATUS_STYLE[o.status] || STATUS_STYLE.cancelled}`}>
                    {String(o.status).replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {o.payments.map((p) => (
                    <span key={p.id} className="px-2 py-1 rounded-md border border-border bg-ink-lighter">
                      {p.id} · {inr(p.amount)}{presenter ? ` · gateway ${p.gatewayStatus} / local ${p.localStatus}` : ` · ${p.localStatus === 'success' ? 'paid' : 'failed'}`}
                    </span>
                  ))}
                  {o.refunds.map((r) => (
                    <span key={r.id} className={`px-2 py-1 rounded-md border font-semibold ${r.status === 'cancelled' ? 'text-muted border-border-strong' : 'text-verified border-verified/40 bg-verified-dim'}`}>
                      Refund {r.id} · {inr(r.amount)} · {r.status}
                    </span>
                  ))}
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-3 border-t border-border">
                  <ComplaintChip o={o} />
                  {presenter && (
                    <>
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted ml-2">
                        <Truck className="w-3 h-3" /> Demo courier controls
                      </span>
                      {o.status === 'in_transit' && (
                        <>
                          <button type="button" disabled={!!busy} onClick={() => sim(o, 'deliver')} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Mark delivered</button>
                          <button type="button" disabled={!!busy} onClick={() => sim(o, 'delay')} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Simulate delay</button>
                        </>
                      )}
                      {(o.status === 'in_transit' || o.status === 'pending') && (
                        <button type="button" disabled={!!busy} onClick={() => sim(o, 'cancel')} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Cancel order</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {checkout && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-strong bg-ink-light p-5 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Checkout</div>
                <div className="font-bold text-lg">{checkout.emoji} {checkout.name}</div>
              </div>
              <button type="button" onClick={() => setCheckout(null)} aria-label="Close" className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Quantity</label>
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className={input + ' mb-4'}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {presenter ? (
              <>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Payment simulator (demo)</div>
                <div className="space-y-1.5 mb-4">
                  {MODES.map((m) => (
                    <label key={m.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer ${mode === m.id ? 'border-amber bg-amber-dim' : 'border-border'}`}>
                      <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-1" />
                      <span>
                        <span className="block text-sm font-semibold">{m.label}</span>
                        <span className="block text-[11px] text-muted">{m.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted mb-4">Secure payment. You will be charged once.</p>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-xl font-bold text-amber">{inr(checkout.price * qty)}</span>
            </div>
            <button type="button" onClick={pay} disabled={placing} className="w-full bg-amber text-ink font-bold py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {placing ? 'Processing payment…' : `Pay ${inr(checkout.price * qty)}`}
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border-strong bg-ink-light p-5 shadow-xl my-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Report a problem</div>
                <div className="font-bold">{report.id} · {report.product}</div>
              </div>
              {!submitting && <button type="button" onClick={closeReport} aria-label="Close" className="cursor-pointer"><X className="w-4 h-4" /></button>}
            </div>

            {outcome ? <OutcomeView /> : submitting ? (
              <div className="py-10 text-center">
                <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-amber border-t-transparent animate-spin" />
                <div className="font-semibold">Investigating your complaint…</div>
                <p className="text-xs text-muted mt-1">We are checking your order, payments and photos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">What went wrong?</label>
                  <select value={issue} onChange={(e) => changeIssue(e.target.value)} className={input}>
                    {ISSUES.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Tell us more</label>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
                    placeholder="Describe the problem (Hindi, English or Hinglish)" className={input} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <Camera className="w-3.5 h-3.5 text-amber" /> Photos <span className="normal-case font-medium">(optional, up to 3)</span>
                    </span>
                    {photos.length < 3 && (
                      <label className="text-xs font-semibold text-amber cursor-pointer hover:underline">
                        + Add photo
                        <input type="file" accept="image/*" multiple className="hidden" onChange={pickPhotos} />
                      </label>
                    )}
                  </div>
                  {photos.length > 0 && (
                    <div className="flex gap-2.5 flex-wrap">
                      {photos.map((p, i) => (
                        <div key={p.url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border-strong">
                          <img src={p.url} alt={`evidence ${i + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo"
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoError && <p className="text-xs text-alert font-semibold mt-1.5">{photoError}</p>}
                </div>
                {formError && <p className="text-sm font-semibold text-alert">{formError}</p>}
                <button type="button" onClick={submitReport} className="w-full bg-amber text-ink font-bold py-2.5 rounded-lg cursor-pointer">Submit</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
