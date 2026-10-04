const db = require('../db/connection');

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* optional dependency */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    toEmail TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    createdAt TEXT NOT NULL
  );
`);

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  if (!nodemailer || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendEmail({ to, subject, text }) {
  const log = (status, error) => db.prepare('INSERT INTO email_outbox (toEmail, subject, body, status, error, createdAt) VALUES (?,?,?,?,?,?)')
    .run(to, subject, text, status, error || null, new Date().toISOString());
  const t = getTransporter();
  if (!t) {
    console.log(`[email:dev] to=${to} | ${subject}`);
    log('logged');
    return;
  }
  try {
    const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' +
      esc(text).split('\n').map((l) => (l ? `<p style="margin:0 0 10px">${l}</p>` : '')).join('') + '</div>';
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    log('sent');
  } catch (err) {
    console.error('[email] send failed:', err.message);
    log('failed', String(err.message).slice(0, 300));
  }
}

function sendToCustomer(customerId, subject, text) {
  try {
    const c = db.prepare('SELECT name, email FROM customers WHERE id=?').get(customerId);
    if (!c || !c.email) return;
    sendEmail({
      to: c.email,
      subject: `[Inquest] ${subject}`,
      text: `Hi ${c.name || 'there'},\n\n${text}\n\nThank you,\nInquest Support`,
    }).catch(() => {});
  } catch (err) {
    console.error('[email] sendToCustomer failed:', err.message);
  }
}

module.exports = { sendEmail, sendToCustomer };
