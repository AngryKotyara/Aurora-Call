import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidUsername } from '../src/utils.js';
import handler from '../api/functions/[name].js';
import { rpc } from '../src/api.js';

test('TURN endpoint is authorized before session validation', async () => {
  const req = {method:'POST', query:{name:'aurora-turn-credentials'}, headers:{host:'example.test',origin:'https://example.test'}, body:{}};
  const res = {setHeader(){}, status(n){this.code=n; return this;}, json(v){this.body=v; return this;}};
  await handler(req,res);
  assert.equal(res.code, 401);
  assert.equal(res.body.error, 'invalid_session');
});

test('a lost response does not automatically repeat a message mutation', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('network lost'); };
  try { await assert.rejects(rpc('send_chat_message', {p_to:'test',p_body:'hello'})); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});

test('registration accepts only letters, digits and underscore', () => {
  assert.equal(isValidUsername('abc!'), false);
  assert.equal(isValidUsername('Имя_123'), true);
  assert.equal(isValidUsername('a'), false);
});
