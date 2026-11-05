// Signals can arrive before the recipient accepts a call and creates a peer.
// Keep this queue bounded while preserving the original insertion order.
export function createPendingSignals({
  maxCalls = 20,
  maxSignalsPerCall = 100,
} = {}) {
  const pending = new Map();

  return {
    enqueue(signal) {
      if (!signal?.call_id) return;
      const queue = pending.get(signal.call_id) || [];
      if (queue.length < maxSignalsPerCall) queue.push(signal);
      pending.set(signal.call_id, queue);
      while (pending.size > maxCalls) {
        pending.delete(pending.keys().next().value);
      }
    },
    take(callId) {
      const queue = pending.get(callId) || [];
      pending.delete(callId);
      return queue;
    },
    delete(callId) {
      return pending.delete(callId);
    },
  };
}
