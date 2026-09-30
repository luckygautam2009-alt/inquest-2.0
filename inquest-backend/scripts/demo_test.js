require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5001}`;
const PW = process.env.ADMIN_PASSWORD;
const post = async (path, body) => (await fetch(BASE + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})).json();

const cases = [
  ['A  duplicate payment', 'CUST001', 'bhai payment 2 baar kat gyi order #456, please jaldi fix karo'],
  ['A2 same complaint again (must NOT refund twice)', 'CUST001', 'bhai payment 2 baar kat gyi order #456, please jaldi fix karo'],
  ['D  security concern', 'CUST002', 'someone accessed my account without my permission'],
];

(async () => {
  for (const [label, cust, text] of cases) {
    const j = await post('/api/complaints', { customerId: cust, complaintText: text });
    if (!j.success) { console.log(label, '-> ERROR', j.error); continue; }
    const a = j.data.actions;
    console.log(`\n${label}\n  decision : ${j.data.decision.decision} (${j.data.rootCause.matchedPolicy})\n  auditId  : ${j.data.auditId}` +
      `\n  refund   : ${a.refund ? a.refund.id + ' INR ' + a.refund.amount + ' ' + a.refund.status : 'none'}` +
      `\n  ticket   : ${a.ticket ? a.ticket.id + ' ' + a.ticket.status + (a.ticket.reused ? ' (reused)' : '') : 'none'}` +
      `\n  skipped  : ${a.skipped || '-'}   error: ${a.error || '-'}`);
  }
  const log = await post('/api/admin/audit', { adminPassword: PW, limit: 3 });
  console.log('\naudit chain:', JSON.stringify(log.data && log.data.chain));
})();
