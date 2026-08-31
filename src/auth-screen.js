// Aurora Call authentication screen rebuilt from scratch.
// Existing login/registration handlers from ui.js are preserved by moving their live controls.
const root = document.getElementById("root");

const logo = `<img class="auth-a-logo" src="/aurora-call-icon-v2.png" alt="" aria-hidden="true" />`;

const mailIcon = `<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m5 7 7 5 7-5"/></svg>`;
const lockIcon = `<svg viewBox="0 0 24 24"><rect x="5.5" y="10" width="13" height="10" rx="2.5"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/></svg>`;
const eyeIcon = `<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z"/><circle cx="12" cy="12" r="2.4"/></svg>`;
const arrowIcon = `<svg viewBox="0 0 24 24"><path d="M5 12h13"/><path d="m14 8 4 4-4 4"/></svg>`;

function installStyle() {
  let s = document.getElementById("aurora-auth-screen-style");
  if (!s) {
    s = document.createElement("style");
    s.id = "aurora-auth-screen-style";
    document.head.append(s);
  }
  s.textContent = `
  body:has(.auth-v2){margin:0!important;min-height:100dvh!important;overflow-x:hidden!important;background:#02030e!important;color:#fff!important;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"Helvetica Neue",Arial,sans-serif!important}
  body:has(.auth-v2)::before{position:fixed;z-index:0;inset:0;pointer-events:none;content:"";background:radial-gradient(ellipse at 12% 31%,rgba(24,105,255,.42),transparent 37%),radial-gradient(ellipse at 88% 34%,rgba(154,38,255,.43),transparent 38%),radial-gradient(circle at 50% 39%,rgba(80,54,191,.2),transparent 31%),linear-gradient(180deg,#02030c 0%,#060819 51%,#02030d 100%)}
  body:has(.auth-v2)::after{position:fixed;z-index:0;left:-15vw;right:-15vw;bottom:-4vh;height:30vh;pointer-events:none;content:"";opacity:.72;background:radial-gradient(ellipse at 20% 63%,transparent 45%,rgba(37,93,255,.56) 46%,rgba(26,82,255,.12) 49%,transparent 52%),radial-gradient(ellipse at 80% 63%,transparent 45%,rgba(201,42,255,.57) 46%,rgba(175,35,255,.12) 49%,transparent 52%);filter:blur(1.5px)}
  .auth-v2{position:relative;z-index:1;width:min(100%,430px);min-height:100dvh;margin:0 auto;padding:max(44px,env(safe-area-inset-top)) 22px max(34px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center}
  .auth-v2::before,.auth-v2::after{position:absolute;z-index:-1;top:205px;width:82%;height:265px;pointer-events:none;content:"";filter:blur(14px);opacity:.62}
  .auth-v2::before{left:-45%;background:linear-gradient(120deg,transparent 12%,rgba(49,121,255,.58) 47%,rgba(102,65,255,.18) 72%,transparent 86%);transform:rotate(29deg)}
  .auth-v2::after{right:-45%;background:linear-gradient(240deg,transparent 12%,rgba(183,45,255,.62) 47%,rgba(102,65,255,.17) 72%,transparent 86%);transform:rotate(-29deg)}
  .auth-v2-brand{display:flex;flex-direction:column;align-items:center;text-align:center;margin-top:8px}
  .auth-a-logo{display:block;width:112px;height:112px;margin-bottom:12px;border:1px solid rgba(150,115,255,.24);border-radius:26px;object-fit:cover;box-shadow:0 16px 42px rgba(0,0,0,.34),0 0 34px rgba(89,102,255,.28)}
  .auth-v2-brand h1{margin:0;color:#fff;font-size:42px;line-height:1.04;font-weight:650;letter-spacing:-1.7px}
  .auth-v2-brand p{margin:13px 0 28px;color:#afb1c1;font-size:17px;font-weight:400;letter-spacing:.05px}
  .auth-v2-card{width:100%;padding:30px 24px 25px;border:1px solid rgba(128,74,255,.78);border-radius:29px;background:linear-gradient(150deg,rgba(18,23,50,.86),rgba(7,9,25,.94));box-shadow:0 28px 80px rgba(0,0,0,.43),inset 0 1px rgba(255,255,255,.035);backdrop-filter:blur(25px);-webkit-backdrop-filter:blur(25px)}
  .auth-v2-card h2{margin:0 0 7px;text-align:center;font-size:29px;line-height:1.15;font-weight:780;letter-spacing:-.8px}
  .auth-v2-sub{margin:0 0 24px;text-align:center;color:#acaec0;font-size:15px}
  .auth-v2-field{position:relative;margin-bottom:12px}
  .auth-v2-field input,.auth-v2-field textarea{display:block;width:100%;height:62px;min-height:62px;margin:0!important;padding:0 50px 0 54px!important;border:1px solid rgba(118,123,164,.38)!important;border-radius:17px!important;background:rgba(8,11,28,.76)!important;color:#fff!important;font:16px inherit!important;outline:0!important;resize:none!important;box-shadow:none!important}
  .auth-v2-field input::placeholder,.auth-v2-field textarea::placeholder{color:#9fa1b4!important}
  .auth-v2-field input:focus,.auth-v2-field textarea:focus{border-color:#8d4cff!important;box-shadow:0 0 0 3px rgba(126,72,255,.1)!important}
  .auth-v2-icon,.auth-v2-eye{position:absolute;top:50%;transform:translateY(-50%);display:grid;place-items:center;color:#954bff}
  .auth-v2-icon{left:18px;width:25px;height:25px}.auth-v2-eye{right:6px;width:44px;height:44px;border:0;background:none;padding:0;color:#a6aac0}
  .auth-v2-icon svg,.auth-v2-eye svg,.auth-v2-arrow svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .auth-v2-extras{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:3px 1px 18px;color:#bfc1cf;font-size:13px}
  .auth-v2-remember{display:flex;align-items:center;gap:8px;white-space:nowrap}.auth-v2-remember input{width:18px;height:18px;margin:0;accent-color:#8749ff}
  .auth-v2-forgot{padding:0;border:0;background:none;color:#9e58ff;font:inherit}
  .auth-v2-submit-wrap{position:relative}.auth-v2-submit-wrap #login{width:100%;height:58px;min-height:58px;border:0!important;border-radius:17px!important;background:linear-gradient(100deg,#8f37ff 0%,#6854ff 48%,#4995ff 100%)!important;color:#fff!important;font-size:17px!important;font-weight:750!important;box-shadow:0 12px 30px rgba(80,63,255,.25)!important}.auth-v2-arrow{position:absolute;right:18px;top:50%;transform:translateY(-50%);display:grid;color:#fff;pointer-events:none}
  .auth-v2-divider{display:flex;align-items:center;gap:16px;width:100%;margin:23px 0 16px;color:#b3b5c4;font-size:14px}.auth-v2-divider::before,.auth-v2-divider::after{height:1px;flex:1;background:rgba(129,132,163,.28);content:""}
  .auth-v2-socials{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}.auth-v2-social{height:54px;border:1px solid rgba(118,122,158,.28);border-radius:15px;background:rgba(13,16,34,.78);color:#fff;font-size:16px;font-weight:600}.auth-v2-social span{margin-right:9px}.auth-v2-social:disabled{opacity:1;color:#fff}
  .auth-v2-signup{margin-top:27px;color:#bec0cd;font-size:14px;text-align:center}.auth-v2-signup button{border:0;background:none;padding:0;color:#9b58ff;font:inherit;font-weight:600}
  .auth-v2-registration{display:none;width:100%;padding:30px 24px 25px;border:1px solid rgba(128,74,255,.72);border-radius:29px;background:linear-gradient(150deg,rgba(18,23,50,.88),rgba(7,9,25,.95));box-shadow:0 28px 80px rgba(0,0,0,.43);backdrop-filter:blur(25px);-webkit-backdrop-filter:blur(25px)}
  .auth-v2-registration.on{display:block}.auth-v2-registration h1{text-align:center;margin:0 0 10px}.auth-v2-registration>p{text-align:center;line-height:1.5;margin:0 0 20px}.auth-v2-registration .field{width:100%;min-height:58px;margin:8px 0 12px;padding:15px;border:1px solid rgba(118,123,164,.38);border-radius:17px;background:rgba(8,11,28,.76);color:#fff}.auth-v2-registration .btn{width:100%;min-height:55px;margin-top:8px;border:0;border-radius:17px;background:linear-gradient(100deg,#8f37ff,#4995ff);color:#fff;font-weight:750}.auth-v2-registration .ghost{border:1px solid rgba(118,123,164,.3);background:rgba(11,14,31,.8)}
  .auth-v2-registration .card{background:rgba(8,11,28,.65);border-color:rgba(118,123,164,.3)}
  .auth-v2-back{width:100%;min-height:52px;margin-top:10px;border:1px solid rgba(118,123,164,.3);border-radius:17px;background:rgba(11,14,31,.8);color:#fff;font-weight:700}
  .auth-v2[aria-busy="true"]{pointer-events:none;opacity:.9}
  @media(max-width:390px){.auth-v2{padding-left:16px;padding-right:16px}.auth-a-logo{width:100px;height:100px;border-radius:23px}.auth-v2-brand h1{font-size:36px}.auth-v2-brand p{font-size:15px;margin-bottom:24px}.auth-v2-card,.auth-v2-registration{padding:25px 17px 20px;border-radius:25px}.auth-v2-card h2{font-size:26px}.auth-v2-socials{gap:9px}.auth-v2-social{font-size:14px}}
  `;
}

function rebuild() {
  const app = root?.querySelector("main.app");
  const reg = app?.querySelector(".registration-flow");
  if (!app || !reg || app.dataset.authV2 === "1") return;
  const login = reg.nextElementSibling;
  if (!login?.querySelector("#login")) return;

  const loginName = login.querySelector("#login-name");
  const accessOld = login.querySelector("#access");
  const loginBtn = login.querySelector("#login");
  if (!loginName || !accessOld || !loginBtn) return;

  let access = accessOld;
  if (accessOld.tagName === "TEXTAREA") {
    access = document.createElement("input");
    access.id = "access";
    access.className = accessOld.className;
    access.type = "password";
    access.autocomplete = "current-password";
    access.placeholder = "Ключ доступа";
    accessOld.replaceWith(access);
  } else {
    access.type = "password";
    access.placeholder = "Ключ доступа";
  }
  loginName.placeholder = "Имя пользователя";

  const shell = document.createElement("main");
  shell.className = "auth-v2";
  shell.innerHTML = `<header class="auth-v2-brand">${logo}<h1>Aurora Call</h1><p>Оставайтесь на связи</p></header><section class="auth-v2-card" data-auth-login><h2>С возвращением</h2><p class="auth-v2-sub">Войдите, чтобы продолжить</p><div class="auth-v2-field auth-name"><span class="auth-v2-icon">${mailIcon}</span></div><div class="auth-v2-field auth-key"><span class="auth-v2-icon">${lockIcon}</span><button type="button" class="auth-v2-eye" aria-label="Показать или скрыть ключ доступа">${eyeIcon}</button></div><div class="auth-v2-submit-wrap"><span class="auth-v2-arrow">${arrowIcon}</span></div></section><div class="auth-v2-divider">или</div><div class="auth-v2-socials"><button class="auth-v2-social" type="button" disabled><span>🌐</span>Google</button><button class="auth-v2-social" type="button" disabled><span>●</span>Apple</button></div><div class="auth-v2-signup">Нет аккаунта? <button type="button" data-open-register>Регистрация</button></div><section class="auth-v2-registration"></section>`;

  shell.querySelector(".auth-name").append(loginName);
  shell.querySelector(".auth-key").append(access);
  shell.querySelector(".auth-v2-submit-wrap").prepend(loginBtn);
  loginBtn.textContent = "Войти";

  const regHost = shell.querySelector(".auth-v2-registration");
  regHost.append(reg);
  reg.style.display = "block";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "auth-v2-back";
  back.textContent = "Вернуться ко входу";
  regHost.append(back);

  const loginPanel = shell.querySelector("[data-auth-login]");
  const signup = shell.querySelector(".auth-v2-signup");
  const divider = shell.querySelector(".auth-v2-divider");
  const socials = shell.querySelector(".auth-v2-socials");

  const showRegistration = () => {
    if (loginPanel) loginPanel.style.display = "none";
    if (divider) divider.style.display = "none";
    if (socials) socials.style.display = "none";
    if (signup) signup.style.display = "none";
    regHost.classList.add("on");
    reg.querySelector("#register-name")?.focus();
  };

  const showLogin = () => {
    regHost.classList.remove("on");
    if (loginPanel) loginPanel.style.display = "block";
    if (divider) divider.style.display = "flex";
    if (socials) socials.style.display = "grid";
    if (signup) signup.style.display = "block";
    loginName.focus();
  };

  shell.querySelector(".auth-v2-eye")?.addEventListener("click", () => {
    access.type = access.type === "password" ? "text" : "password";
  });
  shell
    .querySelector("[data-open-register]")
    ?.addEventListener("click", showRegistration);
  back.addEventListener("click", showLogin);

  app.replaceWith(shell);
  shell.dataset.authV2 = "1";
}

installStyle();
rebuild();
if (root)
  new MutationObserver(rebuild).observe(root, {
    childList: true,
    subtree: true,
  });
