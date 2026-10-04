const config = require('../config/env');
const adminSessions = require('../services/adminSessionService');
const complaints = require('../services/complaintService');
const settings = require('../services/settingsService');
const { autoEnabled, thresholds } = require('../services/automationPolicy');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ACTIONS = ['CONFIRM_AI', 'SEND_OFFER', 'REFUND', 'NO_REFUND', 'REQUEST_INFO'];

function createSession(req, res) {
  const { adminPassword, employeeName, employeeEmail } = req.body || {};
  if (!config.adminPassword) return res.status(500).json({ success: false, error: 'Admin password not configured on server' });
  if (!adminPassword || adminPassword !== config.adminPassword) return res.status(401).json({ success: false, error: 'Invalid admin password' });
  const name = String(employeeName || '').trim();
  const email = String(employeeEmail || '').trim().toLowerCase();
  if (!name || name.length > 80) return res.status(400).json({ success: false, error: 'employeeName is required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'valid employeeEmail is required' });
  const s = adminSessions.create({ name, email });
  res.status(200).json({ success: true, data: { token: s.token, expiresAt: s.expiresAt, admin: { name, email } } });
}

function list(req, res) {
  const { status, search } = req.body || {};
  res.status(200).json({ success: true, data: complaints.listForAdmin({ status: status ? String(status) : undefined, search: search ? String(search).slice(0, 80) : undefined }) });
}

function detail(req, res) {
  const id = Number(req.body && req.body.complaintId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'complaintId must be a positive integer' });
  const d = complaints.detail(id);
  if (!d) return res.status(404).json({ success: false, error: 'Complaint not found' });
  res.status(200).json({ success: true, data: d });
}

async function investigate(req, res) {
  const id = Number(req.body && req.body.complaintId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'complaintId must be a positive integer' });
  const out = await complaints.investigate(id, { force: req.body && req.body.force === true });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: out.data, cached: !!out.cached });
}

async function resolve(req, res) {
  const { complaintId, action, amount, customerMessage, note } = req.body || {};
  const id = Number(complaintId);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'complaintId must be a positive integer' });
  if (!ACTIONS.includes(action)) return res.status(400).json({ success: false, error: `action must be one of ${ACTIONS.join(', ')}` });
  const out = await complaints.resolve({
    complaintId: id, action, amount,
    customerMessage: customerMessage ? String(customerMessage).trim().slice(0, 300) : null,
    note: note ? String(note).slice(0, 500) : null,
    admin: req.admin,
  });
  if (out.status !== 200) return res.status(out.status).json({ success: false, error: out.error });
  res.status(200).json({ success: true, data: out.data });
}

function file(req, res) {
  const f = complaints.getFile({ complaintId: Number(req.params.id), fileId: Number(req.params.fileId) });
  if (!f) return res.status(404).json({ success: false, error: 'Not found' });
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(f.data);
}

function automationSettings(req, res) {
  const body = req.body || {};
  if (typeof body.autoInvestigate === 'boolean') settings.set('autoInvestigate', body.autoInvestigate ? 'true' : 'false');
  res.status(200).json({ success: true, data: { autoInvestigate: autoEnabled(), thresholds: thresholds() } });
}

module.exports = { createSession, list, detail, investigate, resolve, file, automationSettings };
