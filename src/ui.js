import { escapeHtml, formatCallDate, query } from "./utils.js";
import { logoUrl } from "./branding.js";
import { installEdgeSwipeBack } from "./chat-edge-swipe.js";
import { mountXperiaFlow } from "./xperia-flow.js";

const root = document.getElementById("root");

function brandLockup(className = "") {
  return `<div class="brand ${className}">
    <span class="brand-logo-frame" aria-hidden="true">
      <img class="brand-logo" src="${logoUrl}" alt="" />
    </span>
    <span>Aurora Call</span>
  </div>`;
}

function callIcon(mode) {
  return mode === "video"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"></rect><path d="m15 10 5-3v10l-5-3z"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 3.8 10 7.7 8.2 10c1.2 2.4 3.3 4.5 5.8 5.8l2.3-1.8 3.9 2.7c.5.4.7 1 .4 1.6-.6 1.3-1.9 2.2-3.4 2.1C10 19.8 4.2 14 3.6 6.8c-.1-1.5.8-2.8 2.1-3.4.6-.3 1.2-.1 1.6.4z"></path></svg>`;
}

function settingsIcon() {
  return `<svg class="nav-settings-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.25"></circle><path d="M12 2.75v2.1M12 19.15v2.1M2.75 12h2.1M19.15 12h2.1M5.46 5.46l1.49 1.49M17.05 17.05l1.49 1.49M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49"></path><path d="M9.15 4.35 10 2.95h4l.85 1.4M19.65 9.15l1.4.85v4l-1.4.85M14.85 19.65l-.85 1.4h-4l-.85-1.4M4.35 14.85 2.95 14v-4l1.4-.85"></path><path d="m6.5 4.9 1.45.7M16.05 18.4l1.45.7M19.1 6.5l-.7 1.45M5.6 16.05l-.7 1.45M17.5 4.9l-1.45.7M7.95 18.4l-1.45.7M4.9 6.5l.7 1.45M18.4 16.05l.7 1.45"></path></svg>`;
}

function navigation(activeScreen) {
  const items = [
    ["home", "⌂", "Звонки"],
    ["history", "◷", "История"],
    ["friends", "♙", "Друзья"],
    ["settings", settingsIcon(), "Настройки"],
  ];
  return `<nav class="nav" aria-label="Основная навигация">${items.map(([screen, icon, label]) => `<button data-nav="${screen}" class="${activeScreen === screen ? "on" : ""}" aria-label="${label}">${icon}</button>`).join("")}</nav>`;
}

function friendCallCard(friend) {
  const id = escapeHtml(friend.id),
    username = escapeHtml(friend.username),
    initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");
  return `<div class="card row" data-select="${id}" data-name="${username}"><span class="av" aria-hidden="true">${initial}</span><div class="grow"><b>${username}</b><div class="muted">Нажмите для выбора</div></div><button class="mini contact-call audio" data-call="audio" data-id="${id}" data-name="${username}" aria-label="Аудиозвонок: ${username}">${callIcon("audio")}</button><button class="mini contact-call video" data-call="video" data-id="${id}" data-name="${username}" aria-label="Видеозвонок: ${username}">${callIcon("video")}</button></div>`;
}

function friendListItem(friend) {
  const id = escapeHtml(friend.id),
    username = escapeHtml(friend.username),
    initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");
  return `<div class="card row friend-row"><span class="av" aria-hidden="true">${initial}</span><b class="grow">${username}</b><button class="delete-friend" data-delete-friend="${id}" data-name="${username}" aria-label="Удалить ${username} из друзей">Удалить</button></div>`;
}

function historyListItem(call) {
  const peerName = escapeHtml(call.peer_name || "Неизвестный пользователь"),
    initial = escapeHtml(call.peer_name?.[0]?.toUpperCase() || "?"),
    isVideo = call.mode === "video",
    isIncoming = call.direction === "incoming",
    direction = isIncoming ? "Входящий" : "Исходящий",
    mode = isVideo ? "видео" : "аудио";
  const statuses = {
    answered: "Принят",
    completed: "Завершён",
    declined: "Отклонён",
    started: "Ожидание ответа",
  };
  const status = statuses[call.status] || "Завершён",
    date = formatCallDate(call.created_at),
    machineDate = escapeHtml(call.created_at || "");
  return `<article class="card row history-row"><span class="history-avatar ${isVideo ? "video" : ""}" aria-hidden="true">${initial}</span><div class="grow"><div class="history-title"><b>${peerName}</b><span aria-hidden="true">${isVideo ? "▣" : "☎"}</span></div><div class="muted history-meta"><span class="direction ${isIncoming ? "incoming" : "outgoing"}">${isIncoming ? "↙" : "↗"}</span>${direction} · ${mode} · ${status}</div><time class="history-time" datetime="${machineDate}">${date}</time></div></article>`;
}

function auroraWaves() {
  return `<div class="xperia-flow" aria-hidden="true"></div>`;
}

function mediaAccessCard(permission = { status: "prompt" }, compact = false) {
  const content = permission.manuallyDisabled
    ? {
        icon: "○",
        title: "Камера и микрофон выключены",
        text: "Aurora Call не будет обращаться к устройствам, пока вы снова не включите доступ.",
        action: "Включить камеру и микрофон",
      }
    : {
        granted: {
          icon: "✓",
          title: "Камера и микрофон готовы",
          text: "Доступ сохранён для следующих входов на этом устройстве.",
          action: "Выключить камеру и микрофон",
        },
        prompt: {
          icon: "◉",
          title: "Разрешите доступ для звонков",
          text: "Браузер запросит камеру и микрофон один раз и запомнит ваш выбор.",
          action: "Разрешить камеру и микрофон",
        },
        blocked: {
          icon: "!",
          title: "Доступ заблокирован",
          text: "Разрешите камеру и микрофон в настройках сайта, затем повторите проверку.",
          action: "Повторить запрос",
        },
        "missing-device": {
          icon: "!",
          title: "Устройства не найдены",
          text: "Подключите камеру и микрофон, затем повторите проверку.",
          action: "Проверить снова",
        },
        unsupported: {
          icon: "!",
          title: "Доступ недоступен",
          text: "Откройте Aurora Call в современном браузере по защищённому адресу HTTPS.",
          action: "Недоступно",
        },
        error: {
          icon: "!",
          title: "Не удалось проверить доступ",
          text: "Проверьте подключение устройств и попробуйте ещё раз.",
          action: "Попробовать снова",
        },
      }[permission.status];
  const isGranted = permission.status === "granted",
    isUnsupported = permission.status === "unsupported";
  return `<div class="card media-access ${isGranted ? "granted" : ""} ${compact ? "compact" : ""}" data-media-status="${escapeHtml(permission.status)}"><span class="media-access-icon" aria-hidden="true">${content.icon}</span><div class="media-access-copy"><h2>${content.title}</h2><p class="muted">${content.text}</p></div><button class="btn ${isGranted ? "permission-granted" : ""}" data-request-media ${isUnsupported ? "disabled" : ""}>${content.action}</button></div>`;
}

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
  root.innerHTML = `<main class="app"><section class="screen ${activeScreen === "home" ? "on" : ""}"><header class="home-hero"><div class="home-copy">${brandLockup("hero-brand")}<h1>Звонки</h1><p>Выберите друга и начните разговор.</p></div>${auroraWaves()}</header>${mediaPermission?.status === "granted" ? "" : mediaAccessCard(mediaPermission, true)}<div class="grid"><button id="audio" class="call">☎<br />Аудиозвонок</button><button id="video" class="call video">▣<br />Видеозвонок</button></div><h2>Друзья</h2>${callFriends}</section><section class="screen ${activeScreen === "history" ? "on" : ""}"><div class="section-heading"><div><span class="eyebrow">Последние события</span><h1>История звонков</h1></div><span class="history-count" aria-label="Звонков в истории: ${callHistory.length}">${callHistory.length}</span></div>${historyItems}</section><section class="screen ${activeScreen === "friends" ? "on" : ""}"><h1>Друзья</h1>${allFriends}</section><section class="screen ${activeScreen === "settings" ? "on" : ""}"><h1>Настройки</h1><div class="card"><span class="muted">Имя пользователя</span><h2>${escapeHtml(session.username)}</h2></div>${mediaAccessCard(mediaPermission)}<div class="card"><h2>QR-приглашение</h2><p class="muted">Одноразовое приглашение.</p><button id="generate-invite" class="btn">Создать QR</button><div id="invite"></div></div><button id="logout" class="btn ghost">Выйти</button></section>${navigation(activeScreen)}</main>`;
  mountXperiaFlow(root);
  if (activeScreen !== "home") {
    const app = root.querySelector(".app");
    installEdgeSwipeBack(app, () => onNavigate("home"), {
      visualTarget: app?.querySelector(".screen.on"),
      host: app,
    });
  }
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) =>
      b.addEventListener("click", () => onNavigate(b.dataset.nav)),
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
