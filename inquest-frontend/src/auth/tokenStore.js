const TOKEN_KEY = 'inquest.token';
const CUSTOMER_KEY = 'inquest.customer';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getStoredCustomer() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null'); } catch { return null; }
}

export function setSession(token, customer) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  } catch { /* storage unavailable */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
  } catch { /* storage unavailable */ }
}
