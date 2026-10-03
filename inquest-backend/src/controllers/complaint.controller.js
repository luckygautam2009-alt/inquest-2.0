const { analyzeComplaint } = require('../services/intentEngine');
const { investigate } = require('../services/investigationEngine');
const { findRootCause } = require('../services/rootCauseEngine');
const { decide } = require('../services/decisionEngine');
const { buildHandoff } = require('../services/handoffEngine');
const { buildEvidenceGraph } = require('../services/graphBuilder');
const dataStore = require('../services/dataStore');
const audit = require('../services/auditService');
const { executeActions } = require('../services/actionExecutor');
const { computeRisk } = require('../services/riskEngine');
const { assessPhotos } = require('../services/photoEvidenceService');
const { createProposal } = require('../services/proposalService');

async function submitComplaint(req, res) {
  const { complaintText, customerId } = req.body;
  const totalStart = Date.now();

  // Fast pre-flight customer check
  const customerExists = dataStore.getCustomerById(customerId);
  if (!customerExists) {
    return res.status(404).json({
      success: false,
      error: `Customer not found: ${customerId}`,
    });
  }

  // 1. Semantic understanding
  const tAnalysisStart = Date.now();
  const analysis = await analyzeComplaint(complaintText);
  const complaintAnalysisMs = Date.now() - tAnalysisStart;

  // 2. Customer investigation with entity hints (strictly isolated to customerId)
  const tInvStart = Date.now();
  const entityHints = [
    analysis.orderReference,
    ...(analysis.entities?.orderReferences || []),
  ].filter(Boolean);

  const investigation = investigate(customerId, complaintText, entityHints);
  const investigationMs = Date.now() - tInvStart;

  if (!investigation.found) {
    return res.status(404).json({ success: false, error: investigation.error });
  }

  // 3. Root cause & policy evaluation
  const tRcStart = Date.now();
  const rootCause = await findRootCause(complaintText, analysis, investigation);
  const rootCauseMs = Date.now() - tRcStart;

  // 4. Decision engine
  const tDecStart = Date.now();
  const risk = computeRisk(customerId);

  // 3b. Photo evidence (2.0): hash check + vision claims, only for physical-product claims
  const files = req.files || [];
  const physicalClaim =
    ['product_issue', 'product_quality'].includes(analysis.intent) ||
    ['POLICY6', 'POLICY8'].includes(rootCause.matchedPolicy);
  let photo = { provided: files.length, analyzed: false, vision: null, reuse: { detected: false, detail: null }, hashes: [], error: null };
  if (files.length && physicalClaim) {
    photo = await assessPhotos({ files, customerId, order: investigation.focusOrder, complaintText });
  }

  const decision = decide(complaintText, analysis, rootCause, investigation, risk, photo);
  const decisionMs = Date.now() - tDecStart;

  // 5. Handoff generation & Evidence graph construction (run in parallel)
  const tHandoffStart = Date.now();
  const [handoff, evidenceGraph] = await Promise.all([
    Promise.resolve(buildHandoff(investigation, rootCause, decision)),
    Promise.resolve(buildEvidenceGraph(investigation, rootCause, decision)),
  ]);
  const handoffMs = Date.now() - tHandoffStart;

  const actions = executeActions({ customerId, analysis, rootCause, decision, investigation });
  const auditId = audit.logDecision({ customerId, complaintText, analysis, rootCause, decision, investigation, actions, risk, photo });
  const proposal = createProposal({ auditId, customerId, decision, rootCause, investigation });

  const totalMs = Date.now() - totalStart;

  console.log(
    `[Inquest Timing] Investigation: ${investigationMs} ms | Complaint Analysis: ${complaintAnalysisMs} ms | Root Cause: ${rootCauseMs} ms | Decision: ${decisionMs} ms | Handoff: ${handoffMs} ms | Total: ${totalMs} ms`
  );

  res.status(200).json({
    success: true,
    data: {
      customerId,
      complaintText,
      analysis,
      investigation,
      rootCause,
      decision,
      handoff,
      evidenceGraph,
      auditId,
      actions,
      risk,
      photo,
      proposal,
    },
  });
}

module.exports = { submitComplaint };
