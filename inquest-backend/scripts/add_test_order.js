const db = require('../src/db/connection');
db.prepare(`INSERT OR REPLACE INTO orders (id,customerId,product,amount,status,deliveredAt,deliveredOn,returnRequested)
  VALUES ('ORDER299','CUST004','Smartphone',4500,'delivered','2026-09-28T10:00:00Z','2026-09-28',0)`).run();
console.log('test order ORDER299 (Smartphone, INR 4500) added for CUST004');
