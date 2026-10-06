import { getAdminToken } from '../auth/adminSession';
import { getToken } from '../auth/tokenStore';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getAdminToken() ? { 'X-Admin-Token': getAdminToken() } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (res.status === 401 && path.startsWith('/admin') && getAdminToken()) {
    window.dispatchEvent(new Event('inquest:admin-expired'));
  }
  if (res.status === 401 && token && !path.startsWith('/admin') && !path.startsWith('/auth/login') && !path.startsWith('/auth/signup')) {
    window.dispatchEvent(new Event('inquest:auth-expired'));
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.details = data.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function requestMultipart(path, formData, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.data?.reason || (data.details?.length
        ? `${data.error}: ${data.details.map((d) => d.message).join(', ')}`
        : data.error || 'Verification request failed');
      const err = new Error(msg);
      err.status = res.status;
      err.details = data.details;
      err.data = data.data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Verification timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function submitComplaint(customerId, complaintText, photos = [], opts = {}) {
  if (!photos.length) {
    return request('/complaints', {
      method: 'POST',
      body: JSON.stringify({ customerId, complaintText }),
      headers: opts.skipAuth ? { Authorization: '' } : undefined,
    });
  }
  const fd = new FormData();
  fd.append('customerId', customerId);
  fd.append('complaintText', complaintText);
  photos.forEach((f) => fd.append('photos', f));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const t = opts.skipAuth ? null : getToken();
    const res = await fetch(`${BASE_URL}/complaints`, { method: 'POST', body: fd, signal: controller.signal, headers: t ? { Authorization: `Bearer ${t}` } : {} });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.details = data.details;
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.status === 401 && getToken()) window.dispatchEvent(new Event('inquest:auth-expired'));
    if (err.name === 'AbortError') throw new Error('Request timed out while analysing the photo. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function getCustomers() {
  return request('/customers');
}

export function createCustomer(payload) {
  return request('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCustomerContext(customerId) {
  return request(`/customers/${customerId}/context`);
}

export function checkHealth() {
  return request('/health');
}

// ── Verification ──
export function getReferenceStatus() {
  return request('/verify/reference/status');
}

export function uploadReferenceIdCard({ file, adminPassword }) {
  const fd = new FormData();
  fd.append('idCard', file);
  fd.append('adminPassword', adminPassword);
  return requestMultipart('/verify/reference', fd);
}

export function verifyEmployee({ file, employeeName, employeeEmail, adminPassword }) {
  const fd = new FormData();
  fd.append('idCard', file);
  fd.append('employeeName', employeeName);
  fd.append('employeeEmail', employeeEmail);
  fd.append('adminPassword', adminPassword);
  return requestMultipart('/verify', fd);
}

// ── Admin ──
export function getAdminOverview(adminPassword) {
  return request('/admin/overview', {
    method: 'POST',
    body: JSON.stringify({ adminPassword }),
  });
}

export function getOrCreateAdminProfile({ email, name, adminPassword }) {
  return request('/admin/profile', {
    method: 'POST',
    body: JSON.stringify({ email, name, adminPassword }),
  });
}

export function updateAdminProfilePhoto({ email, photo, adminPassword }) {
  return request('/admin/profile/photo', {
    method: 'POST',
    body: JSON.stringify({ email, photo, adminPassword }),
  });
}

export function updateAdminProfileName({ email, name, adminPassword }) {
  return request('/admin/profile/name', {
    method: 'POST',
    body: JSON.stringify({ email, name, adminPassword }),
  });
}

// ── 2.0 admin: audit, override, analytics, risk ──
function adminPost(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}
export const getAuditLog = ({ adminPassword, limit = 100 }) => adminPost('/admin/audit', { adminPassword, limit });
export const overrideDecision = (payload) => adminPost('/admin/override', payload);
export const getAnalytics = ({ adminPassword }) => adminPost('/admin/analytics', { adminPassword });
export const getRiskBoard = ({ adminPassword }) => adminPost('/admin/risk', { adminPassword });

// ── Live demo store ──
export const getShopProducts = () => request('/shop/products');
export const placeShopOrder = (payload) => request('/shop/orders', { method: 'POST', body: JSON.stringify(payload) });
export const getShopOrders = (customerId) => request(`/shop/orders/${customerId}`);
export const simulateShopOrder = (orderId, customerId, action) =>
  request(`/shop/orders/${orderId}/simulate`, { method: 'POST', body: JSON.stringify({ customerId, action }) });

// ── Customer confirmation of proposed resolutions ──
export const confirmProposal = (payload) => request('/complaints/confirm', { method: 'POST', body: JSON.stringify(payload) });

// ── Customer accounts ──
export const getAuthConfig = () => request('/auth/config');
export const authSignup = (payload) => request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
export const authLogin = (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
export const authMe = () => request('/auth/me');
export const authLogout = () => request('/auth/logout', { method: 'POST' });

// ── Customer: complaints and notifications ──
export const getMyComplaints = () => request('/me/complaints');
export const getMyNotifications = () => request('/me/notifications');
export const markMyNotificationsRead = (ids) => request('/me/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
export async function registerComplaint({ orderId, complaintText, issueKey, photos = [] }) {
  const fd = new FormData();
  if (orderId) fd.append('orderId', orderId);
  fd.append('complaintText', complaintText);
  if (issueKey) fd.append('issueKey', issueKey);
  photos.forEach((f) => fd.append('photos', f));
  const t = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE_URL}/me/complaints`, { method: 'POST', body: fd, signal: controller.signal, headers: t ? { Authorization: `Bearer ${t}` } : {} });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      if (res.status === 401 && t) window.dispatchEvent(new Event('inquest:auth-expired'));
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The upload took too long. Please try again with smaller photos.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Admin: session, complaints, automation ──
export const createAdminSession = (payload) => request('/admin/session', { method: 'POST', body: JSON.stringify(payload) });
export const adminCheck = () => request('/admin/settings', { method: 'POST', body: '{}' });
export const setAutoMode = (autoInvestigate) => request('/admin/settings', { method: 'POST', body: JSON.stringify(typeof autoInvestigate === 'boolean' ? { autoInvestigate } : {}) });
export const getAdminComplaints = ({ status, search } = {}) => request('/admin/complaints', { method: 'POST', body: JSON.stringify({ status, search }) });
export const getAdminComplaintDetail = (complaintId) => request('/admin/complaints/detail', { method: 'POST', body: JSON.stringify({ complaintId }) });
export const investigateAdminComplaint = (complaintId, force = false) => request('/admin/complaints/investigate', { method: 'POST', body: JSON.stringify({ complaintId, force }) });
export const resolveAdminComplaint = (payload) => request('/admin/complaints/resolve', { method: 'POST', body: JSON.stringify(payload) });
