type RateState = { count: number; expiresAt: number };

const memoryStore = new Map<string, RateState>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const state = memoryStore.get(key);
  if (!state || state.expiresAt < now) {
    memoryStore.set(key, { count: 1, expiresAt: now + windowMs });
    return { success: true };
  }
  if (state.count + 1 > limit) {
    return { success: false, retryInMs: state.expiresAt - now };
  }
  memoryStore.set(key, { ...state, count: state.count + 1 });
  return { success: true };
}

export function clearRateLimit(key: string) {
  memoryStore.delete(key);
}
