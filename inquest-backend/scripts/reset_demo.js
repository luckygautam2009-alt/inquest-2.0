const db = require('../src/db/connection');
const r = db.prepare("DELETE FROM refunds WHERE id LIKE 'RFD%'").run().changes;
const t = db.prepare("DELETE FROM tickets WHERE subject LIKE 'Auto-resolved:%' OR subject LIKE 'Escalated:%'").run().changes;
console.log(`reset: removed ${r} auto refunds, ${t} auto tickets`);
try { console.log(`reset: cleared ${db.prepare('DELETE FROM image_hashes').run().changes} image hashes`); }
catch (e) { console.log('reset: image_hashes table not created yet'); }
