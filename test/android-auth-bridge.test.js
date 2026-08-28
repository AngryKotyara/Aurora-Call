import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(`<!doctype html><html><body>
  <main class="auth-v2">
    <section data-auth-login>
      <input id="login-name" value="aurora_mobile" />
      <input id="access" value="mobile-key" />
      <button id="login" type="button">Войти</button>
    </section>
    <div class="auth-v2-divider"></div>
    <div class="auth-v2-socials"></div>
    <div class="auth-v2-signup"><button data-open-register type="button">Регистрация</button></div>
    <section class="auth-v2-registration">
      <div id="register-step-name"><input id="register-name" value="new_mobile_user" /></div>
      <div id="register-step-email" hidden><input id="register-email" value="mobile@example.test" /></div>
      <span id="register-name-preview"></span>
      <button id="register-next" type="button">Продолжить</button>
      <button id="register-back" type="button">Назад</button>
      <button id="create" type="button">Создать</button>
      <button class="auth-v2-back" type="button">Ко входу</button>
    </section>
  </main>
</body></html>`);

globalThis.document = document;
globalThis.window = window;
globalThis.CustomEvent = window.CustomEvent;

await import("../src/android-auth-bridge.js");

test("Android auth bridge submits login by tap and keyboard", () => {
  const logins = [];
  document.addEventListener("aurora-auth-login", (event) => {
    logins.push(event.detail);
  });

  document.querySelector("#login").click();
  const enter = new window.Event("keydown", { bubbles: true });
  Object.defineProperty(enter, "key", { value: "Enter" });
  document.querySelector("#access").dispatchEvent(enter);

  assert.deepEqual(logins, [
    { username: "aurora_mobile", accessKey: "mobile-key" },
    { username: "aurora_mobile", accessKey: "mobile-key" },
  ]);
  assert.equal(enter.defaultPrevented, true);
});

test("Android registration bridge changes steps and submits the email", () => {
  let registration = null;
  document.addEventListener("aurora-auth-register", (event) => {
    registration = event.detail;
  });

  document.querySelector("[data-open-register]").click();
  assert.ok(
    document.querySelector(".auth-v2-registration").classList.contains("on"),
  );

  document.querySelector("#register-next").click();
  assert.equal(document.querySelector("#register-step-name").hidden, true);
  assert.equal(document.querySelector("#register-step-email").hidden, false);
  assert.equal(
    document.querySelector("#register-name-preview").textContent,
    "new_mobile_user",
  );

  document.querySelector("#create").click();
  assert.deepEqual(registration, {
    username: "new_mobile_user",
    email: "mobile@example.test",
  });

  document.querySelector("#register-back").click();
  assert.equal(document.querySelector("#register-step-name").hidden, false);
  assert.equal(document.querySelector("#register-step-email").hidden, true);
});
