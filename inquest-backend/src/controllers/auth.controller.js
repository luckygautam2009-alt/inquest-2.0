const authService = require('../services/authService');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(v) { return String(v == null ? '' : v); }

function signup(req, res) {
  const name = clean(req.body && req.body.name).replace(/[\u0000-\u001f]/g, '').trim();
  const email = clean(req.body && req.body.email).trim();
  const password = clean(req.body && req.body.password);
  if (name.length < 2 || name.length > 80) return res.status(400).json({ success: false, error: 'Name must be 2-80 characters' });
  if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ success: false, error: 'Enter a valid email address' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ success: false, error: 'Password must be 8-128 characters' });
  const out = authService.signup({ name, email, password });
  if (out.status !== 201) return res.status(out.status).json({ success: false, error: out.error });
  res.status(201).json({ success: true, data: { token: out.token, expiresAt: out.expiresAt, customer: out.customer } });
}

function login(req, res) {
  const email = clean(req.body && req.body.email).trim();
  const password = clean(req.body && req.body.password);
  if (!email || !password || password.length > 128) return res.status(400).json({ success: false, error: 'Email and password are required' });
  const out = authService.login({ email, password });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: { token: out.token, expiresAt: out.expiresAt, customer: out.customer } });
}

function me(req, res) {
  res.status(200).json({ success: true, data: req.customer });
}

function logout(req, res) {
  authService.logout(req.sessionToken);
  res.status(200).json({ success: true, data: { loggedOut: true } });
}

module.exports = { signup, login, me, logout };
