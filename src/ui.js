import { escapeHtml, formatCallDate, query } from "./utils.js";
import { logoUrl } from "./branding.js";

const root = document.getElementById("root");

function brandLockup(className = "") {
  return `<div class="brand ${className}">
    <span class="brand-logo-frame" aria-hidden="true">
      <img class="brand-logo" src="${logoUrl}" alt="" />
    </span>
    <span>Aurora Call</span>
  </div>`;
}

function navigation(activeScreen) {
  const items = [
    ["home", "⌂", "Звонки"],
    ["history", "◷", "История"],
    ["friends", "♙", "Друзья"],
    ["settings", "⚙", "Настройки"],
  ];

  return `<nav class="nav" aria-label="Основная навигация">${items
    .map(
      ([screen, icon, label]) =>
        `<button data-nav="${screen}" class="${activeScreen === screen ? "on" : ""}" aria-label="${label}">${icon}</button>`,
    )
    .join("")}</nav>`;
}

function friendCallCard(friend) {
  const id = escapeHtml(friend.id);
  const username = escapeHtml(friend.username);
  const initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");

  return `
    <div class="card row" data-select="${id}" data-name="${username}">
      <span class="av" aria-hidden="true">${initial}</span>
      <div class="grow">
        <b>${username}</b>
        <div class="muted">Нажмите для выбора</div>
      </div>
      <button class="mini" data-call="audio" data-id="${id}" data-name="${username}" aria-label="Аудиозвонок: ${username}">☎</button>
      <button class="mini v" data-call="video" data-id="${id}" data-name="${username}" aria-label="Видеозвонок: ${username}">▣</button>
    </div>`;
}

function friendListItem(friend) {
  const id = escapeHtml(friend.id);
  const username = escapeHtml(friend.username);
  const initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");

  return `<div class="card row friend-row">
    <span class="av" aria-hidden="true">${initial}</span>
    <b class="grow">${username}</b>
    <button class="delete-friend" data-delete-friend="${id}" data-name="${username}" aria-label="Удалить ${username} из друзей">Удалить</button>
  </div>`;
}

function historyListItem(call) {
  const peerName = escapeHtml(call.peer_name || "Неизвестный пользователь");
  const initial = escapeHtml(call.peer_name?.[0]?.toUpperCase() || "?");
  const isVideo = call.mode === "video";
  const isIncoming = call.direction === "incoming";
  const direction = isIncoming ? "Входящий" : "Исходящий";
  const mode = isVideo ? "видео" : "аудио";
  const statuses = {
    answered: "Принят",
    completed: "Завершён",
    declined: "Отклонён",
    started: "Ожидание ответа",
  };
  const status = statuses[call.status] || "Завершён";
  const date = formatCallDate(call.created_at);
  const machineDate = escapeHtml(call.created_at || "");

  return `<article class="card row history-row">
    <span class="history-avatar ${isVideo ? "video" : ""}" aria-hidden="true">${initial}</span>
    <div class="grow">
      <div class="history-title"><b>${peerName}</b><span aria-hidden="true">${isVideo ? "▣" : "☎"}</span></div>
      <div class="muted history-meta"><span class="direction ${isIncoming ? "incoming" : "outgoing"}">${isIncoming ? "↙" : "↗"}</span>${direction} · ${mode} · ${status}</div>
      <time class="history-time" datetime="${machineDate}">${date}</time>
    </div>
  </article>`;
}

function auroraWaves() {
  const wavePath =
    "M0 72 C36 20 72 20 108 72 S180 124 216 72 S288 20 324 72 S396 124 432 72 S504 20 540 72 S612 124 648 72 S720 20 756 72 S828 124 864 72";

  return `<div class="aurora-waves" aria-hidden="true">
    <svg viewBox="0 0 864 144" preserveAspectRatio="none">
      <g class="wave-track wave-track-one"><path d="${wavePath}" /></g>
      <g class="wave-track wave-track-two"><path d="${wavePath}" /></g>
      <g class="wave-track wave-track-three"><path d="${wavePath}" /></g>
    </svg>
  </div>`;
}

function mediaAccessCard(permission = { status: "prompt" }, compact = false) {
  const content =
    {
      granted: {
        icon: "✓",
        title: "Камера и микрофон готовы",
        text: "Доступ сохранён для следующих входов на этом устройстве.",
        action: "Доступ разрешён",
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
    }[permission.status] || null;
  const isGranted = permission.status === "granted";
  const isUnsupported = permission.status === "unsupported";

  return `<div class="card media-access ${isGranted ? "granted" : ""} ${compact ? "compact" : ""}" data-media-status="${escapeHtml(permission.status)}">
    <span class="media-access-icon" aria-hidden="true">${content.icon}</span>
    <div class="media-access-copy">
      <h2>${content.title}</h2>
      <p class="muted">${content.text}</p>
    </div>
    <button class="btn ${isGranted ? "permission-granted" : ""}" data-request-media ${isGranted || isUnsupported ? "disabled" : ""}>${content.action}</button>
  </div>`;
}

export function renderAuth({ onRegister, onLogin }) {
  root.innerHTML = `
    <main class="app">
      ${brandLockup("auth-brand")}
      <h1>Регистрация</h1>
      <p class="muted">Имя уникально и не меняется.</p>
      <label class="sr-only" for="name">Имя пользователя</label>
      <input id="name" class="field" autocomplete="username" placeholder="Имя пользователя" />
      <button id="create" class="btn">Создать аккаунт</button>
      <div class="card">
        <b>Вход</b>
        <label class="sr-only" for="access">Ключ доступа</label>
        <textarea id="access" class="field" autocomplete="current-password" placeholder="Ключ доступа"></textarea>
        <button id="login" class="btn ghost">Войти</button>
      </div>
    </main>`;

  query("#create").addEventListener("click", () =>
    onRegister(query("#name").value.trim()),
  );
  query("#login").addEventListener("click", () =>
    onLogin(query("#name").value.trim(), query("#access").value.trim()),
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
    : '<div class="card muted">Сначала добавьте друга через QR.</div>';
  const allFriends =
    friends.map(friendListItem).join("") ||
    '<div class="card muted">Друзей пока нет.</div>';
  const historyItems =
    callHistory.map(historyListItem).join("") ||
    '<div class="card empty-state"><span aria-hidden="true">◷</span><b>История пока пуста</b><p class="muted">Здесь появятся входящие и исходящие звонки.</p></div>';

  root.innerHTML = `
    <main class="app">
      <section class="screen ${activeScreen === "home" ? "on" : ""}">
        <header class="home-hero">
          <div class="home-copy">
            ${brandLockup("hero-brand")}
            <h1>Звонки</h1>
            <p>Выберите друга и начните разговор.</p>
          </div>
          ${auroraWaves()}
        </header>
        ${mediaPermission?.status === "granted" ? "" : mediaAccessCard(mediaPermission, true)}
        <div class="grid">
          <button id="audio" class="call">☎<br />Аудиозвонок</button>
          <button id="video" class="call video">▣<br />Видеозвонок</button>
        </div>
        <h2>Друзья</h2>
        ${callFriends}
      </section>
      <section class="screen ${activeScreen === "history" ? "on" : ""}">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Последние события</span>
            <h1>История звонков</h1>
          </div>
          <span class="history-count" aria-label="Звонков в истории: ${callHistory.length}">${callHistory.length}</span>
        </div>
        ${historyItems}
      </section>
      <section class="screen ${activeScreen === "friends" ? "on" : ""}">
        <h1>Друзья</h1>
        ${allFriends}
      </section>
      <section class="screen ${activeScreen === "settings" ? "on" : ""}">
        <h1>Настройки</h1>
        <div class="card"><span class="muted">Имя пользователя</span><h2>${escapeHtml(session.username)}</h2></div>
        ${mediaAccessCard(mediaPermission)}
        <div class="card">
          <h2>QR-приглашение</h2>
          <p class="muted">Одноразовое приглашение.</p>
          <button id="generate-invite" class="btn">Создать QR</button>
          <div id="invite"></div>
        </div>
        <button id="logout" class="btn ghost">Выйти</button>
      </section>
      ${navigation(activeScreen)}
    </main>`;

  document
    .querySelectorAll("[data-nav]")
    .forEach((button) =>
      button.addEventListener("click", () => onNavigate(button.dataset.nav)),
    );
  document
    .querySelectorAll("[data-select]")
    .forEach((card) =>
      card.addEventListener("click", () =>
        onSelectFriend({ id: card.dataset.select, name: card.dataset.name }),
      ),
    );
  document.querySelectorAll("[data-call]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onCall(button.dataset.call, {
        id: button.dataset.id,
        name: button.dataset.name,
      });
    }),
  );
  document.querySelectorAll("[data-delete-friend]").forEach((button) =>
    button.addEventListener("click", () =>
      onDeleteFriend({
        id: button.dataset.deleteFriend,
        name: button.dataset.name,
      }),
    ),
  );
  document.querySelectorAll("[data-request-media]").forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-request-media]").forEach((item) => {
        item.disabled = true;
        item.textContent = "Ожидаем разрешение…";
      });
      void onRequestMediaAccess();
    }),
  );
  query("#audio")?.addEventListener("click", () => onCall("audio"));
  query("#video")?.addEventListener("click", () => onCall("video"));
  query("#generate-invite")?.addEventListener("click", onGenerateInvite);
  query("#logout")?.addEventListener("click", onLogout);
}

export function renderInvite(url) {
  const qrSource =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=" +
    encodeURIComponent(url);

  query("#invite").innerHTML = `
    <div id="qr"><img src="${qrSource}" alt="QR-код приглашения" /></div>
    <button id="copy-invite" class="btn ghost">Скопировать ссылку</button>`;
}

export function renderCallModal({
  friendName,
  mode,
  onToggleMic,
  onToggleCamera,
  onHangup,
}) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal" id="call-modal">
      <div class="box">
        <h2>${escapeHtml(friendName)}</h2>
        <p class="muted">${mode === "video" ? "Видеозвонок" : "Аудиозвонок"}</p>
        <video id="remote-video" autoplay playsinline></video>
        <video id="local-video" class="local" autoplay muted playsinline></video>
        <div class="controls">
          <button id="toggle-mic" aria-label="Включить или выключить микрофон">🎙</button>
          <button id="toggle-camera" aria-label="Включить или выключить камеру">📷</button>
          <button id="hangup" class="danger" aria-label="Завершить звонок">✕</button>
        </div>
      </div>
    </div>`,
  );

  query("#toggle-mic").addEventListener("click", onToggleMic);
  query("#toggle-camera").addEventListener("click", onToggleCamera);
  query("#hangup").addEventListener("click", onHangup);
}

export function removeCallModal() {
  query("#call-modal")?.remove();
}
