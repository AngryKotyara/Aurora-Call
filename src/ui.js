import { escapeHtml, query } from "./utils.js";
import {
  auroraWaves,
  brandLockup,
  friendCallCard,
  friendListItem,
  historyListItem,
  mediaAccessCard,
  navigation,
} from "./views/components.js";
import { installEdgeSwipeBack } from "./chat-edge-swipe.js";
import { mountXperiaFlow } from "./xperia-flow.js";
import {
  isNativeApp,
  relayOnlyEnabled,
  setRelayOnlyEnabled,
} from "./call-privacy.js";

const root = document.getElementById("root");

export function renderAuth({ onRegister, onLogin, registrationSentTo = "" }) {
  const sent = registrationSentTo
    ? `<div class="card" role="status"><b>Проверьте почту</b><p class="muted">Пароль отправлен на ${escapeHtml(registrationSentTo)}. После получения войдите ниже по имени и паролю.</p></div>`
    : "";
  root.innerHTML = `<main class="app">${brandLockup("auth-brand")}<section class="registration-flow"><h1>Регистрация</h1><p class="muted">Сначала выберите уникальное имя. На следующем шаге укажите почту — пароль придёт письмом.</p><div id="register-step-name"><label class="sr-only" for="register-name">Имя пользователя</label><input id="register-name" class="field" autocomplete="username" placeholder="Имя пользователя" /><button id="register-next" class="btn">Продолжить</button></div><div id="register-step-email" hidden><div class="card"><span class="muted">Имя пользователя</span><h2 id="register-name-preview"></h2></div><label class="sr-only" for="register-email">Электронная почта</label><input id="register-email" class="field" type="email" inputmode="email" autocomplete="email" placeholder="Электронная почта" /><button id="create" class="btn">Отправить пароль на почту</button><button id="register-back" class="btn ghost" type="button">Назад</button></div>${sent}</section><div class="card"><b>Вход</b><p class="muted">Для уже зарегистрированных пользователей вход остаётся по имени и ключу доступа.</p><label class="sr-only" for="login-name">Имя пользователя</label><input id="login-name" class="field" autocomplete="username" placeholder="Имя пользователя" /><label class="sr-only" for="access">Ключ доступа</label><textarea id="access" class="field" autocomplete="current-password" placeholder="Ключ доступа"></textarea><button id="login" class="btn ghost">Войти</button></div></main>`;

  const nameStep = query("#register-step-name"),
    emailStep = query("#register-step-email"),
    registerName = query("#register-name"),
    email = query("#register-email"),
    preview = query("#register-name-preview"),
    next = query("#register-next"),
    create = query("#create");
  next.addEventListener("click", () => {
    const username = registerName.value.trim();
    if (!username) {
      registerName.focus();
      return;
    }
    preview.textContent = username;
    nameStep.hidden = true;
    emailStep.hidden = false;
    email.focus();
  });
  query("#register-back").addEventListener("click", () => {
    emailStep.hidden = true;
    nameStep.hidden = false;
    registerName.focus();
  });
  create.addEventListener("click", async () => {
    const username = registerName.value.trim(),
      address = email.value.trim();
    if (!address) {
      email.focus();
      return;
    }
    create.disabled = true;
    create.textContent = "Отправляем…";
    try {
      await onRegister(username, address);
    } finally {
      if (document.body.contains(create)) {
        create.disabled = false;
        create.textContent = "Отправить пароль на почту";
      }
    }
  });
  query("#login").addEventListener("click", () =>
    onLogin(query("#login-name").value.trim(), query("#access").value.trim()),
  );
}

export function renderMain({
  activeScreen,
  session,
  friends,
  callHistory,
  mediaPermission,
  onNavigate,
  onSelectFriend,
  onCall,
  onGenerateInvite,
  onDeleteFriend,
  onRequestMediaAccess,
  onLogout,
}) {
  const callFriends = friends.length
      ? friends.map(friendCallCard).join("")
      : '<div class="card muted">Сначала добавьте друга через QR.</div>',
    allFriends =
      friends.map(friendListItem).join("") ||
      '<div class="card muted">Друзей пока нет.</div>',
    historyItems =
      callHistory.map(historyListItem).join("") ||
      '<div class="card empty-state"><span aria-hidden="true">◷</span><b>История пока пуста</b><p class="muted">Здесь появятся входящие и исходящие звонки.</p></div>';
  root.innerHTML = `<main class="app" data-active-screen="${activeScreen}"><section class="screen ${activeScreen === "home" ? "on" : ""}" data-screen="home"><header class="home-hero"><div class="home-copy">${brandLockup("hero-brand")}<h1>Звонки</h1><p>Выберите друга и начните разговор.</p></div>${auroraWaves()}</header>${mediaPermission?.status === "granted" ? "" : mediaAccessCard(mediaPermission, true)}<div class="grid"><button id="audio" class="call">☎<br />Аудиозвонок</button><button id="video" class="call video">▣<br />Видеозвонок</button></div><h2>Друзья</h2>${callFriends}</section><section class="screen ${activeScreen === "history" ? "on" : ""}" data-screen="history"><div class="section-heading"><div><span class="eyebrow">Последние события</span><h1>История звонков</h1></div><span class="history-count" aria-label="Звонков в истории: ${callHistory.length}">${callHistory.length}</span></div>${historyItems}</section><section class="screen ${activeScreen === "friends" ? "on" : ""}" data-screen="friends"><h1>Друзья</h1>${allFriends}</section><section class="screen ${activeScreen === "settings" ? "on" : ""}" data-screen="settings"><h1>Настройки</h1><div class="card"><span class="muted">Имя пользователя</span><h2>${escapeHtml(session.username)}</h2></div>${mediaAccessCard(mediaPermission)}<div class="card"><h2>QR-приглашение</h2><p class="muted">Одноразовое приглашение.</p><button id="generate-invite" class="btn">Создать QR</button><div id="invite"></div></div><button id="logout" class="btn ghost">Выйти</button></section>${navigation(activeScreen)}</main>`;
  mountXperiaFlow(root);
  const app = root.querySelector(".app");
  if (!isNativeApp()) {
    const privacy = document.createElement("div");
    privacy.className = "card";
    privacy.innerHTML =
      '<h2>Защита IP-адреса</h2><p class="muted">Звонки через сервер скрывают ваш IP-адрес от собеседника. При недоступности сервера звонок не соединится.</p><label><input type="checkbox" data-relay-only> Только через сервер</label>';
    const toggle = privacy.querySelector("[data-relay-only]");
    toggle.checked = relayOnlyEnabled();
    toggle.addEventListener("change", () => {
      try {
        setRelayOnlyEnabled(toggle.checked);
      } catch {
        toggle.checked = !toggle.checked;
      }
    });
    const settings = app.querySelector('[data-screen="settings"]');
    settings.insertBefore(privacy, settings.querySelector("#logout"));
  }
  const availableScreens = new Set(["home", "history", "friends", "settings"]);
  const activateScreen = (requestedScreen) => {
    const nextScreen = availableScreens.has(requestedScreen)
      ? requestedScreen
      : "home";
    app.dataset.activeScreen = nextScreen;
    app
      .querySelectorAll("[data-screen]")
      .forEach((screen) =>
        screen.classList.toggle("on", screen.dataset.screen === nextScreen),
      );
    app
      .querySelectorAll("[data-nav]")
      .forEach((button) =>
        button.classList.toggle("on", button.dataset.nav === nextScreen),
      );
    window.scrollTo?.(0, 0);
    onNavigate(nextScreen);
  };
  installEdgeSwipeBack(app, () => activateScreen("home"), {
    getVisualTarget: () => app.querySelector(".screen.on"),
    host: app,
    canStart: () => app.dataset.activeScreen !== "home",
  });
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) =>
      b.addEventListener("click", () => activateScreen(b.dataset.nav)),
    );
  document
    .querySelectorAll("[data-select]")
    .forEach((card) =>
      card.addEventListener("click", () =>
        onSelectFriend({ id: card.dataset.select, name: card.dataset.name }),
      ),
    );
  document.querySelectorAll("[data-call]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onCall(b.dataset.call, { id: b.dataset.id, name: b.dataset.name });
    }),
  );
  document
    .querySelectorAll("[data-delete-friend]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        onDeleteFriend({ id: b.dataset.deleteFriend, name: b.dataset.name }),
      ),
    );
  document
    .querySelectorAll("[data-request-media]")
    .forEach((b) => b.addEventListener("click", onRequestMediaAccess));
  query("#audio")?.addEventListener("click", () => onCall("audio"));
  query("#video")?.addEventListener("click", () => onCall("video"));
  query("#generate-invite")?.addEventListener("click", onGenerateInvite);
  query("#logout")?.addEventListener("click", onLogout);
}

export function renderInvite(url) {
  const target = query("#invite");
  if (!target) return;
  target.innerHTML = `<div class="invite-link">${escapeHtml(url)}</div><button id="copy-invite" class="btn ghost">Копировать ссылку</button>`;
}
