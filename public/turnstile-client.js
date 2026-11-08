export function classifyTurnstileError(code) {
  const numeric = Number.parseInt(String(code), 10);
  if (!Number.isFinite(numeric)) return 'unknown';
  const family = Math.floor(numeric / 1000);
  if (family === 110 || family === 400) return 'configuration';
  if (family === 200) return 'browser';
  if (family === 300 || family === 600) return 'challenge';
  return 'unknown';
}

export function renderTurnstile(api, selector, sitekey, callbacks = {}) {
  return api.render(selector, {
    sitekey,
    retry: 'auto',
    callback(token) { callbacks.success?.(token); },
    'expired-callback'() { callbacks.expired?.(); },
    'timeout-callback'() { callbacks.timeout?.(); },
    'error-callback'(code) {
      callbacks.error?.(classifyTurnstileError(code));
      return true;
    }
  });
}
