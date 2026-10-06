const { analyzeComplaint } = require('./intentEngine');
const { investigate } = require('./investigationEngine');
const { findRootCause } = require('./rootCauseEngine');
const { decide } = require('./decisionEngine');
const { buildHandoff } = require('./handoffEngine');
const { buildEvidenceGraph } = require('./graphBuilder');
const dataStore = require('./dataStore');
const { computeRisk } = require('./riskEngine');
const { assessPhotos } = require('./photoEvidenceService');
const { executeActions } = require('./actionExecutor');
const audit = require('./auditService');

const ORDER_INTENTS = ['payment/billing', 'payment', 'cancellation', 'refund/return', 'refund', 'order_status/delay', 'product_issue'];

// When the only blocker is MISSING information the customer can supply, ask for it instead of burdening a human
function refineDecision({ decision, analysis, rootCause, investigation, photo }) {
  // The customer never named an order and the engine only guessed one: ask, do not act on a guess
  if (!investigation.orderHintDetected && investigation.focusOrder && ['AUTO_RESOLVE', 'CUSTOMER_CONFIRM'].includes(decision.decision) && ORDER_INTENTS.includes(analysis.intent)) {
    return {
      ...decision, decision: 'NEEDS_INFO',
      reasoning: `The complaint did not name an order. The closest match is ${investigation.focusOrder.id}, but nothing is resolved on a guess.`,
      infoRequest: `We could not tell which order you mean. Please reply with the order ID (for example ${investigation.focusOrder.id}) so we can check the right one.`,
    };
  }
  if (decision.decision !== 'HUMAN_ESCALATION') return decision;
  const noOrderMentioned = !investigation.focusOrder && !investigation.orderMismatch && !investigation.orderHintDetected;
  if (noOrderMentioned && (ORDER_INTENTS.includes(analysis.intent) || analysis.intent === 'other/ambiguous')) {
    return {
      ...decision, decision: 'NEEDS_INFO',
      reasoning: 'The complaint does not say which order it is about, so nothing can be verified yet.',
      infoRequest: 'Please tell us which order this is about (the order ID, for example ORDER1001) and describe what went wrong.',
    };
  }
  if (['POLICY6', 'POLICY8'].includes(rootCause.matchedPolicy) && investigation.orderVerified && !(photo && photo.provided)) {
    return {
      ...decision, decision: 'NEEDS_INFO',
      reasoning: 'A photo of the item is needed to verify its condition before any resolution.',
      infoRequest: 'Please send a clear photo of the item showing the problem (and the shipping label if possible).',
    };
  }
  return decision;
}

// The investigation pipeline, reusable. autoPolicy decides what may be executed without a human;
// without autoExecute it is a DRY RUN (recommend + log, but no refunds or tickets).
async function runInvestigation({ customerId, complaintText, files = [], complaintId = null, autoPolicy = null, autoExecute = false, extraEvidence = {} }) {
  if (!dataStore.getCustomerById(customerId)) return { error: { status: 404, message: `Customer not found: ${customerId}` } };

  const analysis = await analyzeComplaint(complaintText);
  const entityHints = [analysis.orderReference, ...((analysis.entities && analysis.entities.orderReferences) || [])].filter(Boolean);
  const investigation = investigate(customerId, complaintText, entityHints);
  if (!investigation.found) return { error: { status: 404, message: investigation.error } };

  const rootCause = await findRootCause(complaintText, analysis, investigation);
  const risk = computeRisk(customerId);

  const physicalClaim = ['product_issue', 'product_quality'].includes(analysis.intent) || ['POLICY6', 'POLICY8'].includes(rootCause.matchedPolicy);
  let photo = { provided: files.length, analyzed: false, vision: null, reuse: { detected: false, detail: null }, hashes: [], error: null };
  if (files.length && physicalClaim) {
    photo = await assessPhotos({ files, customerId, order: investigation.focusOrder, complaintText, complaintId });
  }

  const decision = refineDecision({ decision: decide(complaintText, analysis, rootCause, investigation, risk, photo), analysis, rootCause, investigation, photo });
  const built = buildHandoff(investigation, rootCause, decision);
  const handoff = decision.decision === 'NEEDS_INFO'
    ? { ...built, type: 'NEEDS_INFO', suggestedAction: 'Ask the customer for the missing information', customerMessage: decision.infoRequest }
    : built;
  const evidenceGraph = buildEvidenceGraph(investigation, rootCause, decision);

  const automation = autoPolicy ? autoPolicy({ decision, risk, investigation, rootCause, photo }) : null;
  const execute = !!(autoExecute && automation && automation.kind === 'EXECUTE');
  const actions = execute ? executeActions({ customerId, analysis, rootCause, decision, investigation }) : null;
  const auditId = audit.logDecision({
    customerId, complaintText, analysis, rootCause, decision, investigation, actions, risk, photo,
    extra: { ...extraEvidence, dryRun: !execute, automation },
  });

  return { data: { customerId, complaintText, analysis, investigation, rootCause, decision, handoff, evidenceGraph, risk, photo, actions, auditId, automation, proposal: null, complaintId } };
}

module.exports = { runInvestigation };
