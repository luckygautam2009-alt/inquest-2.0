import { useState } from 'react';
import VerifyModal from './VerifyModal';
import EvidencePanels from './EvidencePanels';
import {
  CheckCircle, AlertTriangle, UserCheck,
  FileText, Search, Zap, MessageSquare,
  ShoppingBag, CreditCard, Ticket, BookOpen,
  TrendingUp, AlertCircle,
} from 'lucide-react';

// ── Decision config ────────────────────────────────────────────────────────────
const DECISION_CONFIG = {
  AUTO_RESOLVE: {
    label: 'Auto Resolved',
    icon: CheckCircle,
    border: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    pill: 'bg-verified-dim border-verified/40 text-verified font-bold',
    glow: '0 0 0 1px rgba(16, 185, 129, 0.3), 0 8px 30px rgba(16, 185, 129, 0.12)',
  },
  CUSTOMER_CONFIRM: {
    label: 'Awaiting Customer Confirmation',
    icon: AlertTriangle,
    border: '#D97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    pill: 'bg-amber-dim border-amber/40 text-amber font-bold',
    glow: '0 0 0 1px rgba(217, 119, 6, 0.3), 0 8px 30px rgba(217, 119, 6, 0.12)',
  },
  HUMAN_ESCALATION: {
    label: 'Escalated to Support Agent',
    icon: UserCheck,
    border: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    pill: 'bg-alert-dim border-alert/40 text-alert font-bold',
    glow: '0 0 0 1px rgba(239, 68, 68, 0.3), 0 8px 30px rgba(239, 68, 68, 0.12)',
  },
};

// ── Intent → icon ──────────────────────────────────────────────────────────────
const INTENT_ICONS = {
  'payment/billing': CreditCard,
  'refund/return': TrendingUp,
  'cancellation': AlertCircle,
  'order_status/delay': ShoppingBag,
  'security/unauthorized': AlertTriangle,
  'product_issue': ShoppingBag,
  'other/ambiguous': FileText,
};

function intentIcon(intent) {
  const key = Object.keys(INTENT_ICONS).find((k) => intent?.toLowerCase().startsWith(k));
  return key ? INTENT_ICONS[key] : MessageSquare;
}

// ── Sentiment badge ────────────────────────────────────────────────────────────
function sentimentColor(sentiment) {
  const s = sentiment?.toLowerCase();
  if (s === 'negative' || s === 'very_negative') return 'text-alert bg-alert-dim border-alert/30';
  if (s === 'positive') return 'text-verified bg-verified-dim border-verified/30';
  return 'text-muted bg-ink-lighter border-border-strong';
}

// ── Evidence tag ───────────────────────────────────────────────────────────────
function EvidenceTag({ label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-dim text-amber border border-amber/30 rounded-md px-2.5 py-1 font-semibold shadow-xs">
      {label}
    </span>
  );
}

// ── Investigation summary ──────────────────────────────────────────────────────
function InvestigationSummary({ investigation }) {
  if (!investigation) return null;

  const focusOrder = investigation.focusOrder;
  const focusRefunds = investigation.focusRefunds || [];
  const securityEvents = investigation.securityEvents || [];
  const orders = investigation.orders || [];
  const payments = investigation.payments || [];
  const tickets = investigation.tickets || [];
  const policies = investigation.policies || [];

  const hasAnyData = orders.length || payments.length || tickets.length || policies.length || focusOrder;

  if (!hasAnyData && !investigation.orderHintDetected) {
    return (
      <div className="flex items-center gap-2.5 text-base text-muted py-3">
        <FileText className="w-5 h-5 shrink-0" />
        No prior order, payment or ticket history found for this customer.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Focus order */}
      {focusOrder ? (
        <div className="flex items-start gap-3.5 bg-ink-lighter rounded-xl p-4 border border-border-strong shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-amber-dim border border-amber/30 flex items-center justify-center shrink-0 mt-0.5">
            <ShoppingBag className="w-4 h-4 text-amber" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-paper">
              {focusOrder.id}
              {focusOrder.product && (
                <span className="font-normal text-muted ml-2">— {focusOrder.product}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {focusOrder.status && (
                <span className="text-xs bg-amber-dim text-amber border border-amber/30 rounded-md px-2 py-0.5 font-bold uppercase tracking-wider">
                  {focusOrder.status}
                </span>
              )}
              {focusOrder.amount && (
                <span className="text-xs font-semibold text-paper/80 bg-ink-light px-2.5 py-0.5 rounded-md border border-border">
                  ₹{focusOrder.amount}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : investigation.orderMismatch ? (
        <div className="flex items-center gap-3 text-sm text-alert bg-alert-dim border border-alert/30 rounded-xl px-4 py-3 font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" />
          Order identifier referenced does not match customer ownership records.
        </div>
      ) : null}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-xs font-medium pt-1">
        {orders.length > 0 && (
          <div className="flex items-center gap-1.5 text-paper/80 bg-ink-lighter border border-border px-3 py-1.5 rounded-lg">
            <ShoppingBag className="w-3.5 h-3.5 text-muted" />
            <span>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {payments.length > 0 && (
          <div className="flex items-center gap-1.5 text-paper/80 bg-ink-lighter border border-border px-3 py-1.5 rounded-lg">
            <CreditCard className="w-3.5 h-3.5 text-muted" />
            <span>{payments.length} payment record{payments.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {tickets.length > 0 && (
          <div className="flex items-center gap-1.5 text-paper/80 bg-ink-lighter border border-border px-3 py-1.5 rounded-lg">
            <Ticket className="w-3.5 h-3.5 text-muted" />
            <span>{tickets.length} prior ticket{tickets.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {focusRefunds.length > 0 && (
          <div className="flex items-center gap-1.5 text-amber bg-amber-dim border border-amber/30 px-3 py-1.5 rounded-lg">
            <TrendingUp className="w-3.5 h-3.5 text-amber" />
            <span>{focusRefunds.length} refund record{focusRefunds.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {securityEvents.length > 0 && (
          <div className="flex items-center gap-1.5 text-alert bg-alert-dim border border-alert/30 px-3 py-1.5 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-alert" />
            <span>{securityEvents.length} security event{securityEvents.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {policies.length > 0 && (
          <div className="flex items-center gap-1.5 text-paper/80 bg-ink-lighter border border-border px-3 py-1.5 rounded-lg">
            <BookOpen className="w-3.5 h-3.5 text-muted" />
            <span>{policies.length} polic{policies.length !== 1 ? 'ies' : 'y'} referenced</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, className = '', accent = false, delay = 0 }) {
  return (
    <section
      className={`rounded-xl border p-5 sm:p-6 bg-ink-light shadow-sm fade-up ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        borderColor: accent ? 'var(--color-border-strong)' : 'var(--color-border)',
      }}
    >
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

// ── Main ResultPanel ───────────────────────────────────────────────────────────
export default function ResultPanel({ data }) {
  const { analysis, investigation, rootCause, decision, handoff } = data;
  const decisionCfg = DECISION_CONFIG[decision?.decision] || DECISION_CONFIG.HUMAN_ESCALATION;
  const DecisionIcon = decisionCfg.icon;
  const IntentIcon = intentIcon(analysis?.intent);
  const [showVerify, setShowVerify] = useState(false);
  const needsVerification = decision?.decision === 'CUSTOMER_CONFIRM' || decision?.decision === 'HUMAN_ESCALATION';

  return (
    <div className="space-y-6">

      {/* ── Decision banner — the hero visual ── */}
      <div
        className="rounded-xl p-6 sm:p-7 border-2 fade-up relative overflow-hidden"
        style={{
          background: decisionCfg.bg,
          borderColor: decisionCfg.border,
          boxShadow: decisionCfg.glow,
        }}
      >
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
              style={{ background: decisionCfg.border + '22', border: `1.5px solid ${decisionCfg.border}60` }}
            >
              <DecisionIcon className="w-7 h-7" style={{ color: decisionCfg.border }} />
            </div>
            <div>
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                Investigation Verdict
              </div>
              <h2 className="font-display text-2xl sm:text-3xl text-paper leading-tight">
                {decisionCfg.label}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center">
            {decision?.confidence != null && (
              <span
                className="text-sm font-bold px-3.5 py-1.5 rounded-full border shadow-xs"
                style={{
                  color: decisionCfg.border,
                  borderColor: decisionCfg.border + '60',
                  background: decisionCfg.border + '18',
                }}
              >
                {decision.confidence}% confidence
              </span>
            )}
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-full border uppercase tracking-wide ${decisionCfg.pill}`}
            >
              {decision?.decision?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {decision?.reasoning && (
          <p className="mt-5 text-base text-paper/90 leading-relaxed border-t border-border pt-4 font-normal">
            {decision.reasoning}
          </p>
        )}
        {decision?.sentimentNote && (
          <p className="mt-2 text-xs text-muted italic flex items-center gap-1.5">
            <span>ℹ️</span> {decision.sentimentNote}
          </p>
        )}
        {needsVerification && (
          <button
            onClick={() => setShowVerify(true)}
            className="mt-5 w-full sm:w-auto bg-ink text-paper font-bold px-5 py-2.5 rounded-lg text-sm hover:bg-ink-lighter border border-border-strong transition-colors cursor-pointer"
          >
            Verify Manually
          </button>
        )}
      </div>
      {showVerify && <VerifyModal data={data} onClose={() => setShowVerify(false)} />}

      {/* ── 2.0: actions, risk, photo evidence, audit ── */}
      <EvidencePanels data={data} />

      {/* ── Two-column grid: Analysis + Root Cause ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Analysis */}
        <Section icon={IntentIcon} title="Complaint Analysis" delay={60}>
          <div className="space-y-4">
            {/* Intent summary */}
            {analysis?.intentSummary && (
              <p className="text-base text-paper font-normal leading-relaxed">
                {analysis.intentSummary}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-ink-lighter p-3 rounded-lg border border-border">
                <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-1">Intent Category</div>
                <div className="text-sm font-bold text-paper capitalize">
                  {analysis?.intent?.replace(/[_/]/g, ' ') || 'General Inquiry'}
                </div>
              </div>

              {analysis?.subIntent && (
                <div className="bg-ink-lighter p-3 rounded-lg border border-border">
                  <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-1">Sub-intent</div>
                  <div className="text-sm font-bold text-paper capitalize">
                    {analysis.subIntent.replace(/_/g, ' ')}
                  </div>
                </div>
              )}

              <div className="bg-ink-lighter p-3 rounded-lg border border-border">
                <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-1.5">Sentiment</div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border inline-block ${sentimentColor(analysis?.sentiment)}`}>
                  {analysis?.sentiment || 'Neutral'}
                </span>
              </div>

              <div className="bg-ink-lighter p-3 rounded-lg border border-border">
                <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-1">Urgency</div>
                <div className="text-sm font-bold text-paper capitalize">
                  {analysis?.urgency || 'Normal'}
                </div>
              </div>
            </div>

            {analysis?.urgencyReason && (
              <p className="text-xs text-muted italic border-t border-border pt-3">
                <span className="font-semibold text-paper/70">Urgency assessment:</span> {analysis.urgencyReason}
              </p>
            )}
          </div>
        </Section>

        {/* Root Cause */}
        <Section icon={Search} title="Root Cause Diagnosis" delay={120}>
          <div className="space-y-4">
            <p className="text-base text-paper font-normal leading-relaxed">
              {rootCause?.rootCause}
            </p>

            <div className="flex flex-wrap gap-2.5 items-center">
              {rootCause?.matchedPolicy && (
                <span className="text-xs bg-amber-dim text-amber border border-amber/30 rounded-md px-3 py-1 font-bold uppercase tracking-wide">
                  Policy: {rootCause.matchedPolicy}
                </span>
              )}
              {rootCause?.confidence != null && (
                <span className="text-xs font-semibold text-muted bg-ink-lighter px-2.5 py-1 rounded-md border border-border">
                  {rootCause.confidence}% confidence score
                </span>
              )}
            </div>

            {/* Confidence bar */}
            {rootCause?.confidence != null && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-muted font-medium">
                  <span>Confidence rating</span>
                  <span className="font-bold text-paper">{rootCause.confidence}%</span>
                </div>
                <div className="h-2 bg-ink-lighter rounded-full overflow-hidden border border-border">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${rootCause.confidence}%`,
                      background: rootCause.confidence > 70 ? '#10B981' : rootCause.confidence > 40 ? '#D97706' : '#EF4444',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Evidence used */}
            {rootCause?.evidenceUsed?.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-2.5">
                  Corroborating Evidence
                </div>
                <div className="flex flex-wrap gap-2">
                  {rootCause.evidenceUsed.map((e, i) => (
                    <EvidenceTag key={i} label={e} />
                  ))}
                </div>
              </div>
            )}

            {rootCause?.confidenceReasoning && (
              <p className="text-xs text-muted italic border-t border-border pt-3">
                {rootCause.confidenceReasoning}
              </p>
            )}
          </div>
        </Section>
      </div>

      {/* ── Investigation summary ── */}
      <Section icon={Zap} title="Contextual Records & Evidence" delay={180}>
        <InvestigationSummary investigation={investigation} />
      </Section>

      {/* ── Handoff Action ── */}
      <Section icon={MessageSquare} title="Automated Handoff & Customer Resolution" delay={240}>
        {handoff?.type === 'AUTO_RESOLVE' && (
          <div className="space-y-3">
            {handoff.actionTaken && (
              <div className="flex items-center gap-2 text-base font-bold text-verified">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>{handoff.actionTaken}</span>
              </div>
            )}
            {handoff.customerMessage && (
              <div className="bg-ink-lighter border border-border-strong rounded-xl p-5 shadow-xs">
                <div className="text-xs text-muted font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Dispatch Message to Customer</span>
                  <span className="text-[11px] text-verified font-medium">Ready for delivery</span>
                </div>
                <p className="text-base text-paper leading-relaxed font-sans">{handoff.customerMessage}</p>
              </div>
            )}
          </div>
        )}

        {handoff?.type === 'CUSTOMER_CONFIRM' && (
          <div className="space-y-3">
            {handoff.suggestedAction && (
              <div className="flex items-center gap-2 text-base font-bold text-amber">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{handoff.suggestedAction}</span>
              </div>
            )}
            {handoff.customerMessage && (
              <div className="bg-ink-lighter border border-border-strong rounded-xl p-5 shadow-xs">
                <div className="text-xs text-muted font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Draft Message for Customer</span>
                  <span className="text-[11px] text-amber font-medium">Awaiting customer response</span>
                </div>
                <p className="text-base text-paper leading-relaxed font-sans">{handoff.customerMessage}</p>
              </div>
            )}
          </div>
        )}

        {handoff?.type === 'HUMAN_ESCALATION' && (
          <div className="space-y-4">
            <div className="bg-alert-dim border border-alert/30 rounded-xl p-5 shadow-xs">
              <div className="text-xs text-alert uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Agent Handoff Package
              </div>
              {handoff.agentSummary?.issue && (
                <p className="text-base text-paper leading-relaxed mb-2">
                  <span className="font-bold text-paper">Core Issue: </span>
                  {handoff.agentSummary.issue}
                </p>
              )}
              {handoff.agentSummary?.recommendedAction && (
                <p className="text-base text-paper leading-relaxed bg-ink-light/80 p-3 rounded-lg border border-alert/20">
                  <span className="font-bold text-amber-light">Recommended Action: </span>
                  {handoff.agentSummary.recommendedAction}
                </p>
              )}
            </div>

            {!handoff.agentSummary && handoff.customerMessage && (
              <p className="text-base text-paper leading-relaxed">{handoff.customerMessage}</p>
            )}
          </div>
        )}

        {/* Metadata row */}
        <div className="mt-5 pt-4 border-t border-border flex flex-wrap gap-5 text-xs text-muted font-medium">
          {handoff?.customerName && (
            <span>
              <span className="text-paper/70 font-semibold">Customer:</span> {handoff.customerName}
            </span>
          )}
          {handoff?.customerTier && (
            <span>
              <span className="text-paper/70 font-semibold">Tier:</span> {handoff.customerTier.toUpperCase()}
            </span>
          )}
          {handoff?.orderId && handoff.orderId !== 'N/A' && (
            <span>
              <span className="text-paper/70 font-semibold">Order:</span> {handoff.orderId}
            </span>
          )}
          {handoff?.matchedPolicy && (
            <span>
              <span className="text-paper/70 font-semibold">Policy:</span> {handoff.matchedPolicy}
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}
