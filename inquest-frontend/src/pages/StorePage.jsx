import { useEffect, useState, useCallback, useMemo } from 'react';
import { ShoppingBag, Truck, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { goTo } from '../auth/nav';
import { getShopProducts, placeShopOrder, getShopOrders, simulateShopOrder, getMyComplaints } from '../api/client';
import ChatWidget from '../components/customer/ChatWidget';
import MyComplaints from '../components/customer/MyComplaints';
import AccountMenu from '../components/customer/AccountMenu';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const MODES = [
  { id: 'normal', label: 'Normal payment', hint: 'One clean charge' },
  { id: 'double_charge', label: 'Double charge glitch', hint: 'Gateway charges the card twice (demo)' },
  { id: 'gateway_glitch', label: 'Debited but order failed', hint: 'Money cut, order never placed (demo)' },
];

const STATUS_STYLE = {
  in_transit: 'text-amber border-amber/40 bg-amber-dim',
  delivered: 'text-verified border-verified/40 bg-verified-dim',
  pending: 'text-alert border-alert/40 bg-alert-dim',
  cancelled: 'text-muted border-border-strong bg-ink-lighter',
  returned: 'text-muted border-border-strong bg-ink-lighter',
};

function suggestIssue(o) {
  if (o.status === 'pending') return 'failed';
  if ((o.payments || []).filter((p) => p.gatewayStatus === 'success').length > 1) return 'double';
  if (o.status === 'delivered') return 'damaged';
  if (o.status === 'in_transit') return 'delay';
  return 'other';
}

export default function StorePage() {
  const { customer, ready, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notice, setNotice] = useState(null);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [checkout, setCheckout] = useState(null);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState('normal');
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [preset, setPreset] = useState(null);
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [presenter, setPresenter] = useState(() => {
    try { return localStorage.getItem('inquest.presenter') === '1'; } catch { return false; }
  });

  const customerId = customer ? customer.id : null;

  const loadOrders = useCallback(async () => {
    if (!customerId) return;
    try { setOrders((await getShopOrders(customerId)).data || []); } catch (e) { setNotice({ ok: false, text: e.message || 'Could not load orders' }); }
  }, [customerId]);

  const loadComplaints = useCallback(async () => {
    if (!customerId) return;
    try { setComplaints((await getMyComplaints()).data || []); } catch { /* ignore */ }
  }, [customerId]);

  useEffect(() => { if (ready && !customer) goTo('/login?next=/store'); }, [ready, customer]);
  useEffect(() => { getShopProducts().then((r) => setProducts(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { loadOrders(); loadComplaints(); }, [loadOrders, loadComplaints]);
  useEffect(() => {
    const t = setInterval(() => { loadOrders(); loadComplaints(); }, 12000);
    return () => clearInterval(t);
  }, [loadOrders, loadComplaints]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);
  const shown = useMemo(() => products.filter((p) =>
    (category === 'All' || p.category === category) &&
    (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))), [products, category, search]);

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
      const res = await placeShopOrder({ customerId, productId: checkout.id, quantity: qty, paymentMode: presenter ? mode : 'normal' });
      setCheckout(null); setQty(1); setMode('normal');
      setNotice({ ok: true, text: `Order ${res.data.order.id} placed (${inr(res.data.order.amount)}).` });
      await loadOrders();
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'Payment failed' });
    } finally {
      setPlacing(false);
    }
  }

  async function sim(order, action) {
    setBusy(order.id + action);
    try { await simulateShopOrder(order.id, customerId, action); await loadOrders(); }
    catch (err) { setNotice({ ok: false, text: err.message || 'Action failed' }); }
    finally { setBusy(null); }
  }

  function helpWith(order) {
    setPreset({ orderId: order.id, issue: suggestIssue(order), ts: Date.now() });
    setChatOpen(true);
  }

  if (!customer) {
    return <div className="min-h-screen bg-ink text-paper flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  const actionNeeded = complaints.filter((c) => c.status === 'awaiting_you').length;
  const input = 'w-full bg-ink-lighter border border-border-strong rounded-lg px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-amber/50';

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="sticky top-0 z-40 border-b border-border backdrop-blur-md" style={{ background: 'var(--header-glass)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-bold">
            <ShoppingBag className="w-5 h-5 text-amber" />
            <span className="font-display text-lg tracking-tight">INQUEST Store</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted cursor-pointer select-none" title="Shows demo controls (payment and courier simulators)">
              <input type="checkbox" checked={presenter} onChange={togglePresenter} /> Presenter mode
            </label>
            <AccountMenu customer={customer} actionNeeded={actionNeeded}
              onOpenComplaints={() => { loadComplaints(); setComplaintsOpen(true); }}
              onLogout={async () => { await logout(); goTo('/'); }} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {notice && <p className={`text-sm font-semibold ${notice.ok ? 'text-verified' : 'text-alert'}`}>{notice.text}</p>}

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Products</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className={input + ' max-w-56'} />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${category === c ? 'bg-amber text-ink border-amber' : 'border-border-strong text-muted hover:text-paper'}`}>{c}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {shown.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-ink-light p-4 flex flex-col gap-2 shadow-2xs">
                <div className="text-4xl">{p.emoji}</div>
                <div className="font-bold text-sm leading-tight">{p.name}</div>
                <div className="text-[11px] text-muted flex-1">{p.blurb}</div>
                <div className="font-bold text-amber">{inr(p.price)}</div>
                <button type="button" onClick={() => { setCheckout(p); setQty(1); setMode('normal'); }}
                  className="bg-amber text-ink font-bold text-xs px-3 py-2 rounded-lg cursor-pointer">Buy now</button>
              </div>
            ))}
            {!shown.length && <p className="text-sm text-muted col-span-full">No products match your search.</p>}
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
                  <button type="button" onClick={() => helpWith(o)} className="text-xs font-semibold text-amber hover:underline cursor-pointer">Need help with this order?</button>
                  {presenter && (
                    <>
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted ml-3"><Truck className="w-3 h-3" /> Demo courier controls</span>
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
                      <span><span className="block text-sm font-semibold">{m.label}</span><span className="block text-[11px] text-muted">{m.hint}</span></span>
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

      <MyComplaints open={complaintsOpen} onClose={() => setComplaintsOpen(false)} complaints={complaints} reload={loadComplaints} />
      <ChatWidget customer={customer} orders={orders} open={chatOpen} setOpen={setChatOpen} preset={preset}
        onRegistered={() => { loadComplaints(); }} onOpenComplaints={() => { loadComplaints(); setComplaintsOpen(true); }} />
    </div>
  );
}
