require('dotenv').config();
const db = require('../src/db/connection');
const { listRisk } = require('../src/services/riskEngine');
const BASE = `http://localhost:${process.env.PORT || 5001}`;
const ID = 'CUSTRISK';
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

function cleanup() {
  ['payments', 'refunds', 'tickets', 'orders'].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE customerId=?`).run(ID));
  db.prepare('DELETE FROM customers WHERE id=?').run(ID);
}

function seed() {
  cleanup();
  db.prepare('INSERT INTO customers (id,name,email,tier,joinedDate,joinedOn) VALUES (?,?,?,?,?,?)')
    .run(ID, 'Synthetic Abuser', 'abuse@example.com', 'silver', iso(5).slice(0, 10), iso(5).slice(0, 10));
  for (let i = 1; i <= 5; i++) {
    db.prepare("INSERT INTO orders (id,customerId,product,amount,status) VALUES (?,?,?,?,'delivered')")
      .run(`ORDER900${i}`, ID, 'Gadget', 1000);
  }
  ['PAYX1', 'PAYX2'].forEach((p, i) => db.prepare(
    "INSERT INTO payments (id,orderId,customerId,amount,status,gatewayStatus,localStatus,gatewayRef,timestamp) VALUES (?,?,?,?,'success','success','success',?,?)")
    .run(p, 'ORDER9001', ID, 1000, `gw_x_${i}`, iso(1)));
  for (let i = 2; i <= 5; i++) {
    db.prepare("INSERT INTO refunds (id,orderId,customerId,amount,status,initiatedAt,reason) VALUES (?,?,?,?,'completed',?,'Damaged item refund')")
      .run(`SYN00${i}`, `ORDER900${i}`, ID, 1000, iso(i * 5));
  }
  for (let i = 1; i <= 3; i++) {
    db.prepare("INSERT INTO tickets (id,customerId,category,subject,status,date) VALUES (?,?,'delivery','Item not received','resolved',?)")
      .run(`TICKETX0${i}`, ID, iso(i * 20).slice(0, 10));
  }
}

(async () => {
  seed();
  const res = await (await fetch(BASE + '/api/complaints', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: ID, complaintText: 'bhai payment 2 baar kat gyi order ORDER9001, please jaldi fix karo' }),
  })).json();
  if (!res.success) { console.log('ERROR', res.error); cleanup(); return; }
  const d = res.data;
  console.log('\nSynthetic abuser, duplicate payment complaint');
  console.log('  risk     :', d.risk.score + '/100', d.risk.level);
  d.risk.signals.forEach((s) => console.log(`             ${s.points > 0 ? '+' : ''}${s.points}  ${s.detail}`));
  console.log('  decision :', d.decision.decision, `(${d.rootCause.matchedPolicy})`);
  console.log('  reasoning:', d.decision.reasoning);
  console.log('  refund   :', d.actions.refund ? d.actions.refund.id : 'none (correct)');
  cleanup();

  console.log('\nRisk board (real demo customers):');
  listRisk().filter((c) => c.customerId !== ID).forEach((c) =>
    console.log(`  ${c.customerId}  ${String(c.score).padStart(3)}  ${c.level.padEnd(6)} ${c.name}`));
})();
