const db = require('../src/db/connection');
const { computeRisk } = require('../src/services/riskEngine');
const rows = db.prepare('SELECT id, customerId, status, decision, confidence, decisionReason, automation FROM complaints ORDER BY id DESC LIMIT 25').all();
console.log(`${rows.length} most recent complaints\n`);
for (const r of rows) {
  let failed = '';
  try { failed = (JSON.parse(r.automation || '{}').gates || []).filter((g) => !g.ok).map((g) => g.label).join('; '); } catch { /* ignore */ }
  const risk = computeRisk(r.customerId);
  console.log(`#${r.id} ${r.customerId} | ${r.status} | ${r.decision || '-'} ${r.confidence || ''} | risk ${risk ? risk.score : '-'}\n     ${failed ? 'FAILED GATE: ' + failed : (r.decisionReason || '').slice(0, 140)}`);
}
