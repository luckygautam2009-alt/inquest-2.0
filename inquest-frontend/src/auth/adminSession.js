const KEY = 'inquest.adminSession';

export function getAdminSession() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function getAdminToken() {
  const s = getAdminSession();
  return s && s.token ? s.token : null;
}

export function saveAdminSession({ token, expiresAt, admin }) {
  try { localStorage.setItem(KEY, JSON.stringify({ token, expiresAt, name: admin.name, email: admin.email })); } catch { /* storage unavailable */ }
}

export function clearAdminSession() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
