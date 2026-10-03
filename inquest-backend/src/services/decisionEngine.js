/**
 * Decision Engine: Decides the resolution path based on verified evidence,
 * policies, confidence, and category safety — NEVER sentiment alone.
 *
 * Invariants:
 * 1. Claims vs Evidence: LLM output is claim; only dataStore is evidence.
 * 2. Customer Isolation: customerId is security boundary.
 * 3. Ownership check is deterministic and mandatory: If failed => HUMAN_ESCALATION, confidence 0.
 * 4. No Fabrication: Missing evidence => HUMAN_ESCALATION with clear statement.
 * 5. Security/Unauthorized Activity: NEVER AUTO_RESOLVE under any circumstance.
 * 6. High Confidence alone NEVER triggers AUTO_RESOLVE without satisfied evidence & policy.
 */

const PHYSICAL_VERIFICATION_INTENTS = [
  'product_issue',
  'product_quality',
];

const PHOTO_VALUE_CAP = Number(process.env.PHOTO_VALUE_CAP) || 5000;
const PHOTO_MIN_CONFIDENCE = Number(process.env.PHOTO_MIN_CONFIDENCE) || 80;

function decide(complaintText, analysis, rootCause, investigation, risk, photo) {
  const { confidence, matchedPolicy } = rootCause;
  const intent = analysis.intent;
  const subIntent = analysis.subIntent;

  // SAFETY GUARD 1: Order ownership check failed (Mandatory isolation boundary)
  if (investigation && investigation.orderMismatch) {
    return {
      decision: 'HUMAN_ESCALATION',
      reasoning: `Order #${investigation.orderHintDetected} could not be verified for customer ${investigation.customer.id}. Customer isolation boundary enforced; cross-customer access is prohibited.`,
      confidence: 0,
      sentimentNote: `Note: Decision based strictly on customer order ownership verification, not sentiment (${analysis.sentiment}).`,
    };
  }

  // SAFETY GUARD 2: Security & unauthorized activity (Mandatory Escalation)
  const isSecurity =
    intent === 'security/unauthorized_activity' ||
    intent === 'account' ||
    subIntent === 'suspicious_activity' ||
    subIntent === 'account_security' ||
    subIntent === 'unauthorized_login_or_access' ||
    matchedPolicy === 'POLICY9';

  if (isSecurity) {
    return {
      decision: 'HUMAN_ESCALATION',
      reasoning: 'Security and unauthorized activity claims require mandatory manual review by Security Operations — never auto-resolved regardless of confidence score.',
      confidence,
      sentimentNote: `Note: Escalated per security policy POLICY9, not sentiment (${analysis.sentiment}).`,
    };
  }

  // SAFETY GUARD 2b (2.0): Fraud / abuse risk
  if (risk && risk.score >= risk.highThreshold) {
    const top = [...risk.signals].filter((s) => s.points > 0).sort((a, b) => b.points - a.points).slice(0, 3).map((s) => s.detail).join('; ');
    return {
      decision: 'HUMAN_ESCALATION',
      reasoning: `Customer fraud/abuse risk score ${risk.score}/100 (${risk.level}) is at or above the escalation threshold (${risk.highThreshold}). Top signals: ${top}. Manual review required before any automated action.`,
      confidence,
      sentimentNote: `Note: Escalated on risk score, not sentiment (${analysis.sentiment}).`,
    };
  }

  // SAFETY GUARD 3 (2.0): Physical verification, evidence-based via the photo pipeline
  const isPhysicalVerification =
    PHYSICAL_VERIFICATION_INTENTS.includes(intent) ||
    ['POLICY6', 'POLICY8', 'POLICY10'].includes(matchedPolicy);

  if (isPhysicalVerification) {
    const note = `Note: Physical-verification decision based on evidence, not sentiment (${analysis.sentiment}).`;
    const escalate = (reasoning) => ({ decision: 'HUMAN_ESCALATION', reasoning, confidence, sentimentNote: note });

    const isCarrierDispute = matchedPolicy === 'POLICY10' || subIntent === 'delivered_not_received';
    if (isCarrierDispute) {
      return escalate('Carrier tracking marks delivery but customer disputes receipt. Requires logistics proof-of-delivery (POD) verification before financial resolution.');
    }
    if (!photo || !photo.provided) {
      return escalate('Product condition claims rely on unverified customer words and require photo or reverse pickup verification prior to refund. No photo was provided.');
    }
    if (!matchedPolicy) {
      return escalate('Photo received, but no active policy matches this product complaint; requires human review.');
    }
    const ord = investigation.focusOrder;
    if (!investigation.orderVerified || !ord || ord.customerId !== investigation.customer.id) {
      return escalate('Photo received, but no verified order for this customer; no automated action taken.');
    }
    if (photo.reuse && photo.reuse.detected) {
      return escalate(`Photo evidence rejected: ${photo.reuse.detail}. Possible image reuse; manual fraud review required.`);
    }
    if (!photo.analyzed || !photo.vision) {
      return escalate('Photo was received but could not be analysed automatically; manual review required.');
    }

    const v = photo.vision;
    if (v.looksLikeStockOrScreenshot || v.looksEditedOrAiGenerated) {
      return escalate('Photo appears to be a stock image, screenshot, or edited/generated image; manual authenticity review required.');
    }
    if (matchedPolicy === 'POLICY8') {
      return escalate('Wrong-item claims must be compared against warehouse dispatch logs (POLICY8); a photo alone cannot prove what was shipped. Photo analysis attached for the agent.');
    }
    if (v.productMatchesOrder === 'no') {
      return escalate(`Photo shows an item that does not match the ordered product (${ord.product}); manual review required.`);
    }
    if (ord.amount > PHOTO_VALUE_CAP) {
      return escalate(`Order value INR ${ord.amount} exceeds the photo auto-resolution cap of INR ${PHOTO_VALUE_CAP}; manual approval required.`);
    }

    const strong =
      v.productMatchesOrder === 'yes' &&
      v.damageVisible &&
      v.damageConsistentWithComplaint === 'yes' &&
      v.confidence >= PHOTO_MIN_CONFIDENCE &&
      confidence >= 70;

    if (strong && matchedPolicy === 'POLICY6') {
      return {
        decision: 'AUTO_RESOLVE',
        reasoning: `Photo evidence verified: product matches order ${ord.id}, damage visible and consistent with the complaint (vision confidence ${v.confidence}%), image never used before, order value within cap, customer risk acceptable. Policy POLICY6 satisfied.`,
        confidence,
        sentimentNote: note,
      };
    }
    return {
      decision: 'CUSTOMER_CONFIRM',
      reasoning: `Photo evidence is only partially conclusive (product match: ${v.productMatchesOrder}, damage visible: ${v.damageVisible}, consistent with complaint: ${v.damageConsistentWithComplaint}, vision confidence ${v.confidence}%). A clearer photo or customer confirmation is needed.`,
      confidence,
      sentimentNote: note,
    };
  }

  // SAFETY GUARD 4: Policy coverage missing or ambiguous intent
  if (!matchedPolicy || intent === 'other/ambiguous') {
    return {
      decision: 'HUMAN_ESCALATION',
      reasoning: !matchedPolicy
        ? `No active policy matches intent "${intent}". Requires human support agent to review policy coverage.`
        : 'Complaint text is ambiguous or lacks verified transaction evidence; requires human review.',
      confidence,
      sentimentNote: `Note: Decision based on missing policy coverage/evidence, not sentiment (${analysis.sentiment}).`,
    };
  }

  // Check the 6 AUTO_RESOLVE criteria:
  // 1. Customer verified (checked in investigation.found)
  // 2. Order verified for customer (if order-related intent)
  const orderRequired = ['payment/billing', 'payment', 'cancellation', 'refund/return', 'refund', 'order_status/delay'].includes(intent);
  const orderVerified = investigation.orderVerified && investigation.focusOrder?.customerId === investigation.customer.id;

  // 3. Matched policy exists (verified above)
  // 4. Policy conditions satisfied by verified evidence
  let evidenceSatisfied = true;
  let policyFailureReason = '';

  if (matchedPolicy === 'POLICY7') {
    // Duplicate payment: order verified, amount known, >= 2 successful payments
    const successfulPayments = (investigation.focusPayments || []).filter(
      (p) => (p.status === 'success' || p.gatewayStatus === 'success') && p.customerId === investigation.customer.id
    );
    if (!orderVerified) {
      evidenceSatisfied = false;
      policyFailureReason = 'Missing verified customer order.';
    } else if (successfulPayments.length < 2) {
      evidenceSatisfied = false;
      policyFailureReason = 'Payment gateway records do not confirm multiple successful charges for this order.';
    }
  } else if (matchedPolicy === 'POLICY1') {
    // Mismatched payment status
    const deductedFailed = (investigation.focusPayments || investigation.payments || []).filter(
      (p) => p.gatewayStatus === 'success' && p.localStatus === 'failed'
    );
    if (deductedFailed.length === 0) {
      evidenceSatisfied = false;
      policyFailureReason = 'No gateway deduction with failed local order found.';
    }
  } else if (matchedPolicy === 'POLICY2') {
    // Pending refund: refund record exists and status === 'pending'
    const pendingRefund = (investigation.focusRefunds || investigation.refunds || []).find(
      (r) => r.customerId === investigation.customer.id && r.status === 'pending'
    );
    if (!pendingRefund) {
      evidenceSatisfied = false;
      policyFailureReason = 'No pending refund record found in backend.';
    }
  } else if (matchedPolicy === 'POLICY4') {
    // Return received refund eligibility
    if (!investigation.focusOrder || (investigation.focusOrder.status !== 'returned' && investigation.focusOrder.returnStatus !== 'item_received_warehouse')) {
      evidenceSatisfied = false;
      policyFailureReason = 'Order is not verified as returned in logistics system.';
    }
  } else if (matchedPolicy === 'POLICY5') {
    // Cancelled order
    if (!investigation.focusOrder || investigation.focusOrder.status !== 'cancelled') {
      evidenceSatisfied = false;
      policyFailureReason = 'Order is not recorded as cancelled in backend.';
    }
  } else if (matchedPolicy === 'POLICY11') {
    // Order in-transit status
    if (!investigation.focusOrder || (investigation.focusOrder.status !== 'in_transit' && !investigation.focusOrder.courierTracking)) {
      evidenceSatisfied = false;
      policyFailureReason = 'Order is not in transit.';
    }
  } else if (matchedPolicy === 'POLICY3') {
    // Return window
    if (!investigation.focusOrder || investigation.focusOrder.status !== 'delivered') {
      evidenceSatisfied = false;
      policyFailureReason = 'Order is not delivered or return already requested.';
    }
  }

  // 2.0: Delay compensation is an offer the customer must choose (credit vs expedite)
  if (matchedPolicy === 'POLICY11' && evidenceSatisfied && orderVerified && confidence >= 60) {
    const o = investigation.focusOrder;
    const today = new Date().toISOString().slice(0, 10);
    const delayed = o.courierStatus === 'delayed' || (o.estimatedDelivery && o.estimatedDelivery < today);
    if (delayed) {
      return {
        decision: 'CUSTOMER_CONFIRM',
        reasoning: `Order ${o.id} is past its expected delivery date (ETA ${o.estimatedDelivery || 'unknown'}, courier status: ${o.courierStatus || 'in transit'}). Eligible under POLICY11 for a shipping credit or expedited redelivery; the customer chooses the remedy.`,
        confidence,
        sentimentNote: `Note: Decision based on verified delivery records, not sentiment (${analysis.sentiment}).`,
      };
    }
  }

  // 5. Confidence threshold: >= 85
  // 6. Category safe for automation (not security, not damage dispute)
  if (confidence >= 85 && evidenceSatisfied && (orderVerified || !orderRequired)) {
    return {
      decision: 'AUTO_RESOLVE',
      reasoning: `High confidence (${confidence}%) and verified evidence satisfies policy ${matchedPolicy} conditions for customer ${investigation.customer.id}. Safe for automated resolution.`,
      confidence,
      sentimentNote: `Note: Decision based strictly on verified records and policy criteria, not sentiment (${analysis.sentiment}).`,
    };
  }

  // Medium confidence or needs customer approval (e.g. return initiation or cancellation verification)
  if (confidence >= 60 && evidenceSatisfied) {
    return {
      decision: 'CUSTOMER_CONFIRM',
      reasoning: `Verified records match policy ${matchedPolicy} with ${confidence}% confidence, but customer confirmation is recommended before finalizing.`,
      confidence,
      sentimentNote: `Note: Decision based on policy requirements, not sentiment (${analysis.sentiment}).`,
    };
  }

  // Otherwise, escalate
  return {
    decision: 'HUMAN_ESCALATION',
    reasoning: policyFailureReason
      ? `${policyFailureReason} Insufficient verified evidence to auto-resolve.`
      : `Confidence score (${confidence}%) below automation threshold or evidence incomplete. Requires human investigation.`,
    confidence,
    sentimentNote: `Note: Decision based on verified evidence completeness, not sentiment (${analysis.sentiment}).`,
  };
}

module.exports = { decide };
