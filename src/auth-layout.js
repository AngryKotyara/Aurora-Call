// Presents authentication as two separate views without changing the existing
// login or registration handlers in ui.js.
const root = document.getElementById("root");

function installStyles() {
  if (document.getElementById("aurora-auth-layout")) return;
  const style = document.createElement("style");
  style.id = "aurora-auth-layout";
  style.textContent = `
    .auth-mode-switch{margin-top:14px;text-align:center}
    .auth-mode-switch .btn{width:100%}
    .auth-mode-switch p{margin:12px 0 8px;color:var(--muted,#9a9aaa);font-size:14px}
    .registration-flow.auth-registration-view{margin-top:18px}
    .auth-registration-view[hidden],.auth-login-view[hidden]{display:none!important}
    .auth-login-view{margin-top:18px}
    .auth-back-login{margin-top:10px}
  `;
  document.head.append(style);
}

function enhanceAuth() {
  const app = root?.querySelector("main.app");
  const registration = app?.querySelector(".registration-flow");
  if (!app || !registration || registration.dataset.separated === "1") return;

  // ui.js renders registration first and the login card immediately after it.
  const login = registration.nextElementSibling;
  if (!login?.classList.contains("card") || !login.querySelector("#login")) return;

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

  // Default screen is login. After a password has been sent, return to login
  // immediately so the user can enter the credentials received by email.
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
