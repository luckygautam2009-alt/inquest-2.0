import { useEffect, useState } from 'react';
import { RotateCcw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getAuditLog, overrideDecision } from '../../api/client';

const DEC_COLOR = {
  AUTO_RESOLVE: '#10B981', CUSTOMER_CONFIRM: '#D97706', HUMAN_ESCALATION: '#EF4444',
  OVERRIDE_UNDO: '#8B5CF6', OVERRIDE_ESCALATE: '#8B5CF6',
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function Detail({ e }) {
  const ev = e.evidence || {};
  const ac = e.actions || {};
  const lines = [];
  if (e.complaintText) lines.push(['Complaint', e.complaintText]);
  if (e.reasoning) lines.push([e.entryType === 'OVERRIDE' ? 'Admin reason' : 'Reasoning', e.reasoning]);
  if (ev.orderId) lines.push(['Order', `${ev.orderId} (verified: ${ev.orderVerified ? 'yes' : 'no'})`]);
  if (ev.risk) lines.push(['Risk', `${ev.risk.score}/100 ${ev.risk.level}`]);
  if (ev.photo) lines.push(['Photo', `${ev.photo.provided} received · reused: ${ev.photo.reuse?.detected ? 'YES' : 'no'}${ev.photo.vision ? ` · vision ${ev.photo.vision.confidence}%` : ''}`]);
  if (ev.originalDecision) lines.push(['Original AI decision', ev.originalDecision]);
  if (ac.refund) lines.push(['Refund', `${ac.refund.id} · ${inr(ac.refund.amount)} · ${ac.refund.status}`]);
  if (ac.ticket) lines.push(['Ticket', `${ac.ticket.id} · ${ac.ticket.status}`]);
  if (ac.skipped) lines.push(['Skipped', ac.skipped]);
  if (ac.refundCancelled) lines.push(['Refund cancelled', ac.refundCancelled]);
  if (ac.ticketReopened) lines.push(['Ticket reopened', ac.ticketReopened]);
  if (ac.ticketCreated) lines.push(['Ticket created', ac.ticketCreated]);
  lines.push(['Hash', `${e.hash.slice(0, 20)}… (prev ${e.prevHash === 'GENESIS' ? 'GENESIS' : e.prevHash.slice(0, 10) + '…'})`]);
  return (
    <div className="space-y-1 text-[11px]">
      {lines.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="w-28 shrink-0 text-muted">{k}</span>
          <span className="text-paper break-words min-w-0">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogView({ adminPassword, adminName, adminEmail, onChanged }) {
  const [entries, setEntries] = useState([]);
  const [chain, setChain] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null); // { id, type }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await getAuditLog({ adminPassword, limit: 100 });
      setEntries(res.data.entries);
      setChain(res.data.chain);
    } catch (e) {
      setErr(e.message || 'Could not load audit log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const overridden = new Set(entries.filter((e) => e.entryType === 'OVERRIDE').map((e) => e.refId));

  async function submitOverride() {
    setBusy(true);
    setMsg(null);
    try {
      await overrideDecision({
        adminPassword, employeeName: adminName, employeeEmail: adminEmail,
        auditId: form.id, type: form.type, reason: reason.trim(),
      });
      setMsg({ ok: true, text: `Override recorded for audit #${form.id}.` });
      setForm(null);
      setReason('');
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Override failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-paper">Audit Log &amp; Overrides</h2>
        <div className="flex items-center gap-3">
          {chain && (
            <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${chain.valid ? 'text-verified border-verified/40 bg-verified-dim' : 'text-alert border-alert/40 bg-alert-dim'}`}>
              {chain.valid ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {chain.valid ? `Chain intact · ${chain.total} entries` : `TAMPERING DETECTED at #${chain.brokenAtId}`}
            </span>
          )}
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-amber hover:underline cursor-pointer disabled:opacity-50">
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted">Append-only and hash-chained. Overrides never edit history; they add a new entry signed with your name.</p>
      {err && <p className="text-xs text-alert">{err}</p>}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-verified' : 'text-alert'}`}>{msg.text}</p>}

      <div className="rounded-xl border border-border bg-ink-light overflow-hidden">
        {entries.map((e) => {
          const isOpen = open === e.id;
          const acts = e.actions || {};
          const hasActions = e.entryType === 'DECISION' && (acts.refund || (acts.ticket && !acts.ticket.reused));
          const done = overridden.has(e.id);
          const canEscalate = e.entryType === 'DECISION' && !done && e.decision !== 'HUMAN_ESCALATION';
          return (
            <div key={e.id} className="border-b border-border last:border-0">
              <button type="button" onClick={() => setOpen(isOpen ? null : e.id)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[11px] hover:bg-ink-lighter/60 cursor-pointer">
                <span className="w-9 font-mono text-muted">#{e.id}</span>
                <span className="w-36 text-muted hidden sm:block">{new Date(e.ts).toLocaleString('en-IN')}</span>
                <span className="w-20 font-semibold">{e.customerId}</span>
                <span className="font-bold" style={{ color: DEC_COLOR[e.decision] }}>{(e.decision || '').replace(/_/g, ' ')}</span>
                <span className="font-mono text-muted">{e.matchedPolicy || ''}</span>
                {e.entryType === 'OVERRIDE' && <span className="ml-auto text-[10px] text-muted truncate max-w-48">by {e.actor}</span>}
                {done && <span className="ml-auto text-[10px] font-bold text-[#8B5CF6]">OVERRIDDEN</span>}
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-1 bg-ink-inset/40 space-y-3">
                  <Detail e={e} />
                  {e.entryType === 'DECISION' && !done && (
                    <div className="flex gap-2 flex-wrap">
                      {hasActions && (
                        <button type="button" onClick={() => { setForm({ id: e.id, type: 'UNDO' }); setReason(''); setMsg(null); }}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-alert/40 text-alert hover:bg-alert-dim cursor-pointer">
                          Undo AI action
                        </button>
                      )}
                      {canEscalate && (
                        <button type="button" onClick={() => { setForm({ id: e.id, type: 'ESCALATE' }); setReason(''); setMsg(null); }}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber/40 text-amber hover:bg-amber-dim cursor-pointer">
                          Escalate to human
                        </button>
                      )}
                    </div>
                  )}
                  {form && form.id === e.id && (
                    <div className="space-y-2 max-w-md">
                      <label className="block text-[11px] font-semibold text-muted">
                        Reason for {form.type === 'UNDO' ? 'undoing the AI action' : 'escalating'} (logged under {adminName})
                      </label>
                      <textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2}
                        className="w-full bg-ink-inset border border-border rounded-lg px-3 py-2 text-xs text-paper focus:outline-none focus:ring-1 focus:ring-amber/50" />
                      <div className="flex gap-2">
                        <button type="button" disabled={busy || reason.trim().length < 5} onClick={submitOverride}
                          className="text-[11px] font-bold px-3.5 py-1.5 rounded-lg bg-amber text-ink disabled:opacity-50 cursor-pointer">
                          {busy ? 'Saving…' : 'Confirm override'}
                        </button>
                        <button type="button" onClick={() => setForm(null)} className="text-[11px] font-semibold text-muted cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!entries.length && !loading && <p className="p-4 text-xs text-muted">No audit entries yet.</p>}
      </div>
    </div>
  );
}
