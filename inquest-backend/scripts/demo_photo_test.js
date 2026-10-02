require('dotenv').config();
const fs = require('fs');
const path = require('path');
const BASE = `http://localhost:${process.env.PORT || 5001}`;
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('Usage: node scripts/demo_photo_test.js /path/to/damaged-item-photo.jpg'); process.exit(1); }

const mime = { '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file).toLowerCase()] || 'image/jpeg';
const TEXT = 'my ORDER299 phone arrived with a cracked broken screen, please refund';

async function submit(label, withPhoto) {
  const fd = new FormData();
  fd.append('customerId', 'CUST004');
  fd.append('complaintText', TEXT);
  if (withPhoto) fd.append('photos', new Blob([fs.readFileSync(file)], { type: mime }), path.basename(file));
  const j = await (await fetch(BASE + '/api/complaints', { method: 'POST', body: fd })).json();
  if (!j.success) { console.log(`\n${label}\n  ERROR: ${j.error}`); return; }
  const d = j.data, p = d.photo || {}, v = p.vision;
  console.log(`\n${label}`);
  console.log(`  decision : ${d.decision.decision} (${d.rootCause.matchedPolicy})`);
  console.log(`  reasoning: ${d.decision.reasoning}`);
  console.log(`  photo    : provided=${p.provided} reused=${p.reuse && p.reuse.detected} analyzed=${p.analyzed}${p.error ? ' error=' + p.error : ''}`);
  if (v) console.log(`  vision   : match=${v.productMatchesOrder} damage=${v.damageVisible} consistent=${v.damageConsistentWithComplaint} stock/edited=${v.looksLikeStockOrScreenshot || v.looksEditedOrAiGenerated} conf=${v.confidence}`);
  console.log(`  refund   : ${d.actions.refund ? d.actions.refund.id + ' INR ' + d.actions.refund.amount : 'none'}   skipped: ${d.actions.skipped || '-'}   audit: ${d.auditId}`);
}

(async () => {
  await submit('B0  no photo (must escalate)', false);
  await submit('B   damaged item + photo', true);
  await submit('C   same photo again (hash reuse, must escalate)', true);
})();
