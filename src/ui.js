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

let callModalCleanup = () => {};

function callControlIcon(kind) {
  if (kind === "microphone")
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8.5" y="3" width="7" height="11" rx="3.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
      <path class="control-slash" d="m4 4 16 16" />
    </svg>`;

  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="6.5" width="13" height="11" rx="3" />
    <path d="m16 10 4-2.25v8.5L16 14" />
    <path class="control-slash" d="m4 4 16 16" />
  </svg>`;
}

function endCallIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.2 16.4c3.7-3.1 9.9-3.1 13.6 0" />
    <path d="m4.2 15.2 2.2 3.1M19.8 15.2l-2.2 3.1" />
  </svg>`;
}

function setMediaControlState(button, enabled, device) {
  const action = enabled ? "Выключить" : "Включить";
  const deviceName = device === "camera" ? "камеру" : "микрофон";
  const label = `${action} ${deviceName}`;

  button.dataset.enabled = String(enabled);
  button.classList.toggle("is-off", !enabled);
  button.setAttribute("aria-pressed", String(!enabled));
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function makePreviewDraggable(preview, boundary) {
  let drag = null;
  const margin = 12;

  function dimensions() {
    return {
      boundary: boundary.getBoundingClientRect(),
      preview: preview.getBoundingClientRect(),
    };
  }

  function place(left, top) {
    const rects = dimensions();
    const maxLeft = Math.max(
      margin,
      rects.boundary.width - rects.preview.width - margin,
    );
    const maxTop = Math.max(
      margin,
      rects.boundary.height - rects.preview.height - margin,
    );

    preview.style.right = "auto";
    preview.style.bottom = "auto";
    preview.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
    preview.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
  }

  function materializePosition() {
    const rects = dimensions();
    place(
      rects.preview.left - rects.boundary.left,
      rects.preview.top - rects.boundary.top,
    );
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    const rects = dimensions();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rects.preview.left,
      offsetY: event.clientY - rects.preview.top,
    };
    materializePosition();
    preview.classList.add("is-dragging");
    preview.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const boundaryRect = boundary.getBoundingClientRect();
    place(
      event.clientX - boundaryRect.left - drag.offsetX,
      event.clientY - boundaryRect.top - drag.offsetY,
    );
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    preview.releasePointerCapture?.(event.pointerId);
    preview.classList.remove("is-dragging");
    drag = null;
  }

  function onKeyDown(event) {
    const directions = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    };
    const movement = directions[event.key];

    if (!movement) return;
    if (!preview.style.left || !preview.style.top) materializePosition();
    place(
      Number.parseFloat(preview.style.left) + movement[0],
      Number.parseFloat(preview.style.top) + movement[1],
    );
    event.preventDefault();
  }

  function keepInsideScreen() {
    if (preview.style.left && preview.style.top)
      place(
        Number.parseFloat(preview.style.left),
        Number.parseFloat(preview.style.top),
      );
  }

  preview.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", keepInsideScreen);
  preview.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    window.removeEventListener("resize", keepInsideScreen);
  };
}

export function renderCallModal({
  friendName,
  mode,
  onToggleMic,
  onToggleCamera,
  onHangup,
}) {
  removeCallModal();
  const isVideo = mode === "video";
  const initial = escapeHtml(friendName?.[0]?.toUpperCase() || "?");

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal call-screen ${isVideo ? "video-call" : "audio-call"}" id="call-modal" role="dialog" aria-modal="true" aria-labelledby="call-peer-name" data-connection="connecting">
      <div class="call-stage">
        <video id="remote-video" class="remote-video" autoplay playsinline></video>
        <div class="call-audio-backdrop" aria-hidden="true">
          <span class="call-audio-avatar">${initial}</span>
        </div>
      </div>
      <div class="call-shade" aria-hidden="true"></div>
      <header class="call-header">
        <h2 id="call-peer-name">${escapeHtml(friendName)}</h2>
        <p><span class="connection-dot" aria-hidden="true"></span><span id="call-status">Соединение…</span> · ${isVideo ? "видео" : "аудио"}</p>
      </header>
      ${
        isVideo
          ? `<div id="local-preview" class="local-preview" role="group" tabindex="0" aria-label="Ваше видео. Перетащите его в удобное место или используйте клавиши со стрелками.">
        <video id="local-video" autoplay muted playsinline></video>
        <div class="local-preview-off" aria-hidden="true">
          ${callControlIcon("camera")}
          <span>Камера выключена</span>
        </div>
        <span class="local-preview-grip" aria-hidden="true"></span>
      </div>`
          : '<video id="local-video" class="audio-local-video" autoplay muted playsinline></video>'
      }
      <div class="controls" aria-label="Управление звонком">
        <button id="toggle-mic" class="media-control" type="button" data-enabled="true" aria-pressed="false" aria-label="Выключить микрофон" title="Выключить микрофон">
          <span class="control-icon">${callControlIcon("microphone")}</span>
          <span class="control-state" aria-hidden="true"></span>
        </button>
        ${
          isVideo
            ? `<button id="toggle-camera" class="media-control" type="button" data-enabled="true" aria-pressed="false" aria-label="Выключить камеру" title="Выключить камеру">
          <span class="control-icon">${callControlIcon("camera")}</span>
          <span class="control-state" aria-hidden="true"></span>
        </button>`
            : ""
        }
        <button id="hangup" class="danger hangup-control" type="button" aria-label="Завершить звонок" title="Завершить звонок">
          <span class="control-icon">${endCallIcon()}</span>
        </button>
      </div>
    </div>`,
  );

  document.body.classList.add("call-active");

  const microphoneButton = query("#toggle-mic");
  const cameraButton = query("#toggle-camera");
  const localPreview = query("#local-preview");

  microphoneButton.addEventListener("click", () => {
    const enabled = onToggleMic();
    setMediaControlState(microphoneButton, enabled, "microphone");
  });
  cameraButton?.addEventListener("click", () => {
    const enabled = onToggleCamera();
    setMediaControlState(cameraButton, enabled, "camera");
    localPreview?.classList.toggle("is-camera-off", !enabled);
  });
  query("#hangup").addEventListener("click", onHangup);

  if (localPreview)
    callModalCleanup = makePreviewDraggable(localPreview, query("#call-modal"));
}

export function removeCallModal() {
  callModalCleanup();
  callModalCleanup = () => {};
  query("#call-modal")?.remove();
  document.body.classList.remove("call-active");
}
