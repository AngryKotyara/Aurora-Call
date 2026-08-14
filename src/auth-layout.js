// Presents authentication as two separate centered views without changing
// the existing login or registration handlers in ui.js.
const root = document.getElementById("root");

function installStyles() {
  let style = document.getElementById("aurora-auth-layout");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-auth-layout";
    document.head.append(style);
  }
  style.textContent = `
    body:has(.aurora-auth-shell){
      min-height:100dvh!important;
      background:
        radial-gradient(circle at 18% 28%,rgba(30,116,255,.34),transparent 27%),
        radial-gradient(circle at 82% 28%,rgba(154,47,255,.38),transparent 30%),
        radial-gradient(circle at 50% 62%,rgba(82,37,160,.28),transparent 36%),
        linear-gradient(180deg,#040615 0%,#07091a 52%,#05050f 100%)!important;
      background-attachment:fixed!important;
      overflow-x:hidden;
    }
    body:has(.aurora-auth-shell)::before,
    body:has(.aurora-auth-shell)::after{
      position:fixed;z-index:0;left:-15vw;width:130vw;height:34vh;pointer-events:none;content:"";
      border-radius:50%;filter:blur(32px);opacity:.42;transform:rotate(-4deg);
      background:linear-gradient(90deg,transparent 2%,rgba(36,123,255,.38) 22%,rgba(90,67,255,.2) 46%,rgba(187,44,255,.48) 74%,transparent 98%);
    }
    body:has(.aurora-auth-shell)::before{top:18vh;clip-path:polygon(0 49%,15% 38%,30% 47%,46% 28%,61% 44%,78% 27%,100% 45%,100% 69%,79% 52%,62% 66%,44% 51%,27% 66%,12% 57%,0 67%)}
    body:has(.aurora-auth-shell)::after{bottom:-7vh;opacity:.22;transform:rotate(3deg);clip-path:polygon(0 45%,18% 32%,34% 48%,50% 31%,67% 49%,84% 33%,100% 46%,100% 62%,83% 52%,66% 68%,50% 51%,33% 67%,17% 50%,0 62%)}

    .aurora-auth-shell{
      position:relative;z-index:1;display:flex!important;min-height:100dvh!important;max-width:470px!important;
      flex-direction:column;justify-content:center;align-items:center;margin:0 auto!important;
      padding:max(34px,env(safe-area-inset-top)) 22px max(34px,env(safe-area-inset-bottom))!important;
    }
    .aurora-auth-shell .auth-brand{
      display:flex!important;flex-direction:column!important;align-items:center!important;gap:14px!important;
      width:100%;margin:0 0 12px!important;text-align:center;font-size:32px!important;font-weight:720!important;
      letter-spacing:-.045em!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo-frame{
      width:112px!important;height:112px!important;border-radius:30px!important;
      border:1px solid rgba(177,114,255,.32)!important;background:#040209!important;
      box-shadow:0 0 0 1px rgba(0,0,0,.75),0 22px 70px rgba(111,42,255,.42),0 0 55px rgba(180,80,255,.18)!important;
    }
    .aurora-auth-shell .auth-brand .brand-logo{width:139px!important;height:139px!important}
    .aurora-auth-tagline{margin:0 0 28px;color:#a8a9bd;font-size:16px;letter-spacing:.01em;text-align:center}

    .auth-login-view,.auth-registration-view{
      position:relative;width:100%;margin:0!important;padding:26px 22px 22px!important;
      overflow:hidden;border:1px solid rgba(126,128,176,.36)!important;border-radius:30px!important;
      background:linear-gradient(160deg,rgba(20,26,55,.84),rgba(10,12,29,.9))!important;
      box-shadow:0 26px 85px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.045)!important;
      backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);
    }
    .auth-login-view::before,.auth-registration-view::before{
      position:absolute;inset:0;pointer-events:none;content:"";
      background:radial-gradient(circle at 18% 0,rgba(56,128,255,.13),transparent 34%),radial-gradient(circle at 92% 4%,rgba(158,63,255,.14),transparent 38%);
    }
    .auth-login-view>* ,.auth-registration-view>*{position:relative;z-index:1}
    .auth-login-heading{margin:0 0 4px;text-align:center;font-size:28px;font-weight:760;letter-spacing:-.7px}
    .auth-login-subtitle{margin:0 0 22px;text-align:center;color:#a8a9bb;font-size:15px}
    .auth-login-view>b,.auth-login-view>p.muted{display:none!important}

    .aurora-auth-shell .field{
      min-height:58px;margin:7px 0 11px!important;padding:16px 18px!important;
      border:1px solid rgba(129,132,173,.3)!important;border-radius:17px!important;
      background:rgba(8,12,28,.7)!important;color:#fff!important;outline:none!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
    }
    .aurora-auth-shell textarea.field{min-height:64px;resize:none}
    .aurora-auth-shell .field::placeholder{color:#808296}
    .aurora-auth-shell .field:focus{
      border-color:rgba(130,92,255,.82)!important;background:rgba(9,13,31,.88)!important;
      box-shadow:0 0 0 3px rgba(111,78,255,.12),0 0 28px rgba(96,67,255,.12)!important;
    }
    .aurora-auth-shell .btn{
      min-height:55px;border-radius:17px!important;font-size:16px;font-weight:780;letter-spacing:-.01em;
      transition:transform .14s ease,filter .14s ease,box-shadow .14s ease;
    }
    .aurora-auth-shell .btn:not(.ghost){
      background:linear-gradient(100deg,#873bff 0%,#5c57ff 48%,#2496ff 100%)!important;
      box-shadow:0 12px 28px rgba(70,70,255,.26)!important;
    }
    .aurora-auth-shell .btn:active{transform:scale(.985)}
    .aurora-auth-shell .ghost{
      border:1px solid rgba(124,126,163,.28)!important;background:rgba(12,15,31,.7)!important;color:#f4f4f8!important;
    }
    .auth-mode-switch{margin-top:18px;text-align:center}
    .auth-mode-switch::before{display:block;width:100%;height:1px;margin:4px 0 18px;background:linear-gradient(90deg,transparent,rgba(132,134,165,.28),transparent);content:""}
    .auth-mode-switch .btn{width:100%}
    .auth-mode-switch p{margin:0 0 10px;color:#9fa0b2;font-size:14px}
    .auth-registration-view[hidden],.auth-login-view[hidden]{display:none!important}
    .auth-registration-view h1{margin:0 0 8px;text-align:center;font-size:28px;letter-spacing:-.7px}
    .auth-registration-view>p.muted{max-width:320px;margin:0 auto 20px;text-align:center;line-height:1.5}
    .auth-registration-view .card{background:rgba(10,13,29,.62)!important;border-color:rgba(125,128,171,.28)!important}
    .auth-back-login{margin-top:10px}
    .aurora-auth-shell [role="status"]{margin-top:14px!important;text-align:center}

    @media (max-width:390px){
      .aurora-auth-shell{padding-left:16px!important;padding-right:16px!important}
      .aurora-auth-shell .auth-brand .brand-logo-frame{width:94px!important;height:94px!important;border-radius:26px!important}
      .aurora-auth-shell .auth-brand .brand-logo{width:118px!important;height:118px!important}
      .aurora-auth-shell .auth-brand{font-size:29px!important}
      .auth-login-view,.auth-registration-view{padding:22px 17px 18px!important;border-radius:26px!important}
    }
  `;
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
    title.textContent = "С возвращением";
    const subtitle = document.createElement("p");
    subtitle.className = "auth-login-subtitle";
    subtitle.textContent = "Войдите, чтобы продолжить";
    login.prepend(subtitle);
    login.prepend(title);
  }
}

function enhanceAuth() {
  const app = root?.querySelector("main.app");
  const registration = app?.querySelector(".registration-flow");
  if (!app || !registration) return;

  const login = registration.nextElementSibling;
  if (!login?.classList.contains("card") || !login.querySelector("#login")) return;

  decorateShell(app, login);
  if (registration.dataset.separated === "1") return;

  registration.dataset.separated = "1";
  registration.classList.add("auth-registration-view");
  login.classList.add("auth-login-view");

  const sent = registration.querySelector('[role="status"]');
  const hasSentPassword = Boolean(sent);

  const switcher = document.createElement("div");
  switcher.className = "auth-mode-switch";
  switcher.innerHTML = `<p>Нет аккаунта?</p><button type="button" class="btn ghost" id="open-registration">Регистрация</button>`;
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

export function installAuthLayout() {
  installStyles();
  enhanceAuth();
  if (!root) return;
  new MutationObserver(() => enhanceAuth()).observe(root, { childList: true, subtree: true });
}

installAuthLayout();
