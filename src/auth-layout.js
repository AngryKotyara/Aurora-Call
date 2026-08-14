// Presents authentication as two separate centered views without changing
// the existing login or registration handlers in ui.js.
const root = document.getElementById("root");

const iconMail = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m5 7 7 5 7-5"></path></svg>`;
const iconLock = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2.5"></rect><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"></path></svg>`;
const iconEye = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z"></path><circle cx="12" cy="12" r="2.4"></circle></svg>`;
const iconArrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"></path><path d="m14 8 4 4-4 4"></path></svg>`;

function installStyles() {
  let style = document.getElementById("aurora-auth-layout");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-auth-layout";
    document.head.append(style);
  }
  style.textContent = `
    body:has(.aurora-auth-shell){
      min-height:100dvh!important;margin:0!important;overflow-x:hidden!important;background:#020413!important;color:#fff!important;
    }
    body:has(.aurora-auth-shell)::before{
      position:fixed;z-index:0;inset:0;pointer-events:none;content:"";
      background:
        radial-gradient(ellipse at 17% 36%,rgba(16,111,255,.36) 0,rgba(16,111,255,.18) 18%,transparent 42%),
        radial-gradient(ellipse at 84% 34%,rgba(156,44,255,.40) 0,rgba(156,44,255,.16) 19%,transparent 43%),
        radial-gradient(circle at 50% 31%,rgba(102,48,210,.17),transparent 28%),
        radial-gradient(circle at 50% 88%,rgba(73,30,180,.12),transparent 28%),
        linear-gradient(180deg,#020414 0%,#05071a 54%,#02030c 100%);
    }
    body:has(.aurora-auth-shell)::after{
      position:fixed;z-index:0;left:-12vw;right:-12vw;bottom:-6vh;height:29vh;pointer-events:none;content:"";
      opacity:.58;filter:blur(3px);
      background:
        radial-gradient(ellipse at 20% 60%,transparent 45%,rgba(30,106,255,.45) 46%,rgba(30,106,255,.08) 50%,transparent 54%),
        radial-gradient(ellipse at 79% 60%,transparent 45%,rgba(195,41,255,.46) 46%,rgba(195,41,255,.08) 50%,transparent 54%);
      transform:scaleY(.72);
    }

    .aurora-auth-shell{
      position:relative;z-index:1;display:flex!important;min-height:100dvh!important;max-width:470px!important;
      flex-direction:column;align-items:center;justify-content:flex-start;margin:0 auto!important;
      padding:max(58px,env(safe-area-inset-top)) 22px max(42px,env(safe-area-inset-bottom))!important;
    }
    .aurora-auth-shell::before,
    .aurora-auth-shell::after{
      position:absolute;z-index:-1;top:155px;width:80%;height:290px;pointer-events:none;content:"";filter:blur(18px);opacity:.55;
    }
    .aurora-auth-shell::before{left:-42%;border-radius:50%;background:linear-gradient(115deg,transparent 16%,rgba(45,122,255,.5) 47%,rgba(95,44,255,.22) 70%,transparent 82%);transform:rotate(28deg)}
    .aurora-auth-shell::after{right:-42%;border-radius:50%;background:linear-gradient(245deg,transparent 16%,rgba(178,43,255,.56) 48%,rgba(62,56,255,.18) 70%,transparent 82%);transform:rotate(-28deg)}

    .aurora-auth-shell .auth-brand{
      display:flex!important;flex-direction:column!important;align-items:center!important;gap:14px!important;
      width:100%;margin:0 0 7px!important;text-align:center!important;
      font-family:"Avenir Next","SF Pro Display","Helvetica Neue",system-ui,sans-serif!important;
      font-size:36px!important;font-weight:700!important;letter-spacing:-.048em!important;line-height:1!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo-frame{
      display:grid!important;width:132px!important;height:118px!important;overflow:visible!important;border:0!important;border-radius:0!important;
      background:transparent!important;box-shadow:none!important;place-items:center!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo{
      display:block!important;width:156px!important;height:156px!important;max-width:none!important;object-fit:cover!important;
      mix-blend-mode:screen!important;filter:drop-shadow(0 0 16px rgba(176,78,255,.82)) drop-shadow(0 0 34px rgba(91,56,255,.42))!important;
      transform:scale(1.08)!important;
    }
    .aurora-auth-tagline{margin:0 0 28px!important;color:#b6b7c9!important;font-size:16px!important;letter-spacing:.005em!important;text-align:center!important}

    .auth-login-view,.auth-registration-view{
      position:relative;width:100%;margin:0!important;padding:29px 22px 23px!important;overflow:hidden!important;
      border:1px solid rgba(132,91,255,.72)!important;border-radius:30px!important;
      background:linear-gradient(155deg,rgba(17,25,54,.83),rgba(8,10,28,.92) 72%)!important;
      box-shadow:0 30px 80px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.045),0 0 0 1px rgba(64,113,255,.08)!important;
      backdrop-filter:blur(26px) saturate(1.12)!important;-webkit-backdrop-filter:blur(26px) saturate(1.12)!important;
    }
    .auth-login-view::before,.auth-registration-view::before{
      position:absolute;inset:0;pointer-events:none;content:"";
      background:radial-gradient(circle at 5% 0,rgba(43,121,255,.15),transparent 35%),radial-gradient(circle at 100% 0,rgba(154,52,255,.13),transparent 34%);
    }
    .auth-login-view>* ,.auth-registration-view>*{position:relative;z-index:1}
    .auth-login-view>b,.auth-login-view>p.muted{display:none!important}
    .auth-login-heading{margin:0 0 5px!important;text-align:center!important;font-size:29px!important;font-weight:790!important;letter-spacing:-.8px!important}
    .auth-login-subtitle{margin:0 0 23px!important;text-align:center!important;color:#b2b4c7!important;font-size:15px!important}

    .auth-field-wrap{position:relative;margin:0 0 11px}
    .auth-field-wrap .field{
      width:100%!important;min-height:62px!important;margin:0!important;padding:16px 48px 16px 52px!important;
      border:1px solid rgba(121,126,170,.42)!important;border-radius:18px!important;
      background:rgba(8,12,30,.72)!important;color:#fff!important;outline:none!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.022)!important;resize:none!important;
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease!important;
    }
    .auth-field-wrap .field::placeholder{color:#a3a5b8!important}
    .auth-field-wrap .field:focus{border-color:rgba(139,76,255,.92)!important;background:rgba(9,13,34,.9)!important;box-shadow:0 0 0 3px rgba(124,76,255,.11),0 0 24px rgba(98,72,255,.14)!important}
    .auth-field-icon,.auth-field-action{position:absolute;z-index:3;top:50%;display:grid;width:24px;height:24px;transform:translateY(-50%);place-items:center;color:#8f48ff}
    .auth-field-icon{left:17px}.auth-field-action{right:16px;border:0;background:transparent!important;color:#a8acc5!important;padding:0!important;min-height:0!important;box-shadow:none!important}
    .auth-field-icon svg,.auth-field-action svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

    .auth-extras{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 2px 18px;color:#c5c7d4;font-size:13px}
    .auth-remember{display:flex;align-items:center;gap:8px;white-space:nowrap}.auth-remember input{width:18px;height:18px;margin:0;accent-color:#7b49ff}
    .auth-forgot{border:0;background:transparent;color:#9b59ff;font:inherit;padding:0;cursor:default;opacity:.95}

    .aurora-auth-shell .btn{min-height:57px;border-radius:17px!important;font-size:16px!important;font-weight:800!important;letter-spacing:-.01em!important;transition:transform .14s ease,filter .14s ease,box-shadow .14s ease!important}
    .aurora-auth-shell .btn:not(.ghost){background:linear-gradient(100deg,#8937ff 0%,#6552ff 47%,#3297ff 100%)!important;box-shadow:0 12px 30px rgba(73,67,255,.28)!important}
    .aurora-auth-shell .btn:active{transform:scale(.985)!important}
    .auth-login-view #login{position:relative;padding-right:50px!important}
    .auth-login-view #login::after{content:""}
    .auth-submit-arrow{position:absolute;right:18px;bottom:16px;display:grid;width:28px;height:28px;pointer-events:none;color:#fff;place-items:center}
    .auth-submit-arrow svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

    .auth-divider{display:flex;align-items:center;gap:16px;width:100%;margin:21px 0 15px;color:#b8bac9;font-size:14px}.auth-divider::before,.auth-divider::after{height:1px;flex:1;background:rgba(128,132,166,.24);content:""}
    .auth-social-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}.auth-social{min-height:53px!important;border:1px solid rgba(119,123,164,.27)!important;border-radius:16px!important;background:rgba(13,17,35,.72)!important;color:#f5f5fa!important;font-size:15px!important;font-weight:650!important;opacity:.86}.auth-social[disabled]{cursor:default!important}.auth-social-mark{display:inline-grid;width:22px;height:22px;margin-right:9px;vertical-align:middle;place-items:center;font-size:18px}

    .auth-mode-switch{margin-top:20px!important;text-align:center!important}.auth-mode-switch::before{display:none!important}.auth-mode-switch p{display:inline;margin:0;color:#c1c2ce;font-size:14px}.auth-mode-switch .btn{display:inline;width:auto!important;min-height:0!important;margin-left:5px!important;padding:0!important;border:0!important;background:transparent!important;color:#9d5dff!important;font-size:14px!important;font-weight:650!important;box-shadow:none!important}

    .auth-registration-view[hidden],.auth-login-view[hidden]{display:none!important}
    .auth-registration-view h1{margin:0 0 8px!important;text-align:center!important;font-size:28px!important;letter-spacing:-.7px!important}
    .auth-registration-view>p.muted{max-width:320px;margin:0 auto 20px!important;text-align:center!important;line-height:1.5!important}
    .auth-registration-view .card{background:rgba(10,13,29,.62)!important;border-color:rgba(125,128,171,.28)!important}
    .auth-registration-view .field{min-height:58px!important;border-radius:17px!important;background:rgba(8,12,28,.72)!important;color:#fff!important}
    .auth-back-login{margin-top:10px!important;border:1px solid rgba(124,126,163,.28)!important;background:rgba(12,15,31,.7)!important;color:#f4f4f8!important}
    .aurora-auth-shell [role="status"]{margin-top:14px!important;text-align:center!important}

    @media (max-width:390px){
      .aurora-auth-shell{padding:max(42px,env(safe-area-inset-top)) 16px max(30px,env(safe-area-inset-bottom))!important}
      .aurora-auth-shell .auth-brand{font-size:31px!important}.aurora-auth-shell .auth-brand .brand-logo-frame{width:116px!important;height:104px!important}.aurora-auth-shell .auth-brand .brand-logo{width:137px!important;height:137px!important}
      .aurora-auth-tagline{margin-bottom:23px!important;font-size:15px!important}.auth-login-view,.auth-registration-view{padding:24px 17px 19px!important;border-radius:26px!important}.auth-login-heading{font-size:26px!important}
      .auth-social-row{gap:9px}.auth-social{font-size:14px!important}
    }
  `;
}

function wrapField(field, icon, withEye = false) {
  if (!field || field.closest(".auth-field-wrap")) return;
  const wrap = document.createElement("div");
  wrap.className = "auth-field-wrap";
  field.parentNode.insertBefore(wrap, field);
  wrap.append(field);
  const iconEl = document.createElement("span");
  iconEl.className = "auth-field-icon";
  iconEl.innerHTML = icon;
  wrap.prepend(iconEl);
  if (withEye) {
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "auth-field-action";
    eye.setAttribute("aria-label", "Показать или скрыть ключ доступа");
    eye.innerHTML = iconEye;
    eye.addEventListener("click", () => {
      const input = wrap.querySelector("#access");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
    wrap.append(eye);
  }
}

function decorateShell(app, login) {
  app.classList.add("aurora-auth-shell");
  if (!app.querySelector(".aurora-auth-tagline")) {
    const brand = app.querySelector(".auth-brand");
    const tagline = document.createElement("p");
    tagline.className = "aurora-auth-tagline";
    tagline.textContent = "Stay connected, anywhere";
    brand?.insertAdjacentElement("afterend", tagline);
  }
  if (!login.querySelector(".auth-login-heading")) {
    const title = document.createElement("h1");
    title.className = "auth-login-heading";
    title.textContent = "Welcome back";
    const subtitle = document.createElement("p");
    subtitle.className = "auth-login-subtitle";
    subtitle.textContent = "Sign in to continue";
    login.prepend(subtitle);
    login.prepend(title);
  }

  const name = login.querySelector("#login-name");
  if (name) {
    name.placeholder = "Имя пользователя";
    wrapField(name, iconMail, false);
  }
  const oldAccess = login.querySelector("textarea#access");
  if (oldAccess) {
    const input = document.createElement("input");
    input.id = "access";
    input.className = oldAccess.className;
    input.type = "password";
    input.autocomplete = "current-password";
    input.placeholder = "Ключ доступа";
    oldAccess.replaceWith(input);
  }
  wrapField(login.querySelector("#access"), iconLock, true);

  if (!login.querySelector(".auth-extras")) {
    const extras = document.createElement("div");
    extras.className = "auth-extras";
    extras.innerHTML = `<label class="auth-remember"><input type="checkbox" id="auth-remember-device" checked><span>Запомнить меня</span></label><button type="button" class="auth-forgot" aria-disabled="true">Забыли пароль?</button>`;
    const submit = login.querySelector("#login");
    submit?.insertAdjacentElement("beforebegin", extras);
  }
  const submit = login.querySelector("#login");
  if (submit && !login.querySelector(".auth-submit-arrow")) {
    submit.textContent = "Sign In";
    const arrow = document.createElement("span");
    arrow.className = "auth-submit-arrow";
    arrow.innerHTML = iconArrow;
    submit.insertAdjacentElement("afterend", arrow);
  }
  if (!login.querySelector(".auth-divider")) {
    const divider = document.createElement("div");
    divider.className = "auth-divider";
    divider.textContent = "or continue with";
    const social = document.createElement("div");
    social.className = "auth-social-row";
    social.innerHTML = `<button type="button" class="auth-social" disabled><span class="auth-social-mark">G</span>Google</button><button type="button" class="auth-social" disabled><span class="auth-social-mark">●</span>Apple</button>`;
    const switcher = login.querySelector(".auth-mode-switch");
    if (switcher) {
      switcher.insertAdjacentElement("beforebegin", social);
      social.insertAdjacentElement("beforebegin", divider);
    } else {
      login.append(divider, social);
    }
  }
}

function enhanceAuth() {
  const app = root?.querySelector("main.app");
  const registration = app?.querySelector(".registration-flow");
  if (!app || !registration) return;

  const login = registration.nextElementSibling;
  if (!login?.classList.contains("card") || !login.querySelector("#login")) return;

  if (registration.dataset.separated !== "1") {
    registration.dataset.separated = "1";
    registration.classList.add("auth-registration-view");
    login.classList.add("auth-login-view");

    const sent = registration.querySelector('[role="status"]');
    const hasSentPassword = Boolean(sent);

    const switcher = document.createElement("div");
    switcher.className = "auth-mode-switch";
    switcher.innerHTML = `<p>Don’t have an account?</p><button type="button" class="btn ghost" id="open-registration">Sign up</button>`;
    login.append(switcher);

    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn ghost auth-back-login";
    back.id = "back-to-login";
    back.textContent = "Вернуться ко входу";
    registration.append(back);

    const showLogin = () => {
      registration.hidden = true;
      login.hidden = false;
      login.querySelector("#login-name")?.focus();
    };
    const showRegistration = () => {
      login.hidden = true;
      registration.hidden = false;
      const emailStep = registration.querySelector("#register-step-email");
      const target = emailStep && !emailStep.hidden ? registration.querySelector("#register-email") : registration.querySelector("#register-name");
      target?.focus();
    };

    switcher.querySelector("#open-registration").addEventListener("click", showRegistration);
    back.addEventListener("click", showLogin);
    showLogin();
    if (hasSentPassword) sent.removeAttribute("hidden");
  }

  decorateShell(app, login);
}

export function installAuthLayout() {
  installStyles();
  enhanceAuth();
  if (!root) return;
  new MutationObserver(() => enhanceAuth()).observe(root, { childList: true, subtree: true });
}

installAuthLayout();
