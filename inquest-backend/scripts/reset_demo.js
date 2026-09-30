const db = require('../src/db/connection');
const r = db.prepare("DELETE FROM refunds WHERE id LIKE 'RFD%'").run().changes;
const t = db.prepare("DELETE FROM tickets WHERE subject LIKE 'Auto-resolved:%' OR subject LIKE 'Escalated:%'").run().changes;
console.log(`reset: removed ${r} auto refunds, ${t} auto tickets`);
