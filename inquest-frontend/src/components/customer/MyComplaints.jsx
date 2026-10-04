import { useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { confirmProposal } from '../../api/client';

const STYLE = {
  registered: { label: 'Registered', cls: 'text-muted border-border-strong bg-ink-lighter' },
  in_review: { label: 'Under review', cls: 'text-amber border-amber/40 bg-amber-dim' },
  awaiting_you: { label: 'Action needed', cls: 'text-alert border-alert/40 bg-alert-dim' },
  resolved: { label: 'Resolved', cls: 'text-verified border-verified/40 bg-verified-dim' },
  answered: { label: 'Answered', cls: 'text-muted border-border-strong bg-ink-lighter' },
};

export default function MyComplaints({ open, onClose, complaints, reload }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState({});
  const [err, setErr] = useState(null);

  if (!open) return null;

  async function answer(c, choice) {
    setBusy(c.id + choice);
    setErr(null);
    try {
      const res = await confirmProposal({ auditId: c.proposal.auditId, customerId: c.proposal.customerId, choice });
      setMsg((m) => ({ ...m, [c.id]: res.data.message }));
      await reload();
    } catch (e) {
      setErr(e.message || 'Could not record your choice');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-border-strong bg-ink-light p-5 shadow-xl my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold">My complaints</h2>
          <div className="flex items-center gap-3">
            <button type="button" onClick={reload} className="flex items-center gap-1.5 text-xs font-semibold text-amber cursor-pointer hover:underline">
              <RotateCcw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {err && <p className="text-sm font-semibold text-alert mb-3">{err}</p>}
        {!complaints.length && <p className="text-sm text-muted py-6 text-center">You have not registered any complaints yet. Use the chat button at the bottom right to report a problem.</p>}

        <div className="space-y-3">
          {complaints.map((c) => {
            const st = STYLE[c.status] || STYLE.registered;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-ink p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm">Complaint #{c.id}{c.orderId ? ` · ${c.orderId}` : ''}{c.product ? ` · ${c.product}` : ''}</div>
                    <div className="text-[11px] text-muted mt-0.5">{new Date(c.ts).toLocaleString('en-IN')}{c.photoCount ? ` · ${c.photoCount} photo${c.photoCount > 1 ? 's' : ''}` : ''}</div>
                  </div>
                  <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-sm text-muted mt-2 italic">“{c.issue}”</p>

                {c.status === 'resolved' && (
                  <div className="mt-3 flex items-start gap-2 text-sm px-3 py-2 rounded-lg bg-verified-dim border border-verified/40 text-verified">
                    <Check className="w-4 h-4 shrink-0 mt-0.5" /><span>{c.detail}</span>
                  </div>
                )}
                {(c.status === 'registered' || c.status === 'in_review' || c.status === 'answered') && (
                  <p className="mt-3 text-sm text-paper">{c.detail}</p>
                )}
                {c.status === 'awaiting_you' && c.proposal && (
                  <div className="mt-3 rounded-lg border border-amber/40 bg-amber-dim p-3">
                    <p className="text-sm text-paper mb-2.5">{c.proposal.summary}</p>
                    {msg[c.id] ? (
                      <p className="flex items-center gap-2 text-sm font-semibold text-verified"><Check className="w-4 h-4" /> {msg[c.id]}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {c.proposal.options.map((o) => (
                          <button key={o.key} type="button" disabled={!!busy} onClick={() => answer(c, o.key)}
                            className={`text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer disabled:opacity-50 ${o.key === 'DECLINE' ? 'border border-border-strong text-muted' : 'bg-amber text-ink'}`}>
                            {busy === c.id + o.key ? 'Saving…' : o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
