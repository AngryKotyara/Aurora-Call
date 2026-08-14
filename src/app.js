import { registerByEmail, rpc } from "./api.js";
import { applyBranding } from "./branding.js";
import { pickCallContact } from "./call-picker.js";
import { startCall, startSignalPolling } from "./calls.js";
import { initChat } from "./chat.js";
import { installIncomingCallAlerting } from "./incoming-call.js";
import {
  inspectMediaPermissions,
  requestMediaPermissions,
} from "./media-permissions.js";
import { installNavPolish } from "./nav-polish.js?v=20260813-gear2";
import { clearSession, saveSession, state } from "./state.js";
import { renderAuth, renderInvite, renderMain } from "./ui.js";
import {
  hashSecret,
  isValidUsername,
  query,
  showToast,
} from "./utils.js";

applyBranding();
installIncomingCallAlerting();

async function register(username, email) {
  try {
    if (!isValidUsername(username)) {
      throw new Error("Имя: 3–24 буквы, цифры или _");
    }

    await registerByEmail(username, email);
    showToast("Пароль отправлен на указанную почту", true);
    renderAuth({ onRegister: register, onLogin: login, registrationSentTo: email });
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
    const session = await rpc("login_call_user", {
      p_username: username,
      p_hash: await hashSecret(accessKey),
    });
    saveSession(session);
    await render();
    await acceptInviteFromUrl();
  } catch {
    showToast("Неверное имя или ключ");
  }
}

function logout() {
  clearSession();
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

    if (state.selectedFriend?.id === friend.id) {
      state.selectedFriend = null;
    }

    await render("friends");
    showToast(`${friend.name} удалён из друзей`, true);
  } catch (error) {
    showToast(error.message);
  }
}

async function grantMediaAccess(activeScreen) {
  const permission = await requestMediaPermissions(state.session);
  const messages = {
    granted: "Доступ к камере и микрофону разрешён",
    blocked: "Доступ заблокирован в настройках браузера",
    "missing-device": "Камера или микрофон не найдены",
    unsupported: "Браузер не поддерживает доступ к устройствам",
    error: "Не удалось проверить камеру и микрофон",
  };

  showToast(messages[permission.status], permission.status === "granted");
  await render(activeScreen);
}

async function beginCall(mode, friend = null) {
  let target = friend;
  if (!target) target = await pickCallContact(state.friends || [], mode);
  if (!target) return;
  state.selectedFriend = target;
  void startCall(mode);
}

async function render(activeScreen = "home") {
  if (!state.session) {
    renderAuth({ onRegister: register, onLogin: login });
    return;
  }

  const [friends, callHistory, mediaPermission] = await Promise.all([
    rpc("list_call_friends", {
      p_token: state.session.token,
    }).catch(() => []),
    rpc("list_call_history", {
      p_token: state.session.token,
    }).catch(() => []),
    inspectMediaPermissions(state.session).catch((error) => {
      console.warn("Media permission inspection failed during startup", error);
      return { status: "prompt" };
    }),
  ]);
  state.friends = Array.isArray(friends) ? friends : [];
  state.callHistory = Array.isArray(callHistory) ? callHistory : [];

  renderMain({
    activeScreen,
    session: state.session,
    friends: state.friends,
    callHistory: state.callHistory,
    mediaPermission: mediaPermission || { status: "prompt" },
    onNavigate: render,
    onSelectFriend: selectFriend,
    onCall: (mode, friend) => void beginCall(mode, friend || null),
    onGenerateInvite: generateInvite,
    onDeleteFriend: deleteFriend,
    onRequestMediaAccess: () => grantMediaAccess(activeScreen),
    onLogout: logout,
  });
}

async function bootstrap() {
  try {
    await render();
  } catch (error) {
    console.error("Aurora startup render failed", error);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `<main class="app"><div class="card"><h1>Aurora Call</h1><p class="muted">Не удалось загрузить данные. Интерфейс запущен в безопасном режиме.</p><button id="aurora-retry-start" class="btn">Повторить</button></div></main>`;
      document.getElementById("aurora-retry-start")?.addEventListener("click", () => location.reload());
    }
    return;
  }

  try { await acceptInviteFromUrl(); } catch (error) { console.warn("Invite bootstrap failed", error); }
  try { initChat(); } catch (error) { console.warn("Chat bootstrap failed", error); }
  try { installNavPolish(); } catch (error) { console.warn("Navigation polish failed", error); }
  document.addEventListener("aurora-chat-call", (event) => {
    const mode = event.detail?.mode === "video" ? "video" : "audio";
    void beginCall(mode, state.selectedFriend);
  });
  try { startSignalPolling(); } catch (error) { console.warn("Signal polling failed", error); }
}

void bootstrap();
