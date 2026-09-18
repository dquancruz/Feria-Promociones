// A full reload re-runs the app's initial load against the fresh session the backend just
// issued, instead of manually clearing every piece of state. Kept behind a function so
// tests can observe it (jsdom won't let window.location.reload be replaced).
export function reloadPage(): void {
  window.location.reload();
}
