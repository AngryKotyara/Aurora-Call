import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { chatPollDelay } from '../src/polling-policy.js';

test('chat polling slows while offline or during calls', () => {
  assert.equal(chatPollDelay({online:false, conversationOpen:true}), 60000);
  assert.equal(chatPollDelay({activeCall:true, conversationOpen:true}), 8000);
  assert.equal(chatPollDelay({conversationOpen:true}), 2500);
});

test('navigation changes do not recreate already polished icons', async () => {
  const { document } = parseHTML('<html><head></head><body><div id="root"><nav class="nav"><button data-nav="home"></button><button data-nav="history"></button><button data-nav="friends"></button><button data-nav="settings"></button><button data-chat-open><span class="chat-nav-badge"></span></button></nav></div></body></html>');
  globalThis.document = document;
  let callback;
  globalThis.MutationObserver = class { constructor(fn) { callback=fn; } observe() {} };
  globalThis.requestAnimationFrame = fn => fn();
  const { installNavPolish } = await import('../src/nav-polish.js');
  installNavPolish();
  const icon = document.querySelector('[data-nav="home"] [data-nav-icon]');
  callback();
  assert.equal(document.querySelector('[data-nav="home"] [data-nav-icon]'), icon);
});
