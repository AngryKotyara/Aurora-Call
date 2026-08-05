import { rpc } from "./api.js";
import { startCall, startSignalPolling } from "./calls.js";
import { clearSession, saveSession, state } from "./state.js";
import { renderAuth, renderInvite, renderMain } from "./ui.js";
import {
  downloadAccessKey,
  generateAccessKey,
  hashSecret,
  isValidUsername,
  query,
  showToast,
} from "./utils.js";

async function register(username) {
  try {
    if (!isValidUsername(username)) {
      throw new Error("Имя: 3–24 буквы, цифры или _");
    }

    const accessKey = generateAccessKey();
    const session = await rpc("register_call_user", {
      p_username: username,
      p_hash: await hashSecret(accessKey),
    });

    saveSession(session);
    downloadAccessKey(username, accessKey);
    await render();
    await acceptInviteFromUrl();
  } catch (error) {
    showToast(
      /duplicate|unique/i.test(error.message)
        ? "Имя пользователя занято"
        : error.message,
    );
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

async function render(activeScreen = "home") {
  if (!state.session) {
    renderAuth({ onRegister: register, onLogin: login });
    return;
  }

  state.friends = await rpc("list_call_friends", {
    p_token: state.session.token,
  }).catch(() => []);

  renderMain({
    activeScreen,
    session: state.session,
    friends: state.friends,
    onNavigate: render,
    onSelectFriend: selectFriend,
    onCall: (mode, friend) => {
      if (friend) state.selectedFriend = friend;
      void startCall(mode);
    },
    onGenerateInvite: generateInvite,
    onLogout: logout,
  });
}

async function bootstrap() {
  await render();
  await acceptInviteFromUrl();
  startSignalPolling();
}

void bootstrap();
