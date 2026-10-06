import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { getAdminComplaints, setAutoMode } from '../../api/client';
import { goTo } from '../../auth/nav';

const OK = 'text-verified border-verified/40 bg-verified-dim';
const WARN = 'text-amber border-amber/40 bg-amber-dim';
const BAD = 'text-alert border-alert/40 bg-alert-dim';
const NEUTRAL = 'text-muted border-border-strong bg-ink-lighter';

const STATUS = {
  registered: ['New', NEUTRAL],
  investigating: ['Investigating…', WARN],
  auto_resolved: ['Auto-resolved', OK],
  human_review: ['Human review', BAD],
  investigated: ['Review needed', BAD],
  needs_info: ['Needs customer info', WARN],
  awaiting_customer: ['Awaiting customer', WARN],
  resolved: ['Resolved', OK],
};
const DECISION = { AUTO_RESOLVE: 'Auto resolve', CUSTOMER_CONFIRM: 'Offer to customer', HUMAN_ESCALATION: 'Escalate', NEEDS_INFO: 'Needs info' };
const FILTERS = [['all', 'All'], ['new', 'New'], ['auto_resolved', 'Auto resolved'], ['attention', 'Human review'], ['needs_info', 'Needs customer info'], ['awaiting_customer', 'Awaiting customer'], ['resolved', 'Resolved']];

const countFor = (key, c) => {
  if (!c) return 0;
  if (key === 'all') return c.all;
  if (key === 'new') return c.registered + c.investigating;
  if (key === 'attention') return c.human_review + c.investigated;
  return c[key] || 0;
};

function Card({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-ink-light p-4 shadow-2xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div className={`text-2xl font-bold ${tone || ''}`}>{value}</div>
    </div>
  );
}

export default function ComplaintsView() {
  const params = new URLSearchParams(window.location.search);
  const [status, setStatus] = useState(params.get('status') || 'all');
  const [search, setSearch] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminComplaints({ status, search });
      setData(res.data);
      setErr(null);
    } catch (e) {
      setErr(e.message || 'Could not load complaints');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
    const q = new URLSearchParams({ view: 'complaints' });
    if (status !== 'all') q.set('status', status);
    if (search) q.set('q', search);
    window.history.replaceState({}, '', '/admin?' + q.toString());
    return () => clearTimeout(timer.current);
  }, [status, search, load]);

  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setAutoMode().then((r) => setAuto(r.data.autoInvestigate)).catch(() => {});
  }, []);

  async function toggleAuto() {
    try {
      const r = await setAutoMode(!auto);
      setAuto(r.data.autoInvestigate);
    } catch (e) {
      setErr(e.message || 'Could not change the automation setting');
    }
  }

  function open(c, list) {
    try { sessionStorage.setItem('inquest.complaintQueue', JSON.stringify(list.map((x) => x.id))); } catch { /* ignore */ }
    goTo(`/admin/complaints/${c.id}?back=${encodeURIComponent(window.location.search)}`);
  }

  const rows = data ? data.complaints : [];
  const counts = data ? data.counts : null;
  const sum = data ? data.summary : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-paper">Complaints</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-[11px] font-semibold text-muted cursor-pointer select-none" title="When ON, every new complaint is investigated and, if all safety gates pass, resolved automatically">
            <button type="button" role="switch" aria-checked={!!auto} onClick={toggleAuto} disabled={auto === null}
              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${auto ? 'bg-verified' : 'bg-border-strong'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${auto ? 'left-4.5' : 'left-0.5'}`} />
            </button>
            Auto-investigate &amp; resolve {auto ? 'ON' : 'OFF'}
          </label>
          <button type="button" onClick={load} disabled={loading} className="flex items-center gap-1.5 text-[11px] font-semibold text-amber hover:underline cursor-pointer disabled:opacity-50">
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {err && <p className="text-xs font-semibold text-alert">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card label="Total complaints" value={sum ? sum.total : '–'} />
        <Card label="Automatically resolved" value={sum ? sum.autoResolved : '–'} tone="text-verified" />
        <Card label="Pending human review" value={sum ? sum.pendingHumanReview : '–'} tone="text-alert" />
        <Card label="Awaiting customer" value={sum ? sum.awaitingCustomerInfo : '–'} tone="text-amber" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStatus(key)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${status === key ? 'bg-amber text-ink border-amber' : 'border-border-strong text-muted hover:text-paper'}`}>
              {label} <span className="opacity-70">({countFor(key, counts)})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search id, customer, order, text"
            className="bg-ink-inset border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-paper w-64 focus:outline-none focus:ring-1 focus:ring-amber/50" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-ink-light overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              {['ID', 'Customer', 'Order', 'Category', 'Registered', 'Status', 'AI decision', 'Conf.', 'Resolution', ''].map((h) => <th key={h} className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const st = STATUS[c.status] || [c.status, NEUTRAL];
              const review = ['human_review', 'investigated'].includes(c.status);
              return (
                <tr key={c.id} onClick={() => open(c, rows)} className="border-b border-border/60 last:border-0 hover:bg-ink-lighter/60 cursor-pointer">
                  <td className="px-3 py-2.5 font-mono font-bold">#{c.id}</td>
                  <td className="px-3 py-2.5"><div className="font-semibold text-paper">{c.customerName || '–'}</div><div className="font-mono text-muted">{c.customerId}</div></td>
                  <td className="px-3 py-2.5"><div className="font-mono">{c.orderId || '–'}</div><div className="text-muted">{c.product || ''}</div></td>
                  <td className="px-3 py-2.5 capitalize">{(c.issueKey || 'other').replace(/_/g, ' ')}{c.photoCount ? <span className="ml-1.5 text-muted">· {c.photoCount} photo{c.photoCount > 1 ? 's' : ''}</span> : null}</td>
                  <td className="px-3 py-2.5 text-muted whitespace-nowrap">{new Date(c.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5"><span className={`px-2 py-1 rounded-full border font-bold whitespace-nowrap ${st[1]}`}>{st[0]}</span></td>
                  <td className="px-3 py-2.5 font-semibold">{c.decision ? (DECISION[c.decision] || c.decision) : '–'}</td>
                  <td className="px-3 py-2.5 font-mono">{c.confidence != null ? `${Math.round(c.confidence)}%` : '–'}</td>
                  <td className="px-3 py-2.5 text-muted max-w-56 truncate" title={c.actionSummary || c.decisionReason || ''}>{c.actionSummary || c.infoRequest || c.decisionReason || '–'}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); open(c, rows); }}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer ${review ? 'bg-amber text-ink' : 'border border-border-strong text-paper'}`}>
                      {review ? 'Review' : ['registered'].includes(c.status) ? 'Investigate' : 'View'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted">{data ? 'No complaints match this filter.' : 'Loading…'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
