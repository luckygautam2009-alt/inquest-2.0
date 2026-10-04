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

// The same pipeline as POST /api/complaints, reusable. With execute=false it is a DRY RUN:
// it recommends a decision and logs it, but moves no money and creates no tickets.
async function runInvestigation({ customerId, complaintText, files = [], execute = false, complaintId = null, extraEvidence = {} }) {
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

  const decision = decide(complaintText, analysis, rootCause, investigation, risk, photo);
  const handoff = buildHandoff(investigation, rootCause, decision);
  const evidenceGraph = buildEvidenceGraph(investigation, rootCause, decision);
  const actions = execute ? executeActions({ customerId, analysis, rootCause, decision, investigation }) : null;
  const auditId = audit.logDecision({ customerId, complaintText, analysis, rootCause, decision, investigation, actions, risk, photo, extra: extraEvidence });

  return { data: { customerId, complaintText, analysis, investigation, rootCause, decision, handoff, evidenceGraph, risk, photo, actions, auditId, proposal: null, complaintId } };
}

module.exports = { runInvestigation };
