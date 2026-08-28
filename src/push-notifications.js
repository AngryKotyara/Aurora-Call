import { config } from "./config.js";
import { state } from "./state.js";
import { showToast } from "./utils.js";

const VAPID_PUBLIC_KEY =
  "BMNFI7gc9X-oOOTXoFTRW2oulzz68swL5TOTK5g6EIR_svfw8BHXLG1u3sSMPaj_fxQ2B2XDpPP7jj4qO86chDU";
let syncInFlight = null;

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function supported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function pushApi(body) {
  if (!state.session?.token) throw new Error("not_authenticated");
  const response = await fetch(`${config.functionsBaseUrl}aurora-push`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
      "X-Client-Info": "aurora-call-web/1",
    },
    body: JSON.stringify({ ...body, p_token: state.session.token }),
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => null))?.error || "push_request_failed",
    );
  return response.json().catch(() => ({}));
}

async function getRegistration() {
  return navigator.serviceWorker.ready;
}

async function ensureSubscription() {
  if (
    !supported() ||
    Notification.permission !== "granted" ||
    !state.session?.token
  )
    return null;
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await pushApi({
      action: "subscribe",
      subscription: subscription.toJSON(),
      user_agent: navigator.userAgent,
    });
    return subscription;
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function enableNotifications() {
  if (!supported()) {
    showToast("Push-уведомления не поддерживаются на этом устройстве");
    return;
  }
  if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    showToast("На iPhone сначала добавьте Aurora Call на экран «Домой»");
    return;
  }
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Разрешение на уведомления не выдано");
    renderPushCard();
    return;
  }
  try {
    await ensureSubscription();
    showToast("Фоновые уведомления включены", true);
  } catch (error) {
    console.error("push subscription failed", error);
    showToast("Не удалось включить уведомления");
  }
  renderPushCard();
}

async function disableNotifications() {
  if (!supported()) return;
  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await pushApi({
        action: "unsubscribe",
        endpoint: subscription.endpoint,
      }).catch(() => {});
      await subscription.unsubscribe();
    }
    showToast("Фоновые уведомления выключены", true);
  } catch (error) {
    console.error("push unsubscribe failed", error);
    showToast("Не удалось отключить уведомления");
  }
  renderPushCard();
}

function cardCopy() {
  if (!supported())
    return {
      title: "Фоновые уведомления недоступны",
      text: "Этот браузер не поддерживает Web Push.",
      action: "Недоступно",
      disabled: true,
    };
  if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent))
    return {
      title: "Уведомления о звонках и сообщениях",
      text: "Добавьте Aurora Call на экран «Домой», затем включите уведомления здесь.",
      action: "Как включить",
      disabled: false,
    };
  if (Notification.permission === "denied")
    return {
      title: "Уведомления заблокированы",
      text: "Разрешите уведомления для Aurora Call в настройках iPhone, затем откройте приложение снова.",
      action: "Заблокировано",
      disabled: true,
    };
  if (Notification.permission === "granted")
    return {
      title: "Фоновые уведомления включены",
      text: "Aurora Call сможет сообщать о новых сообщениях и входящих звонках, когда приложение закрыто.",
      action: "Выключить уведомления",
      disabled: false,
      enabled: true,
    };
  return {
    title: "Уведомления о звонках и сообщениях",
    text: "Получайте push-уведомления, даже когда Aurora Call закрыт.",
    action: "Включить уведомления",
    disabled: false,
  };
}

function renderPushCard() {
  if (!state.session) return;
  const settings = [...document.querySelectorAll(".screen")].find((screen) =>
    screen.querySelector("#logout"),
  );
  if (!settings) return;
  let card = settings.querySelector("[data-push-settings]");
  if (!card) {
    card = document.createElement("div");
    card.className = "card media-access";
    card.dataset.pushSettings = "";
    const qr = [...settings.querySelectorAll(".card")].find((item) =>
      item.querySelector("#generate-invite"),
    );
    settings.insertBefore(card, qr || settings.querySelector("#logout"));
  }
  const copy = cardCopy();
  const signature = JSON.stringify(copy);
  if (card.dataset.signature === signature) return;
  card.dataset.signature = signature;
  card.classList.toggle("granted", Boolean(copy.enabled));
  card.innerHTML = `<span class="media-access-icon" aria-hidden="true">${copy.enabled ? "✓" : "●"}</span><div class="media-access-copy"><h2>${copy.title}</h2><p class="muted">${copy.text}</p></div><button class="btn ${copy.enabled ? "ghost" : ""}" data-push-toggle ${copy.disabled ? "disabled" : ""}>${copy.action}</button>`;
  card.querySelector("[data-push-toggle]")?.addEventListener("click", () => {
    if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
      showToast(
        "Safari → Поделиться → На экран «Домой», затем откройте Aurora Call с иконки",
      );
      return;
    }
    void (copy.enabled ? disableNotifications() : enableNotifications());
  });
}

function handlePushLaunch() {
  const params = new URLSearchParams(location.search);
  const type = params.get("push");
  if (type === "message") {
    const friendId = params.get("friend_id");
    const friendName = params.get("friend_name") || "Чат";
    if (friendId)
      document.dispatchEvent(
        new CustomEvent("aurora-chat-open", {
          detail: { id: friendId, name: friendName },
        }),
      );
  }
  if (type) {
    params.delete("push");
    params.delete("friend_id");
    params.delete("friend_name");
    params.delete("call_id");
    const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
    history.replaceState(null, "", next);
  }
}

export function initPushNotifications() {
  renderPushCard();
  const root = document.getElementById("root");
  if (root)
    new MutationObserver(renderPushCard).observe(root, {
      childList: true,
      subtree: true,
    });
  window.setInterval(() => {
    renderPushCard();
    if (supported() && Notification.permission === "granted" && state.session)
      void ensureSubscription().catch(() => {});
  }, 5000);
  window.setTimeout(handlePushLaunch, 600);
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "aurora-push-open" && event.data.url)
      location.assign(event.data.url);
  });
}
