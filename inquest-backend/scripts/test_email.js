require('dotenv').config();
const { sendEmail } = require('../src/services/emailService');
const to = process.argv[2];
if (!to) { console.log('Usage: node scripts/test_email.js you@example.com'); process.exit(1); }
sendEmail({ to, subject: '[Inquest] Test email', text: 'If you can read this, Inquest email is configured correctly.' })
  .then(() => { console.log(process.env.SMTP_HOST ? 'Tried to send via SMTP. Check your inbox and the email_outbox table.' : 'No SMTP configured: logged only (see email_outbox).'); process.exit(0); });
