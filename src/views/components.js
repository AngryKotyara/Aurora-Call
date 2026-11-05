import { escapeHtml, formatCallDate, formatCallDuration } from "../utils.js";
import { logoUrl } from "../branding.js";

export function brandLockup(className = "") {
  return `<div class="brand ${className}">
    <span class="brand-logo-frame" aria-hidden="true">
      <img class="brand-logo" src="${logoUrl}" alt="" />
    </span>
    <span>Aurora Call</span>
  </div>`;
}

function callIcon(mode) {
  return mode === "video"
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"></rect><path d="m15 10 5-3v10l-5-3z"></path></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.3 3.8 10 7.7 8.2 10c1.2 2.4 3.3 4.5 5.8 5.8l2.3-1.8 3.9 2.7c.5.4.7 1 .4 1.6-.6 1.3-1.9 2.2-3.4 2.1C10 19.8 4.2 14 3.6 6.8c-.1-1.5.8-2.8 2.1-3.4.6-.3 1.2-.1 1.6.4z"></path></svg>`;
}

function directionIcon(isIncoming) {
  const arrow = isIncoming
    ? '<path d="M16.5 7.5 7.5 16.5M7.5 10v6.5H14"></path>'
    : '<path d="m7.5 16.5 9-9M10 7.5h6.5V14"></path>';
  return `<span class="history-direction-icon ${isIncoming ? "incoming" : "outgoing"}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${arrow}</svg></span>`;
}

function settingsIcon() {
  return `<svg class="nav-settings-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.25"></circle><path d="M12 2.75v2.1M12 19.15v2.1M2.75 12h2.1M19.15 12h2.1M5.46 5.46l1.49 1.49M17.05 17.05l1.49 1.49M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49"></path><path d="M9.15 4.35 10 2.95h4l.85 1.4M19.65 9.15l1.4.85v4l-1.4.85M14.85 19.65l-.85 1.4h-4l-.85-1.4M4.35 14.85 2.95 14v-4l1.4-.85"></path><path d="m6.5 4.9 1.45.7M16.05 18.4l1.45.7M19.1 6.5l-.7 1.45M5.6 16.05l-.7 1.45M17.5 4.9l-1.45.7M7.95 18.4l-1.45.7M4.9 6.5l.7 1.45M18.4 16.05l.7 1.45"></path></svg>`;
}

export function navigation(activeScreen) {
  const items = [
    ["home", "⌂", "Звонки"],
    ["history", "◷", "История"],
    ["friends", "♙", "Друзья"],
    ["settings", settingsIcon(), "Настройки"],
  ];
  return `<nav class="nav" aria-label="Основная навигация">${items.map(([screen, icon, label]) => `<button data-nav="${screen}" class="${activeScreen === screen ? "on" : ""}" aria-label="${label}">${icon}</button>`).join("")}</nav>`;
}

export function friendCallCard(friend) {
  const id = escapeHtml(friend.id),
    username = escapeHtml(friend.username),
    initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");
  return `<div class="card row" data-select="${id}" data-name="${username}"><span class="av" aria-hidden="true">${initial}</span><div class="grow"><b>${username}</b><div class="muted">Нажмите для выбора</div></div><button class="mini contact-call audio" data-call="audio" data-id="${id}" data-name="${username}" aria-label="Аудиозвонок: ${username}">${callIcon("audio")}</button><button class="mini contact-call video" data-call="video" data-id="${id}" data-name="${username}" aria-label="Видеозвонок: ${username}">${callIcon("video")}</button></div>`;
}

export function friendListItem(friend) {
  const id = escapeHtml(friend.id),
    username = escapeHtml(friend.username),
    initial = escapeHtml(friend.username[0]?.toUpperCase() || "?");
  return `<div class="card row friend-row"><span class="av" aria-hidden="true">${initial}</span><b class="grow">${username}</b><button class="delete-friend" data-delete-friend="${id}" data-name="${username}" aria-label="Удалить ${username} из друзей">Удалить</button></div>`;
}

export function historyListItem(call) {
  const peerName = escapeHtml(call.peer_name || "Неизвестный пользователь"),
    initial = escapeHtml(call.peer_name?.[0]?.toUpperCase() || "?"),
    isVideo = call.mode === "video",
    isIncoming = call.direction === "incoming",
    direction = isIncoming ? "Входящий" : "Исходящий",
    mode = isVideo ? "видео" : "аудио";
  const duration = formatCallDuration(call.duration_seconds);
  const statuses = {
    answered: "В разговоре",
    completed: duration || "Завершён",
    declined: "Нет ответа",
    missed: "Нет ответа",
    no_answer: "Нет ответа",
    started: "Вызов…",
  };
  const status = statuses[call.status] || "Завершён";
  const outcomeClass = ["declined", "missed", "no_answer"].includes(call.status)
    ? "no-answer"
    : call.status === "answered"
      ? "active"
      : call.status === "started"
        ? "waiting"
        : duration
          ? "duration"
          : "completed";
  const date = formatCallDate(call.created_at),
    machineDate = escapeHtml(call.created_at || "");
  return `<article class="card row history-row"><span class="history-avatar ${isVideo ? "video" : ""}" aria-hidden="true">${initial}</span><div class="grow history-content"><div class="history-title"><b>${peerName}</b><span class="history-call-type ${isVideo ? "video" : "audio"}" role="img" aria-label="${isVideo ? "Видеозвонок" : "Аудиозвонок"}">${callIcon(call.mode)}</span></div><div class="muted history-meta">${directionIcon(isIncoming)}<span>${direction}</span><span class="history-separator" aria-hidden="true">·</span><span>${mode}</span><span class="history-separator" aria-hidden="true">·</span><span class="history-outcome ${outcomeClass}">${status}</span></div><time class="history-time" datetime="${machineDate}">${date}</time></div></article>`;
}

export function auroraWaves() {
  return `<div class="xperia-flow" aria-hidden="true"></div>`;
}

export function mediaAccessCard(
  permission = { status: "prompt" },
  compact = false,
) {
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
