import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getAnalytics, getRiskBoard } from '../../api/client';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const DEC = {
  AUTO_RESOLVE: { label: 'Auto', color: '#10B981' },
  CUSTOMER_CONFIRM: { label: 'Confirm', color: '#D97706' },
  HUMAN_ESCALATION: { label: 'Escalated', color: '#EF4444' },
};
const LVL = { LOW: '#10B981', MEDIUM: '#D97706', HIGH: '#EF4444' };

function Kpi({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-border bg-ink-light p-4 shadow-2xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div className="text-2xl font-bold" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-ink-light p-4 shadow-2xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">{title}</div>
      {children}
    </div>
  );
}

export default function AnalyticsView({ adminPassword }) {
  const [a, setA] = useState(null);
  const [risk, setRisk] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [ar, rr] = await Promise.all([getAnalytics({ adminPassword }), getRiskBoard({ adminPassword })]);
      setA(ar.data);
      setRisk(rr.data.customers || []);
    } catch (e) {
      setErr(e.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (err) return <p className="text-xs text-alert">{err}</p>;
  if (!a) return <p className="text-xs text-muted">Loading analytics…</p>;

  const t = a.totals;
  const split = ['AUTO_RESOLVE', 'CUSTOMER_CONFIRM', 'HUMAN_ESCALATION'].map((k) => ({
    k, n: k === 'AUTO_RESOLVE' ? t.autoResolved : k === 'CUSTOMER_CONFIRM' ? t.customerConfirm : t.humanEscalation,
  }));
  const policies = Object.entries(a.byPolicy).sort((x, y) => y[1] - x[1]);
  const maxPol = Math.max(1, ...policies.map((p) => p[1]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-paper">Analytics Dashboard</h2>
        <button type="button" onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-amber hover:underline cursor-pointer disabled:opacity-50">
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Kpi label="Auto-resolve rate" value={`${a.rates.autoResolvePct}%`} sub={`${t.autoResolved} of ${t.decisions} cases`} color="#10B981" />
        <Kpi label="Escalation rate" value={`${a.rates.escalationPct}%`} sub={`${t.humanEscalation} sent to humans`} color="#EF4444" />
        <Kpi label="Avg confidence" value={`${a.avgConfidence}%`} sub="across all decisions" />
        <Kpi label="Refunds initiated" value={a.actions.refundsInitiated} sub={`${inr(a.actions.refundValueInr)} · ${a.actions.refundsCancelledByOverride} cancelled by admin`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Kpi label="High-risk escalations" value={a.fraudSignals.highRiskEscalations} sub="blocked by risk score" color="#EF4444" />
        <Kpi label="Image-reuse hits" value={a.fraudSignals.imageReuseHits} sub={`of ${a.fraudSignals.photoClaims} photo claims`} color="#EF4444" />
        <Kpi label="Photo auto-resolved" value={a.fraudSignals.photoAutoResolved} sub="damage verified by evidence" color="#10B981" />
        <Kpi label="Admin overrides" value={a.overrides.total} sub={`${a.overrides.undo} undo · ${a.overrides.escalate} escalate · ${a.overrides.undoRateOfAutoResolvePct}% of auto-resolves undone`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Panel title="Decision split">
          <div className="flex h-3 rounded-full overflow-hidden bg-ink-lighter mb-3">
            {split.map((s) => (
              <div key={s.k} style={{ width: `${t.decisions ? (s.n / t.decisions) * 100 : 0}%`, background: DEC[s.k].color }} />
            ))}
          </div>
          <div className="flex gap-4 text-[11px]">
            {split.map((s) => (
              <span key={s.k} className="flex items-center gap-1.5 text-muted">
                <span className="w-2 h-2 rounded-full" style={{ background: DEC[s.k].color }} />
                {DEC[s.k].label}: <b className="text-paper">{s.n}</b>
              </span>
            ))}
          </div>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted mb-2">By policy</div>
          <div className="space-y-1.5">
            {policies.map(([p, n]) => (
              <div key={p} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 text-muted font-mono">{p}</span>
                <div className="flex-1 h-2 rounded bg-ink-lighter overflow-hidden">
                  <div className="h-full bg-amber" style={{ width: `${(n / maxPol) * 100}%` }} />
                </div>
                <span className="w-5 text-right font-bold text-paper">{n}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Customer risk board · suspicious repeat refunders">
          <div className="space-y-2">
            {risk.slice(0, 7).map((c) => (
              <div key={c.customerId} className="flex items-center gap-2.5 text-[11px]">
                <span className="w-28 truncate font-semibold text-paper">{c.name}</span>
                <span className="w-16 font-mono text-muted">{c.customerId}</span>
                <div className="flex-1 h-2 rounded bg-ink-lighter overflow-hidden">
                  <div className="h-full" style={{ width: `${c.score}%`, background: LVL[c.level] }} />
                </div>
                <span className="w-8 text-right font-bold" style={{ color: LVL[c.level] }}>{c.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            {a.suspiciousCustomers.length
              ? `${a.suspiciousCustomers.length} customer(s) at medium risk or above.`
              : 'No customer is currently at medium risk or above.'}
          </p>
        </Panel>
      </div>

      <Panel title="Recent AI decisions">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 pr-3">Audit</th><th className="pr-3">Time</th><th className="pr-3">Customer</th><th className="pr-3">Decision</th><th>Policy</th>
              </tr>
            </thead>
            <tbody>
              {a.recent.map((r) => (
                <tr key={r.auditId} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-mono">#{r.auditId}</td>
                  <td className="pr-3 text-muted">{new Date(r.ts).toLocaleString('en-IN')}</td>
                  <td className="pr-3">{r.customerId}</td>
                  <td className="pr-3 font-bold" style={{ color: DEC[r.decision]?.color }}>{DEC[r.decision]?.label || r.decision}</td>
                  <td className="font-mono">{r.policy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
