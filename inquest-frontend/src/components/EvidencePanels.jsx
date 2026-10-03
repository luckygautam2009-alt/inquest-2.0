import { useState } from 'react';
import { Zap, Shield, Camera, FileText, Check } from 'lucide-react';
import { confirmProposal } from '../api/client';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const SKIP_TEXT = {
  ALREADY_REFUNDED: 'Skipped: a refund was already issued for this order (duplicate-refund protection).',
  REFUND_ALREADY_EXISTS: 'Skipped: a refund already exists for this order.',
  ORDER_NOT_VERIFIED_FOR_CUSTOMER: 'Skipped: order could not be verified for this customer.',
  DUPLICATE_NOT_CONFIRMED: 'Skipped: duplicate charge not confirmed by payment records.',
  NO_ORPHAN_DEBIT: 'Skipped: no unmatched gateway debit found.',
};

const LEVEL = {
  LOW: { color: '#10B981', label: 'Low risk' },
  MEDIUM: { color: '#D97706', label: 'Medium risk' },
  HIGH: { color: '#EF4444', label: 'High risk' },
};

function Card({ icon: Icon, title, children }) {
  return (
    <section className="rounded-xl border border-border p-5 bg-ink-light shadow-sm fade-up">
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
        <div className="w-6 h-6 rounded-md bg-ink-lighter border border-border flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-amber" />
        </div>
        <h3 className="text-xs font-bold text-muted uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, tone }) {
  const color = tone === 'good' ? 'text-verified' : tone === 'bad' ? 'text-alert' : 'text-paper';
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-1">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold text-right ${color}`}>{value}</span>
    </div>
  );
}

function ProposalCard({ proposal }) {
  const [st, setSt] = useState({ busy: null, done: null, error: null });

  async function choose(choice) {
    setSt({ busy: choice, done: null, error: null });
    try {
      const res = await confirmProposal({ auditId: proposal.auditId, customerId: proposal.customerId, choice });
      setSt({ busy: null, done: res.data, error: null });
    } catch (e) {
      setSt({ busy: null, done: null, error: e.message || 'Could not record your choice' });
    }
  }

  return (
    <section className="md:col-span-2 rounded-xl border border-amber/40 bg-amber-dim p-5 fade-up">
      <div className="text-xs font-bold uppercase tracking-wider text-amber mb-2">Your confirmation is needed</div>
      <p className="text-sm text-paper mb-4">{proposal.summary}</p>
      {st.done ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-verified">
          <Check className="w-4 h-4" /> {st.done.message}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {proposal.options.map((o) => (
            <button key={o.key} type="button" disabled={!!st.busy} onClick={() => choose(o.key)}
              className={`text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50 ${o.key === 'DECLINE' ? 'border border-border-strong text-muted' : 'bg-amber text-ink'}`}>
              {st.busy === o.key ? 'Saving…' : o.label}
            </button>
          ))}
        </div>
      )}
      {st.error && <p className="mt-3 text-xs font-semibold text-alert">{st.error}</p>}
    </section>
  );
}

export default function EvidencePanels({ data }) {
  const { actions, risk, photo, auditId } = data || {};
  const refund = actions?.refund;
  const ticket = actions?.ticket;
  const lvl = risk ? LEVEL[risk.level] || LEVEL.LOW : null;
  const v = photo?.vision;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {data?.proposal && <ProposalCard proposal={data.proposal} />}

      {actions && (
        <Card icon={Zap} title="Action Taken by Inquest">
          {refund ? (
            <div className="space-y-1">
              <Row label="Refund" value={`${refund.id} · ${inr(refund.amount)}`} tone="good" />
              <Row label="Status" value={`${refund.status} (bank settlement)`} />
              <Row label="Reason" value={refund.reason} />
            </div>
          ) : (
            <p className="text-sm text-muted">No money was moved automatically.</p>
          )}
          {ticket && (
            <div className="mt-3 pt-3 border-t border-border space-y-1">
              <Row label="Ticket" value={`${ticket.id} · ${ticket.status}${ticket.reused ? ' (existing)' : ''}`} />
            </div>
          )}
          {actions.skipped && (
            <p className="mt-3 text-xs text-amber font-semibold">{SKIP_TEXT[actions.skipped] || `Skipped: ${actions.skipped}`}</p>
          )}
          {actions.error && <p className="mt-3 text-xs text-alert font-semibold">Action error: {actions.error}</p>}
        </Card>
      )}

      {risk && (
        <Card icon={Shield} title="Fraud & Abuse Risk">
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-bold" style={{ color: lvl.color }}>{risk.score}<span className="text-base text-muted">/100</span></span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{ color: lvl.color, borderColor: lvl.color + '60', background: lvl.color + '18' }}>{lvl.label}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-lighter overflow-hidden mb-3">
            <div className="h-full rounded-full" style={{ width: `${risk.score}%`, background: lvl.color }} />
          </div>
          {risk.signals?.length ? (
            <ul className="space-y-1">
              {risk.signals.map((s) => (
                <li key={s.name} className="flex justify-between gap-3 text-xs">
                  <span className="text-muted">{s.detail}</span>
                  <span className={`font-bold ${s.points > 0 ? 'text-alert' : 'text-verified'}`}>{s.points > 0 ? '+' : ''}{s.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No risk signals found for this customer.</p>
          )}
          <p className="mt-3 text-[11px] text-muted">Escalates automatically at {risk.highThreshold}+.</p>
        </Card>
      )}

      {photo?.provided > 0 && (
        <Card icon={Camera} title="Photo Evidence">
          <Row label="Photos received" value={photo.provided} />
          <Row label="Image reuse check" value={photo.reuse?.detected ? 'REUSED' : 'First time seen'} tone={photo.reuse?.detected ? 'bad' : 'good'} />
          {photo.reuse?.detected && <p className="text-xs text-alert font-semibold mt-1">{photo.reuse.detail}</p>}
          {v && (
            <div className="mt-2 pt-2 border-t border-border">
              <Row label="Product matches order" value={v.productMatchesOrder} tone={v.productMatchesOrder === 'yes' ? 'good' : v.productMatchesOrder === 'no' ? 'bad' : undefined} />
              <Row label="Damage visible" value={v.damageVisible ? 'yes' : 'no'} tone={v.damageVisible ? 'good' : undefined} />
              <Row label="Consistent with complaint" value={v.damageConsistentWithComplaint} />
              <Row label="Stock / edited image" value={v.looksLikeStockOrScreenshot || v.looksEditedOrAiGenerated ? 'suspected' : 'no'} tone={v.looksLikeStockOrScreenshot || v.looksEditedOrAiGenerated ? 'bad' : 'good'} />
              <Row label="Vision confidence" value={`${v.confidence}%`} />
              {v.damageDescription && <p className="text-xs text-muted mt-1 italic">“{v.damageDescription}”</p>}
            </div>
          )}
          {photo.error && <p className="text-xs text-alert font-semibold mt-2">Vision unavailable: {photo.error}</p>}
          <p className="mt-3 text-[11px] text-muted">The AI gives claims; the backend hash check and rules decide.</p>
        </Card>
      )}

      {auditId != null && (
        <Card icon={FileText} title="Audit Trail">
          <Row label="Audit entry" value={`#${auditId}`} />
          <p className="text-xs text-muted mt-2">Logged in an append-only, hash-chained audit log. Policy, evidence, confidence and actions are recorded and cannot be edited or deleted.</p>
        </Card>
      )}
    </div>
  );
}
