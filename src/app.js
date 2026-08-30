import { loginByAccessKey, registerByEmail, rpc } from "./api.js";
import { prepareAvatar, installProfileAvatar } from "./profile-avatar.js";
import { applyBranding } from "./branding.js";
import { pickCallContact } from "./call-picker.js";
import { startCall, startSignalPolling } from "./calls.js";
import { initChat } from "./chat.js?v=20260830-perf1";
import { installIncomingCallAlerting } from "./incoming-call.js";
import {
  disableMediaAccess,
  inspectMediaPermissions,
  requestMediaPermissions,
} from "./media-permissions.js";
import { installNavPolish } from "./nav-polish.js?v=20260813-gear2";
import {
  clearSession,
  migrateLegacySession,
  saveSession,
  state,
} from "./state.js";
import { renderAuth, renderInvite, renderMain } from "./ui.js";
import { isValidUsername, query, showToast } from "./utils.js";

applyBranding();
installIncomingCallAlerting();

let authActionInFlight = false;
let currentScreen = "home";
let lastViewRefreshAt = 0;
let backgroundRefresh = null;
let renderSequence = 0;
const VIEW_REFRESH_AFTER_MS = 30_000;

async function runAuthAction(action) {
  if (authActionInFlight) return;
  authActionInFlight = true;
  const shell = document.querySelector(".auth-v2");
  const controls = shell?.querySelectorAll("button, input, textarea") || [];
  shell?.setAttribute("aria-busy", "true");
  controls.forEach((control) => {
    control.disabled = true;
  });
  try {
    await action();
  } finally {
    authActionInFlight = false;
    if (shell?.isConnected) {
      shell.removeAttribute("aria-busy");
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  }
}

async function register(username, email) {
  try {
    if (!isValidUsername(username))
      throw new Error("Имя: 3–24 буквы, цифры или _");
    await registerByEmail(username, email);
    showToast("Пароль отправлен на указанную почту", true);
    renderAuth({
      onRegister: register,
      onLogin: login,
      registrationSentTo: email,
    });
  } catch (error) {
    const messages = {
      invalid_email: "Введите корректный адрес электронной почты",
      username_taken: "Имя пользователя уже занято",
      email_taken: "Эта почта уже используется",
      rate_limited: "Слишком много попыток. Попробуйте позже",
      mail_not_configured: "Отправка почты ещё не настроена на сервере",
      email_delivery_failed: "Не удалось отправить письмо. Попробуйте ещё раз",
      registration_failed: "Не удалось завершить регистрацию",
    };
    showToast(messages[error.message] || error.message);
  }
}

async function login(username, accessKey) {
  try {
    const session = await loginByAccessKey(username, accessKey);
    saveSession(session);
    await render();
    await acceptInviteFromUrl();
  } catch {
    showToast("Неверное имя или ключ");
  }
}

document.addEventListener("aurora-auth-login", (event) => {
  const username = String(event.detail?.username || "").trim();
  const accessKey = String(event.detail?.accessKey || "").trim();
  if (!username || !accessKey) {
    showToast("Введите имя и ключ доступа");
    return;
  }
  void runAuthAction(() => login(username, accessKey));
});
document.addEventListener("aurora-auth-register", (event) => {
  const username = String(event.detail?.username || "").trim();
  const email = String(event.detail?.email || "").trim();
  if (!username || !email) {
    showToast("Введите имя и электронную почту");
    return;
  }
  void runAuthAction(() => register(username, email));
});

function logout() {
  clearSession();
  renderSequence += 1;
  currentScreen = "home";
  lastViewRefreshAt = 0;
  backgroundRefresh = null;
  renderAuth({ onRegister: register, onLogin: login });
}
function selectFriend(friend) {
  state.selectedFriend = friend;
  showToast(`${friend.name} выбран`, true);
}

async function generateInvite() {
  try {
    const code = await rpc("create_call_friend_code", {
      p_token: state.session.token,
    });
    const url = `${location.origin}/?friend=${encodeURIComponent(code)}`;
    renderInvite(url);
    query("#copy-invite").addEventListener("click", async () => {
      await navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована", true);
    });
    showToast("QR создан", true);
  } catch (error) {
    showToast(error.message);
  }
}
async function acceptInviteFromUrl() {
  const inviteCode = new URLSearchParams(location.search).get("friend");
  if (!inviteCode || !state.session) return;
  try {
    await rpc("accept_call_friend_code", {
      p_token: state.session.token,
      p_code: inviteCode,
    });
    history.replaceState({}, "", location.pathname);
    showToast("Друг добавлен", true);
    await render("friends");
  } catch (error) {
    showToast(error.message);
  }
}
async function deleteFriend(friend) {
  if (!window.confirm(`Удалить ${friend.name} из друзей?`)) return;
  try {
    await rpc("remove_call_friend", {
      p_token: state.session.token,
      p_friend: friend.id,
    });
    if (state.selectedFriend?.id === friend.id) state.selectedFriend = null;
    await render("friends");
    showToast(`${friend.name} удалён из друзей`, true);
  } catch (error) {
    showToast(error.message);
  }
}

async function updateAvatar(file) {
  try {
    const avatar = await prepareAvatar(file);
    const result = await rpc("set_call_avatar", {
      p_token: state.session.token,
      p_avatar: avatar,
    });
    saveSession({
      ...state.session,
      avatar: result?.avatar || avatar,
    });
    showToast("Фото профиля обновлено", true);
    await render("settings");
  } catch (error) {
    const messages = {
      invalid_avatar_type: "Выберите изображение",
      avatar_too_large: "Исходное фото должно быть не больше 8 МБ",
      unsupported_image:
        "Этот формат изображения не поддерживается устройством",
      avatar_processing_failed: "Не удалось обработать фото",
      invalid_avatar: "Сервер отклонил изображение",
      invalid_session: "Сессия истекла. Войдите снова",
    };
    showToast(messages[error.message] || "Не удалось обновить фото профиля");
  }
}

async function removeAvatar() {
  try {
    await rpc("set_call_avatar", {
      p_token: state.session.token,
      p_avatar: null,
    });
    saveSession({ ...state.session, avatar: null });
    showToast("Фото профиля удалено", true);
    await render("settings");
  } catch (error) {
    showToast(
      error.message === "invalid_session"
        ? "Сессия истекла. Войдите снова"
        : "Не удалось удалить фото профиля",
    );
  }
}

async function toggleMediaAccess(activeScreen) {
  const current = await inspectMediaPermissions(state.session).catch(() => ({
    status: "prompt",
  }));
  if (current.status === "granted") {
    state.mediaStream?.getTracks?.().forEach((track) => track.stop());
    state.mediaStream = null;
    disableMediaAccess();
    showToast("Камера и микрофон выключены", true);
    await render(activeScreen);
    return;
  }
  const permission = await requestMediaPermissions(state.session);
  const messages = {
    granted: "Доступ к камере и микрофону разрешён",
    blocked: "Доступ заблокирован в настройках браузера",
    "missing-device": "Камера или микрофон не найдены",
    unsupported: "Браузер не поддерживает доступ к устройствам",
    error: "Не удалось проверить камеру и микрофон",
  };
  showToast(
    messages[permission.status] || "Состояние доступа обновлено",
    permission.status === "granted",
  );
  await render(activeScreen);
}

async function beginCall(mode, friend = null) {
  let target = friend;
  if (!target) target = await pickCallContact(state.friends || [], mode);
  if (!target) return;
  state.selectedFriend = target;
  void startCall(mode);
}
function navigateScreen(screen) {
  currentScreen = ["home", "history", "friends", "settings"].includes(screen)
    ? screen
    : "home";
  if (
    Date.now() - lastViewRefreshAt > VIEW_REFRESH_AFTER_MS &&
    !backgroundRefresh
  ) {
    backgroundRefresh = render(currentScreen)
      .catch((error) => console.warn("Background view refresh failed", error))
      .finally(() => {
        backgroundRefresh = null;
      });
  }
}

async function render(activeScreen = currentScreen) {
  const requestSequence = ++renderSequence;
  currentScreen = ["home", "history", "friends", "settings"].includes(
    activeScreen,
  )
    ? activeScreen
    : "home";
  if (!state.session) {
    renderAuth({ onRegister: register, onLogin: login });
    return;
  }
  const sessionToken = state.session.token;
  const [friends, callHistory, mediaPermission, profile] = await Promise.all([
    rpc("list_call_friends", { p_token: sessionToken }).catch(() => []),
    rpc("list_call_history", { p_token: sessionToken }).catch(() => []),
    inspectMediaPermissions(state.session).catch(() => ({ status: "prompt" })),
    rpc("get_call_profile", { p_token: sessionToken }).catch(() => null),
  ]);
  if (
    requestSequence !== renderSequence ||
    state.session?.token !== sessionToken
  )
    return;
  if (profile?.username) {
    saveSession({
      ...state.session,
      user_id: profile.user_id || state.session.user_id,
      username: profile.username,
      avatar: profile.avatar || null,
    });
  }
  state.friends = Array.isArray(friends) ? friends : [];
  state.callHistory = Array.isArray(callHistory) ? callHistory : [];
  lastViewRefreshAt = Date.now();
  renderMain({
    activeScreen: currentScreen,
    session: state.session,
    friends: state.friends,
    callHistory: state.callHistory,
    mediaPermission: mediaPermission || { status: "prompt" },
    onNavigate: navigateScreen,
    onSelectFriend: selectFriend,
    onCall: (mode, friend) => void beginCall(mode, friend || null),
    onGenerateInvite: generateInvite,
    onDeleteFriend: deleteFriend,
    onRequestMediaAccess: () => toggleMediaAccess(currentScreen),
    onLogout: logout,
  });
  installProfileAvatar({
    session: state.session,
    friends: state.friends,
    onChange: updateAvatar,
    onRemove: removeAvatar,
  });
}
async function bootstrap() {
  await migrateLegacySession();
  try {
    await render();
  } catch (error) {
    console.error("Aurora startup render failed", error);
    const root = document.getElementById("root");
    if (root)
      root.innerHTML = `<main class="app"><div class="card"><h1>Aurora Call</h1><p class="muted">Не удалось загрузить данные. Интерфейс запущен в безопасном режиме.</p><button id="aurora-retry-start" class="btn">Повторить</button></div></main>`;
    document
      .getElementById("aurora-retry-start")
      ?.addEventListener("click", () => location.reload());
    return;
  }
  try {
    await acceptInviteFromUrl();
  } catch (error) {
    console.warn("Invite bootstrap failed", error);
  }
  try {
    initChat();
  } catch (error) {
    console.warn("Chat bootstrap failed", error);
  }
  try {
    installNavPolish();
  } catch (error) {
    console.warn("Navigation polish failed", error);
  }
  document.addEventListener("aurora-chat-call", (event) => {
    const mode = event.detail?.mode === "video" ? "video" : "audio";
    void beginCall(mode, state.selectedFriend);
  });
  try {
    startSignalPolling();
  } catch (error) {
    console.warn("Signal polling failed", error);
  }
}
void bootstrap();
