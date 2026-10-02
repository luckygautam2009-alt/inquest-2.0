import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ShoppingBag, Truck, X, Plus, AlertTriangle } from 'lucide-react';
import {
  getCustomers, createCustomer, getShopProducts, placeShopOrder, getShopOrders, simulateShopOrder,
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
  { key: 'delay', label: 'Order is delayed', text: (o) => `mera order ${o.id} abhi tak nahi aaya, delivery date nikal gayi` },
  { key: 'refund', label: 'Where is my refund?', text: (o) => `where is my refund for order ${o.id}` },
];

const STATUS_STYLE = {
  in_transit: 'text-amber border-amber/40 bg-amber-dim',
  delivered: 'text-verified border-verified/40 bg-verified-dim',
  pending: 'text-alert border-alert/40 bg-alert-dim',
  cancelled: 'text-muted border-border-strong bg-ink-lighter',
  returned: 'text-muted border-border-strong bg-ink-lighter',
};

const STEPS = ['Shop & pay', 'Report a problem', 'Inquest investigates', 'Auto-action + audit', 'Admin override'];

export default function StorePage({ onBack, onReport }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(() => {
    try { return localStorage.getItem('inquest.shopper') || ''; } catch { return ''; }
  });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [checkout, setCheckout] = useState(null);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState('normal');
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [reportFor, setReportFor] = useState(null);
  const [busy, setBusy] = useState(null);

  const loadCustomers = useCallback(async (selectId) => {
    try {
      const res = await getCustomers();
      const list = res.data || [];
      setCustomers(list);
      setCustomerId((cur) => {
        if (selectId) return selectId;
        if (cur && list.some((c) => c.id === cur)) return cur;
        return list.length ? list[0].id : '';
      });
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'Could not load customers' });
    }
  }, []);

  const loadOrders = useCallback(async (id) => {
    if (!id) { setOrders([]); return; }
    try {
      const res = await getShopOrders(id);
      setOrders(res.data || []);
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'Could not load orders' });
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    getShopProducts().then((r) => setProducts(r.data || [])).catch(() => {});
  }, [loadCustomers]);

  useEffect(() => {
    try { if (customerId) localStorage.setItem('inquest.shopper', customerId); } catch { /* ignore */ }
    loadOrders(customerId);
  }, [customerId, loadOrders]);

  async function addCustomer(e) {
    e.preventDefault();
    if (newName.trim().length < 2 || !newEmail.trim()) { setNotice({ ok: false, text: 'Name and a valid email are required.' }); return; }
    try {
      const res = await createCustomer({ name: newName.trim(), email: newEmail.trim(), tier: 'silver' });
      const created = res.data.customer || res.data;
      setNewName(''); setNewEmail(''); setShowNew(false);
      await loadCustomers(created.id);
      setNotice({ ok: true, text: `Customer ${created.id} created.` });
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Could not create customer' });
    }
  }

  async function pay() {
    if (!customerId || !checkout) return;
    setPlacing(true);
    setNotice(null);
    try {
      const res = await placeShopOrder({ customerId, productId: checkout.id, quantity: qty, paymentMode: mode });
      const { order, payments } = res.data;
      setCheckout(null); setQty(1); setMode('normal');
      setNotice({ ok: true, text: `Order ${order.id} placed (${inr(order.amount)}), ${payments.length} payment record(s) saved to the database.` });
      await loadOrders(customerId);
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
      await loadOrders(customerId);
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Action failed' });
    } finally {
      setBusy(null);
    }
  }

  const me = customers.find((c) => c.id === customerId);

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="sticky top-0 z-40 border-b border-border backdrop-blur-md" style={{ background: 'var(--header-glass)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <button type="button" onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-paper hover:text-amber cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Inquest
          </button>
          <div className="flex items-center gap-2 font-bold">
            <ShoppingBag className="w-5 h-5 text-amber" /> Live Demo Store
          </div>
          <span className="text-xs text-muted hidden sm:block">Orders here are saved to the real Inquest database</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Pitch flow strip */}
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

        {/* Customer */}
        <section className="rounded-xl border border-border bg-ink-light p-4 flex flex-wrap items-end gap-4">
          <div className="min-w-60">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Shopping as</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper">
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.id} ({String(c.tier).toUpperCase()})</option>)}
            </select>
          </div>
          <button type="button" onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber cursor-pointer hover:underline pb-2">
            <Plus className="w-3.5 h-3.5" /> New customer
          </button>
          {showNew && (
            <form onSubmit={addCustomer} className="flex flex-wrap gap-2 items-end">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name"
                className="bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper" />
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" type="email"
                className="bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper" />
              <button type="submit" className="bg-amber text-ink font-bold text-xs px-4 py-2.5 rounded-lg cursor-pointer">Create</button>
            </form>
          )}
        </section>

        {notice && (
          <p className={`text-sm font-semibold ${notice.ok ? 'text-verified' : 'text-alert'}`}>{notice.text}</p>
        )}

        {/* Products */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">Products</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-ink-light p-4 flex flex-col gap-2 shadow-2xs">
                <div className="text-4xl">{p.emoji}</div>
                <div className="font-bold text-sm leading-tight">{p.name}</div>
                <div className="text-[11px] text-muted flex-1">{p.blurb}</div>
                <div className="font-bold text-amber">{inr(p.price)}</div>
                <button type="button" disabled={!customerId} onClick={() => { setCheckout(p); setQty(1); setMode('normal'); }}
                  className="bg-amber text-ink font-bold text-xs px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50">
                  Buy now
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Orders */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">
            My orders {me ? `· ${me.name}` : ''}
          </h2>
          {!orders.length && <p className="text-sm text-muted">No orders yet. Buy something above to start the flow.</p>}
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
                      {p.id} · {inr(p.amount)} · gateway <b>{p.gatewayStatus}</b> / local <b>{p.localStatus}</b>
                    </span>
                  ))}
                  {o.refunds.map((r) => (
                    <span key={r.id} className={`px-2 py-1 rounded-md border font-semibold ${r.status === 'cancelled' ? 'text-muted border-border-strong' : 'text-verified border-verified/40 bg-verified-dim'}`}>
                      Refund {r.id} · {inr(r.amount)} · {r.status}
                    </span>
                  ))}
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-3 border-t border-border">
                  <div className="relative">
                    <button type="button" onClick={() => setReportFor(reportFor === o.id ? null : o.id)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-alert-dim border border-alert/40 text-alert cursor-pointer">
                      <AlertTriangle className="w-3.5 h-3.5" /> Report a problem
                    </button>
                    {reportFor === o.id && (
                      <div className="absolute z-20 mt-1.5 w-72 rounded-xl border border-border-strong bg-ink-light shadow-lg p-1.5">
                        {ISSUES.map((i) => (
                          <button key={i.key} type="button"
                            onClick={() => onReport({ customerId, text: i.text(o) })}
                            className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-ink-lighter cursor-pointer">
                            {i.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted ml-2">
                    <Truck className="w-3 h-3" /> Demo courier controls
                  </span>
                  {o.status === 'in_transit' && (
                    <>
                      <button type="button" disabled={!!busy} onClick={() => sim(o, 'deliver')}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Mark delivered</button>
                      <button type="button" disabled={!!busy} onClick={() => sim(o, 'delay')}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Simulate delay</button>
                    </>
                  )}
                  {(o.status === 'in_transit' || o.status === 'pending') && (
                    <button type="button" disabled={!!busy} onClick={() => sim(o, 'cancel')}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md border border-border-strong cursor-pointer disabled:opacity-50">Cancel order</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Checkout modal */}
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
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))}
              className="w-full bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm mb-4">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

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

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-xl font-bold text-amber">{inr(checkout.price * qty)}</span>
            </div>
            <button type="button" onClick={pay} disabled={placing}
              className="w-full bg-amber text-ink font-bold py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
              {placing ? 'Processing payment…' : `Pay ${inr(checkout.price * qty)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
