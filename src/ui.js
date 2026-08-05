import { escapeHtml, query } from "./utils.js";

const root = document.getElementById("root");

function navigation(activeScreen) {
  const items = [
    ["home", "⌂", "Звонки"],
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
  const username = escapeHtml(friend.username);
  const initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");

  return `<div class="card row"><span class="av" aria-hidden="true">${initial}</span><b>${username}</b></div>`;
}

export function renderAuth({ onRegister, onLogin }) {
  root.innerHTML = `
    <main class="app">
      <div class="brand">Aurora Call</div>
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
  onNavigate,
  onSelectFriend,
  onCall,
  onGenerateInvite,
  onLogout,
}) {
  const callFriends = friends.length
    ? friends.map(friendCallCard).join("")
    : '<div class="card muted">Сначала добавьте друга через QR.</div>';
  const allFriends =
    friends.map(friendListItem).join("") ||
    '<div class="card muted">Друзей пока нет.</div>';

  root.innerHTML = `
    <main class="app">
      <section class="screen ${activeScreen === "home" ? "on" : ""}">
        <div class="brand">Aurora</div>
        <h1>Звонки</h1>
        <p class="muted">Выберите друга и начните разговор.</p>
        <div class="grid">
          <button id="audio" class="call">☎<br />Аудиозвонок</button>
          <button id="video" class="call video">▣<br />Видеозвонок</button>
        </div>
        <h2>Друзья</h2>
        ${callFriends}
      </section>
      <section class="screen ${activeScreen === "friends" ? "on" : ""}">
        <h1>Друзья</h1>
        ${allFriends}
      </section>
      <section class="screen ${activeScreen === "settings" ? "on" : ""}">
        <h1>Настройки</h1>
        <div class="card"><span class="muted">Имя пользователя</span><h2>${escapeHtml(session.username)}</h2></div>
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
