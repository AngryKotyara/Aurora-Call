// Authentication presentation layer. Keeps existing login/registration handlers intact.
const root = document.getElementById("root");

const iconMail = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m5 7 7 5 7-5"></path></svg>`;
const iconLock = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2.5"></rect><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"></path></svg>`;
const iconEye = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z"></path><circle cx="12" cy="12" r="2.4"></circle></svg>`;
const iconArrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"></path><path d="m14 8 4 4-4 4"></path></svg>`;
const googleMark = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.72-.06-1.26-.2-1.82H12v3.45h5.52a4.7 4.7 0 0 1-2.04 3.08v2.24h3.31c1.94-1.78 2.81-4.4 2.81-6.95Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.61-2.42l-3.31-2.24c-.9.61-2.06.98-3.3.98-2.6 0-4.8-1.75-5.6-4.12H2.98v2.31A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14.2A6 6 0 0 1 6.08 12c0-.76.13-1.5.32-2.2V7.49H2.98A10 10 0 0 0 2 12c0 1.62.39 3.16.98 4.51L6.4 14.2Z"/><path fill="#EA4335" d="M12 5.68c1.47 0 2.79.51 3.83 1.5l2.86-2.86A9.62 9.62 0 0 0 12 2 10 10 0 0 0 2.98 7.49L6.4 9.8c.8-2.37 3-4.12 5.6-4.12Z"/></svg>`;
const appleMark = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.8 12.7c0-2.15 1.76-3.18 1.84-3.23a3.94 3.94 0 0 0-3.1-1.68c-1.3-.13-2.56.78-3.22.78-.68 0-1.7-.76-2.8-.74a4.1 4.1 0 0 0-3.45 2.11c-1.5 2.58-.38 6.38 1.06 8.47.72 1.03 1.56 2.18 2.66 2.14 1.08-.04 1.49-.69 2.8-.69 1.29 0 1.68.69 2.82.66 1.16-.02 1.9-1.03 2.59-2.07a8.52 8.52 0 0 0 1.18-2.41 3.7 3.7 0 0 1-2.38-3.33ZM14.7 6.42a3.77 3.77 0 0 0 .88-2.7 3.87 3.87 0 0 0-2.51 1.29 3.58 3.58 0 0 0-.91 2.58 3.17 3.17 0 0 0 2.54-1.17Z"/></svg>`;

function installStyles() {
  let style = document.getElementById("aurora-auth-layout");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-auth-layout";
    document.head.append(style);
  }
  style.textContent = `
    body:has(.aurora-auth-shell){
      min-height:100dvh!important;margin:0!important;overflow-x:hidden!important;background:#01030e!important;color:#fff!important;
    }
    body:has(.aurora-auth-shell)::before{
      position:fixed;z-index:0;inset:0;pointer-events:none;content:"";
      background:
        radial-gradient(ellipse at 17% 34%,rgba(17,109,255,.36) 0,rgba(17,109,255,.19) 18%,transparent 43%),
        radial-gradient(ellipse at 84% 34%,rgba(159,39,255,.40) 0,rgba(159,39,255,.17) 20%,transparent 44%),
        radial-gradient(circle at 50% 30%,rgba(85,38,195,.18),transparent 28%),
        radial-gradient(circle at 50% 91%,rgba(66,20,164,.13),transparent 30%),
        linear-gradient(180deg,#01030e 0%,#05071a 48%,#02030d 100%);
    }
    body:has(.aurora-auth-shell)::after{
      position:fixed;z-index:0;left:-18vw;right:-18vw;bottom:-3vh;height:27vh;pointer-events:none;content:"";opacity:.78;
      background:
        radial-gradient(ellipse at 18% 62%,transparent 47%,rgba(17,91,255,.8) 48%,rgba(17,91,255,.13) 51%,transparent 54%),
        radial-gradient(ellipse at 84% 62%,transparent 47%,rgba(208,33,255,.77) 48%,rgba(208,33,255,.12) 51%,transparent 54%),
        radial-gradient(ellipse at 50% 72%,transparent 55%,rgba(92,54,255,.45) 56%,rgba(92,54,255,.05) 60%,transparent 63%);
      filter:blur(1.5px);transform:scaleY(.78);
    }

    .aurora-auth-shell{
      position:relative;z-index:1;display:flex!important;min-height:100dvh!important;max-width:430px!important;
      flex-direction:column;align-items:center;justify-content:flex-start;margin:0 auto!important;
      padding:max(70px,env(safe-area-inset-top)) 20px max(52px,env(safe-area-inset-bottom))!important;
      isolation:isolate;
    }
    .aurora-auth-shell::before,.aurora-auth-shell::after{
      position:absolute;z-index:-1;top:150px;width:88%;height:330px;pointer-events:none;content:"";opacity:.75;filter:blur(13px);
    }
    .aurora-auth-shell::before{left:-52%;border-radius:50%;background:linear-gradient(118deg,transparent 17%,rgba(27,109,255,.56) 46%,rgba(75,48,255,.17) 65%,transparent 81%);transform:rotate(26deg)}
    .aurora-auth-shell::after{right:-52%;border-radius:50%;background:linear-gradient(242deg,transparent 17%,rgba(181,35,255,.61) 47%,rgba(65,52,255,.16) 66%,transparent 82%);transform:rotate(-26deg)}

    .aurora-auth-shell .auth-brand{
      display:flex!important;flex-direction:column!important;align-items:center!important;gap:14px!important;width:100%;
      margin:0 0 8px!important;text-align:center!important;font-family:"SF Pro Display","Avenir Next","Helvetica Neue",Arial,sans-serif!important;
      font-size:35px!important;font-weight:700!important;letter-spacing:-.048em!important;line-height:1!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo-frame{
      display:grid!important;width:132px!important;height:118px!important;overflow:visible!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;place-items:center!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo{
      display:block!important;width:158px!important;height:158px!important;max-width:none!important;object-fit:cover!important;mix-blend-mode:screen!important;
      filter:drop-shadow(0 0 13px rgba(177,75,255,.9)) drop-shadow(0 0 30px rgba(94,48,255,.45))!important;transform:scale(1.08)!important;
    }
    .aurora-auth-tagline{margin:0 0 28px!important;color:#b7b8c8!important;font-size:15.5px!important;letter-spacing:.004em!important;text-align:center!important}

    .auth-login-view,.auth-registration-view{
      position:relative;width:100%;margin:0!important;padding:28px 22px 23px!important;overflow:hidden!important;
      border:1px solid rgba(128,82,255,.82)!important;border-radius:26px!important;
      background:linear-gradient(155deg,rgba(19,28,58,.82),rgba(7,9,27,.94) 72%)!important;
      box-shadow:0 30px 85px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.045),0 0 0 1px rgba(73,116,255,.08)!important;
      backdrop-filter:blur(26px) saturate(1.12)!important;-webkit-backdrop-filter:blur(26px) saturate(1.12)!important;
    }
    .auth-login-view::before,.auth-registration-view::before{position:absolute;inset:0;pointer-events:none;content:"";background:radial-gradient(circle at 4% 0,rgba(43,121,255,.14),transparent 38%),radial-gradient(circle at 100% 0,rgba(159,48,255,.12),transparent 38%)}
    .auth-login-view>* ,.auth-registration-view>*{position:relative;z-index:1}
    .auth-login-view>b,.auth-login-view>p.muted{display:none!important}
    .auth-login-heading{margin:0 0 4px!important;text-align:center!important;font-size:28px!important;font-weight:790!important;letter-spacing:-.75px!important}
    .auth-login-subtitle{margin:0 0 22px!important;text-align:center!important;color:#b6b7c8!important;font-size:14.5px!important}

    .auth-field-wrap{position:relative;margin:0 0 12px}
    .auth-field-wrap .field{
      width:100%!important;min-height:61px!important;margin:0!important;padding:16px 48px 16px 54px!important;border:1px solid rgba(118,125,166,.45)!important;border-radius:16px!important;
      background:rgba(8,12,29,.73)!important;color:#fff!important;outline:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)!important;resize:none!important;
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease!important;
    }
    .auth-field-wrap .field::placeholder{color:#a7a9b9!important}.auth-field-wrap .field:focus{border-color:rgba(137,74,255,.96)!important;background:rgba(9,13,34,.91)!important;box-shadow:0 0 0 3px rgba(124,76,255,.10),0 0 24px rgba(98,72,255,.13)!important}
    .auth-field-icon,.auth-field-action{position:absolute;z-index:3;top:50%;display:grid;width:24px;height:24px;transform:translateY(-50%);place-items:center;color:#9146ff}.auth-field-icon{left:18px}.auth-field-action{right:17px;border:0;background:transparent!important;color:#a9adc6!important;padding:0!important;min-height:0!important;box-shadow:none!important}
    .auth-field-icon svg,.auth-field-action svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

    .auth-extras{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:3px 2px 18px;color:#c5c7d4;font-size:13px}.auth-remember{display:flex;align-items:center;gap:9px;white-space:nowrap}.auth-remember input{width:18px;height:18px;margin:0;border-radius:5px;accent-color:#7c49ff}.auth-forgot{border:0;background:transparent;color:#a053ff;font:inherit;padding:0;cursor:default;opacity:.98}

    .aurora-auth-shell .btn{min-height:56px;border-radius:15px!important;font-size:16px!important;font-weight:800!important;letter-spacing:-.01em!important;transition:transform .14s ease,filter .14s ease,box-shadow .14s ease!important}.aurora-auth-shell .btn:not(.ghost){background:linear-gradient(100deg,#9135ff 0%,#6c54ff 50%,#4d72ff 100%)!important;box-shadow:0 12px 30px rgba(73,67,255,.27)!important}.aurora-auth-shell .btn:active{transform:scale(.985)!important}
    .auth-login-view #login{position:relative;padding-right:50px!important}.auth-submit-wrap{position:relative}.auth-submit-arrow{position:absolute;right:17px;top:50%;display:grid;width:28px;height:28px;transform:translateY(-50%);pointer-events:none;color:#fff;place-items:center}.auth-submit-arrow svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}

    .auth-divider{display:flex;align-items:center;gap:16px;width:100%;margin:21px 0 15px;color:#b8bac9;font-size:14px}.auth-divider::before,.auth-divider::after{height:1px;flex:1;background:rgba(128,132,166,.25);content:""}
    .auth-social-row{display:grid;grid-template-columns:1fr 1fr;gap:13px;width:100%}.auth-social{display:flex;align-items:center;justify-content:center;min-height:52px!important;border:1px solid rgba(118,123,164,.32)!important;border-radius:14px!important;background:rgba(13,17,35,.74)!important;color:#f5f5fa!important;font-size:15px!important;font-weight:650!important;opacity:.98}.auth-social[disabled]{cursor:default!important}.auth-social-mark{display:inline-grid;width:21px;height:21px;margin-right:9px;place-items:center}.auth-social-mark svg{display:block;width:21px;height:21px}
    .auth-mode-switch{margin-top:18px!important;text-align:center!important}.auth-mode-switch::before{display:none!important}.auth-mode-switch p{display:inline;margin:0;color:#c1c2ce;font-size:14px}.auth-mode-switch .btn{display:inline;width:auto!important;min-height:0!important;margin-left:5px!important;padding:0!important;border:0!important;background:transparent!important;color:#a15eff!important;font-size:14px!important;font-weight:650!important;box-shadow:none!important}

    .auth-registration-view[hidden],.auth-login-view[hidden]{display:none!important}.auth-registration-view h1{margin:0 0 8px!important;text-align:center!important;font-size:28px!important;letter-spacing:-.7px!important}.auth-registration-view>p.muted{max-width:320px;margin:0 auto 20px!important;text-align:center!important;line-height:1.5!important}.auth-registration-view .card{background:rgba(10,13,29,.62)!important;border-color:rgba(125,128,171,.28)!important}.auth-registration-view .field{min-height:58px!important;border-radius:17px!important;background:rgba(8,12,28,.72)!important;color:#fff!important}.auth-back-login{margin-top:10px!important;border:1px solid rgba(124,126,163,.28)!important;background:rgba(12,15,31,.7)!important;color:#f4f4f8!important}.aurora-auth-shell [role="status"]{margin-top:14px!important;text-align:center!important}

    @media (max-width:390px){
      .aurora-auth-shell{padding:max(48px,env(safe-area-inset-top)) 15px max(36px,env(safe-area-inset-bottom))!important}.aurora-auth-shell .auth-brand{font-size:31px!important}.aurora-auth-shell .auth-brand .brand-logo-frame{width:116px!important;height:104px!important}.aurora-auth-shell .auth-brand .brand-logo{width:138px!important;height:138px!important}.aurora-auth-tagline{margin-bottom:22px!important;font-size:14.5px!important}.auth-login-view,.auth-registration-view{padding:24px 17px 19px!important;border-radius:24px!important}.auth-login-heading{font-size:25px!important}.auth-social-row{gap:9px}.auth-social{font-size:14px!important}.auth-extras{font-size:12px}
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
      if (input) input.type = input.type === "password" ? "text" : "password";
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
    name.placeholder = "Username";
    wrapField(name, iconMail, false);
  }
  const oldAccess = login.querySelector("textarea#access");
  if (oldAccess) {
    const input = document.createElement("input");
    input.id = "access";
    input.className = oldAccess.className;
    input.type = "password";
    input.autocomplete = "current-password";
    input.placeholder = "Password";
    oldAccess.replaceWith(input);
  }
  const access = login.querySelector("#access");
  if (access) access.placeholder = "Password";
  wrapField(access, iconLock, true);

  if (!login.querySelector(".auth-extras")) {
    const extras = document.createElement("div");
    extras.className = "auth-extras";
    extras.innerHTML = `<label class="auth-remember"><input type="checkbox" id="auth-remember-device" checked><span>Remember me</span></label><button type="button" class="auth-forgot" aria-disabled="true">Forgot password?</button>`;
    login.querySelector("#login")?.insertAdjacentElement("beforebegin", extras);
  }

  const submit = login.querySelector("#login");
  if (submit && !submit.closest(".auth-submit-wrap")) {
    submit.textContent = "Sign In";
    const wrap = document.createElement("div");
    wrap.className = "auth-submit-wrap";
    submit.parentNode.insertBefore(wrap, submit);
    wrap.append(submit);
    const arrow = document.createElement("span");
    arrow.className = "auth-submit-arrow";
    arrow.innerHTML = iconArrow;
    wrap.append(arrow);
  }

  if (!login.querySelector(".auth-divider")) {
    const divider = document.createElement("div");
    divider.className = "auth-divider";
    divider.textContent = "or continue with";
    const social = document.createElement("div");
    social.className = "auth-social-row";
    social.innerHTML = `<button type="button" class="auth-social" disabled><span class="auth-social-mark">${googleMark}</span>Google</button><button type="button" class="auth-social" disabled><span class="auth-social-mark">${appleMark}</span>Apple</button>`;
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

    const showLogin = () => { registration.hidden = true; login.hidden = false; login.querySelector("#login-name")?.focus(); };
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
  if (root) new MutationObserver(() => enhanceAuth()).observe(root, { childList: true, subtree: true });
}

installAuthLayout();
