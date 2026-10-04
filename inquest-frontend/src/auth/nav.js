// Tiny client-side navigation helper (App listens to popstate)
export function goTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
