const settings = require('./settingsService');

const num = (v, d) => (Number(v) > 0 ? Number(v) : d);

function thresholds() {
  return {
    minConfidence: num(process.env.AUTO_MIN_CONFIDENCE, 85),
    maxAmount: num(process.env.AUTO_MAX_AMOUNT, 10000),
    maxRisk: num(process.env.AUTO_MAX_RISK, 30),
  };
}

// Admin can flip this from the dashboard; the .env value is only the default
function autoEnabled() {
  const stored = settings.get('autoInvestigate');
  if (stored !== null) return stored === 'true';
  return String(process.env.AUTO_INVESTIGATE || 'true') !== 'false';
}

// Decides what the platform may do WITHOUT a human. A high AI confidence alone is never enough:
// every gate must pass against verified backend records.
function evaluateAutomation({ decision, risk, investigation, rootCause, photo }) {
  const t = thresholds();
  const d = decision.decision;
  if (d === 'NEEDS_INFO') return { kind: 'INFO', eligible: false, gates: [], reason: decision.reasoning };

  const order = investigation.focusOrder;
  const orderOk = !!(investigation.orderVerified && order && order.customerId === investigation.customer.id);
  const vision = photo && photo.vision;
  const confidenceGate = d === 'CUSTOMER_CONFIRM'
    ? { key: 'confidence', label: 'Confidence at least 60%', ok: Number(decision.confidence) >= 60 }
    : { key: 'confidence', label: `Confidence at least ${t.minConfidence}%`, ok: Number(decision.confidence) >= t.minConfidence };

  const gates = [
    { key: 'identity', label: 'Customer and order verified against backend records', ok: !investigation.orderMismatch && (!investigation.orderHintDetected || orderOk) },
    { key: 'policy', label: 'An applicable policy matched', ok: !!rootCause.matchedPolicy },
    confidenceGate,
    { key: 'risk', label: `Customer risk score below ${t.maxRisk}`, ok: !risk || risk.score < t.maxRisk },
    { key: 'evidence', label: 'No fraud or contradictory signals in the evidence', ok: !(photo && photo.reuse && photo.reuse.detected) && !(vision && (vision.looksLikeStockOrScreenshot || vision.looksEditedOrAiGenerated)) },
    { key: 'amount', label: `Order value within the automatic limit (INR ${t.maxAmount})`, ok: !order || order.amount <= t.maxAmount },
  ];
  const failed = gates.find((g) => !g.ok);

  if (d === 'AUTO_RESOLVE') {
    return failed
      ? { kind: 'REVIEW', eligible: false, gates, reason: `Automatic resolution blocked: ${failed.label}` }
      : { kind: 'EXECUTE', eligible: true, gates, reason: 'All automation gates passed' };
  }
  if (d === 'CUSTOMER_CONFIRM') {
    return failed
      ? { kind: 'REVIEW', eligible: false, gates, reason: `Offer needs staff approval: ${failed.label}` }
      : { kind: 'OFFER', eligible: true, gates, reason: 'The customer can choose a remedy; all gates passed' };
  }
  return { kind: 'REVIEW', eligible: false, gates, reason: decision.reasoning };
}

module.exports = { evaluateAutomation, autoEnabled, thresholds };
