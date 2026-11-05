import assert from "node:assert/strict";
import test from "node:test";
import { createPendingSignals } from "../src/calls/pending-signals.js";

test("early call signals remain ordered and are removed after delivery", () => {
  const queue = createPendingSignals();
  queue.enqueue({ call_id: "call-a", id: 2 });
  queue.enqueue({ call_id: "call-a", id: 1 });
  queue.enqueue({ call_id: "call-b", id: 3 });
  assert.deepEqual(
    queue.take("call-a").map((item) => item.id),
    [2, 1],
  );
  assert.deepEqual(queue.take("call-a"), []);
  assert.deepEqual(
    queue.take("call-b").map((item) => item.id),
    [3],
  );
});

test("early signal buffering remains bounded and can discard ended calls", () => {
  const queue = createPendingSignals({ maxCalls: 2, maxSignalsPerCall: 2 });
  queue.enqueue({ call_id: "oldest", id: 1 });
  queue.enqueue({ call_id: "second", id: 2 });
  queue.enqueue({ call_id: "second", id: 3 });
  queue.enqueue({ call_id: "second", id: 4 });
  queue.enqueue({ call_id: "newest", id: 5 });
  queue.enqueue({ id: 6 });
  assert.deepEqual(queue.take("oldest"), []);
  assert.deepEqual(
    queue.take("second").map((item) => item.id),
    [2, 3],
  );
  assert.equal(queue.delete("newest"), true);
  assert.deepEqual(queue.take("newest"), []);
});
