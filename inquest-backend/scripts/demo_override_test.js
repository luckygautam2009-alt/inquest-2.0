require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5001}`;
const PW = process.env.ADMIN_PASSWORD;
const post = async (p, b) => (await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();

(async () => {
  const c = await post('/api/complaints', { customerId: 'CUST001', complaintText: 'bhai payment 2 baar kat gyi order #456, please jaldi fix karo' });
  if (!c.success) return console.log('ERROR', c.error);
  const d = c.data;
  console.log(`\n1) AI decision : ${d.decision.decision} (${d.rootCause.matchedPolicy})  audit #${d.auditId}`);
  console.log(`   refund      : ${d.actions.refund ? d.actions.refund.id + ' ' + d.actions.refund.status : 'none'} ${d.actions.skipped ? '(skipped: ' + d.actions.skipped + ')' : ''}`);
  if (!d.actions.refund) return console.log('   -> no refund to undo. Run: node scripts/reset_demo.js  and retry');

  const adm = { adminPassword: PW, employeeName: 'Yash Gautam', employeeEmail: 'yash@example.com' };
  const o1 = await post('/api/admin/override', { ...adm, auditId: d.auditId, type: 'UNDO', reason: 'Customer confirmed bank already reversed the duplicate charge' });
  console.log('\n2) Admin UNDO  :', JSON.stringify(o1));
  const o2 = await post('/api/admin/override', { ...adm, auditId: d.auditId, type: 'UNDO', reason: 'second attempt should be blocked' });
  console.log('3) UNDO again  :', JSON.stringify(o2), '(must fail)');
  const o3 = await post('/api/admin/override', { adminPassword: PW, auditId: d.auditId, type: 'UNDO', reason: 'x' });
  console.log('4) bad request :', JSON.stringify(o3), '(must fail)');

  const a = await post('/api/admin/analytics', { adminPassword: PW });
  console.log('\n5) Analytics   :', JSON.stringify(a.data, null, 1));
  const log = await post('/api/admin/audit', { adminPassword: PW, limit: 2 });
  console.log('\n6) Audit chain :', JSON.stringify(log.data.chain));
  console.log('   latest entry:', log.data.entries[0].entryType, log.data.entries[0].decision, 'by', log.data.entries[0].actor);
})();
