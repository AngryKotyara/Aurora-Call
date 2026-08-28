const DEFAULT_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resilientFetch(url, options = {}, policy = {}) {
  const retries = Number.isInteger(policy.retries) ? policy.retries : 2;
  const timeoutMs = policy.timeoutMs || DEFAULT_TIMEOUT_MS;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(new DOMException("Request timeout", "TimeoutError")),
      timeoutMs,
    );
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok || response.status < 500 || attempt === retries)
        return response;
      lastError = new Error(`http_${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timer);
    }
    await sleep(Math.min(3000, 300 * 2 ** attempt + Math.random() * 250));
  }
  throw lastError || new Error("network_failed");
}
