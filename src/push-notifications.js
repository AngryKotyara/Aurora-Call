import {
  disableAndroidNotifications,
  enableAndroidNotifications,
  isAndroidNativeApp,
  openAndroidFullScreenSettings,
  requestAndroidNotificationState,
} from "./android-native.js";
import { config } from "./config.js";
import { setAppBadgeCount } from "./app-badge.js";
import { PUSH_SUBSCRIPTION_SYNC_MS, pushSyncDue } from "./polling-policy.js";
import { state } from "./state.js";
import { showToast } from "./utils.js";

const VAPID_PUBLIC_KEY =
  "BMNFI7gc9X-oOOTXoFTRW2oulzz68swL5TOTK5g6EIR_svfw8BHXLG1u3sSMPaj_fxQ2B2XDpPP7jj4qO86chDU";
const PUSH_DISABLED_KEY = "aurora_push_disabled";
let syncInFlight = null;
let nativeSyncInFlight = null;
let lastSubscriptionSyncAt = 0;
let lastNativeSyncAt = 0;
let lastNativeFingerprint = "";
let nativePushState = null;
let maintenanceTimer = null;
let pushObserver = null;
let initialized = false;

function notificationsOptedOut() {
  try {
    return localStorage.getItem(PUSH_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function setNotificationsOptedOut(disabled) {
  try {
    if (disabled) localStorage.setItem(PUSH_DISABLED_KEY, "1");
    else localStorage.removeItem(PUSH_DISABLED_KEY);
  } catch {
    // Notification controls still work when storage is unavailable.
  }
}

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

function webPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function pushApi(body, { keepalive = false } = {}) {
  if (!state.session?.token) throw new Error("not_authenticated");
  const response = await fetch(`${config.functionsBaseUrl}aurora-push`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
      "X-Client-Info": isAndroidNativeApp()
        ? "aurora-call-android/2"
        : "aurora-call-web/1",
    },
    body: JSON.stringify(body),
    keepalive,
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

async function ensureWebSubscription() {
  if (
    !webPushSupported() ||
    Notification.permission !== "granted" ||
    notificationsOptedOut() ||
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
    lastSubscriptionSyncAt = Date.now();
    return subscription;
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

function nativeFingerprint(pushState = nativePushState) {
  if (!pushState?.token) return "";
  return [
    pushState.token,
    pushState.installation_id || "",
    pushState.app_version || "",
    pushState.device_model || "",
  ].join("|");
}

async function ensureNativeSubscription() {
  if (
    !isAndroidNativeApp() ||
    !state.session?.token ||
    !nativePushState?.enabled ||
    !nativePushState?.token
  )
    return null;
  if (nativeSyncInFlight) return nativeSyncInFlight;

  const fingerprint = nativeFingerprint();
  if (
    fingerprint &&
    fingerprint === lastNativeFingerprint &&
    !pushSyncDue(lastNativeSyncAt)
  )
    return nativePushState;

  nativeSyncInFlight = pushApi({
    action: "subscribe_native",
    device_token: nativePushState.token,
    installation_id: nativePushState.installation_id || null,
    app_version: nativePushState.app_version || null,
    device_model: nativePushState.device_model || null,
  })
    .then(() => {
      lastNativeFingerprint = fingerprint;
      lastNativeSyncAt = Date.now();
      return nativePushState;
    })
    .finally(() => {
      nativeSyncInFlight = null;
    });
  return nativeSyncInFlight;
}

async function enableNotifications() {
  if (isAndroidNativeApp()) {
    if (!enableAndroidNotifications()) {
      showToast("Не удалось открыть системное разрешение уведомлений");
      return;
    }
    return;
  }

  if (!webPushSupported()) {
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
    setNotificationsOptedOut(false);
    await ensureWebSubscription();
    showToast("Фоновые уведомления включены", true);
  } catch (error) {
    console.error("push subscription failed", error);
    showToast("Не удалось включить уведомления");
  }
  renderPushCard();
}

async function disableNotifications() {
  if (isAndroidNativeApp()) {
    const token = nativePushState?.token;
    if (token && state.session?.token) {
      await pushApi({
        action: "unsubscribe_native",
        device_token: token,
      }).catch(() => {});
    }
    lastNativeFingerprint = "";
    lastNativeSyncAt = 0;
    disableAndroidNotifications();
    return;
  }

  if (!webPushSupported()) return;
  setNotificationsOptedOut(true);
  lastSubscriptionSyncAt = 0;
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
    await setAppBadgeCount(0);
    showToast("Фоновые уведомления выключены", true);
  } catch (error) {
    console.error("push unsubscribe failed", error);
    showToast("Не удалось отключить уведомления");
  }
  renderPushCard();
}

function nativeCardCopy() {
  if (!nativePushState)
    return {
      title: "Проверяем уведомления",
      text: "Android сообщает состояние системных уведомлений.",
      action: "Проверка…",
      disabled: true,
      mode: "wait",
    };
  if (!nativePushState.distributor_available)
    return {
      title: "Нужен сервис доставки уведомлений",
      text: "Aurora Call работает без Google через UnifiedPush. Установите ntfy или Sunup, затем вернитесь в Aurora Call.",
      action: "Установить ntfy",
      disabled: false,
      mode: "unifiedpush_help",
    };
  if (
    nativePushState.registration_error === "temporary_unavailable" ||
    nativePushState.registration_error === "network"
  )
    return {
      title: "Сервис уведомлений временно недоступен",
      text: "Проверьте сеть и повторите подключение UnifiedPush.",
      action: "Повторить",
      disabled: false,
      mode: "enable",
    };
  if (nativePushState.user_enabled && !nativePushState.registered)
    return {
      title: "Подключите сервис уведомлений",
      text: nativePushState.distributor_selected
        ? "Android ещё не выдал push-endpoint. Повторите регистрацию."
        : "Выберите установленный UnifiedPush-сервис для Aurora Call.",
      action: "Подключить",
      disabled: false,
      mode: "enable",
    };
  if (nativePushState.enabled && !nativePushState.full_screen_allowed)
    return {
      title: "Фоновые уведомления включены",
      text: "Сообщения уже будут приходить. Разрешите полноэкранные уведомления, чтобы входящий звонок появлялся поверх экрана блокировки.",
      action: "Разрешить звонки",
      disabled: false,
      enabled: true,
      mode: "full_screen",
    };
  if (nativePushState.enabled)
    return {
      title: "Фоновые уведомления включены",
      text: "Aurora Call сможет сообщать о сообщениях и входящих звонках, даже когда приложение закрыто.",
      action: "Выключить уведомления",
      disabled: false,
      enabled: true,
      mode: "disable",
    };
  if (nativePushState.user_enabled)
    return {
      title: "Уведомления заблокированы Android",
      text: "Системное разрешение не выдано. Разрешите уведомления для Aurora Call и повторите подключение.",
      action: "Разрешить уведомления",
      disabled: false,
      mode: "enable",
    };
  return {
    title: "Уведомления о звонках и сообщениях",
    text: "Получайте системные уведомления Android без Firebase через UnifiedPush.",
    action: "Включить уведомления",
    disabled: false,
    mode: "enable",
  };
}

function cardCopy() {
  if (isAndroidNativeApp()) return nativeCardCopy();
  if (!webPushSupported())
    return {
      title: "Фоновые уведомления недоступны",
      text: "Этот браузер не поддерживает Web Push.",
      action: "Недоступно",
      disabled: true,
      mode: "unavailable",
    };
  if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent))
    return {
      title: "Уведомления о звонках и сообщениях",
      text: "Добавьте Aurora Call на экран «Домой», затем включите уведомления здесь.",
      action: "Как включить",
      disabled: false,
      mode: "ios_install",
    };
  if (Notification.permission === "denied")
    return {
      title: "Уведомления заблокированы",
      text: "Разрешите уведомления для Aurora Call в настройках устройства, затем откройте приложение снова.",
      action: "Заблокировано",
      disabled: true,
      mode: "blocked",
    };
  if (Notification.permission === "granted" && !notificationsOptedOut())
    return {
      title: "Фоновые уведомления включены",
      text: "Aurora Call сможет сообщать о новых сообщениях и входящих звонках, когда приложение закрыто.",
      action: "Выключить уведомления",
      disabled: false,
      enabled: true,
      mode: "disable",
    };
  if (Notification.permission === "granted")
    return {
      title: "Фоновые уведомления выключены",
      text: "Aurora Call не будет отправлять push-уведомления на это устройство.",
      action: "Включить уведомления",
      disabled: false,
      mode: "enable",
    };
  return {
    title: "Уведомления о звонках и сообщениях",
    text: "Получайте push-уведомления, даже когда Aurora Call закрыт.",
    action: "Включить уведомления",
    disabled: false,
    mode: "enable",
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
    if (copy.mode === "full_screen") {
      openAndroidFullScreenSettings();
      return;
    }
    if (copy.mode === "unifiedpush_help") {
      location.href = "https://unifiedpush.org/users/distributors/ntfy/";
      return;
    }
    if (copy.mode === "ios_install") {
      showToast(
        "Safari → Поделиться → На экран «Домой», затем откройте Aurora Call с иконки",
      );
      return;
    }
    if (copy.mode === "disable") {
      void disableNotifications();
      return;
    }
    if (copy.mode === "enable") void enableNotifications();
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
  if (type === "call") {
    const callId = params.get("call_id");
    if (callId) {
      document.dispatchEvent(
        new CustomEvent("aurora-call-open", { detail: { callId } }),
      );
      return;
    }
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

async function runMaintenance() {
  renderPushCard();
  if (!state.session) return;

  if (isAndroidNativeApp()) {
    requestAndroidNotificationState();
    if (
      nativePushState?.enabled &&
      nativePushState?.token &&
      pushSyncDue(lastNativeSyncAt)
    ) {
      try {
        await ensureNativeSubscription();
      } catch (error) {
        console.warn("Native push subscription maintenance failed", error);
      }
    }
    return;
  }

  if (
    document.visibilityState === "hidden" ||
    !webPushSupported() ||
    Notification.permission !== "granted" ||
    notificationsOptedOut() ||
    !pushSyncDue(lastSubscriptionSyncAt)
  )
    return;
  try {
    await ensureWebSubscription();
  } catch (error) {
    console.warn("Push subscription maintenance failed", error);
  }
}

function scheduleMaintenance(delay = 180) {
  if (maintenanceTimer !== null) window.clearTimeout(maintenanceTimer);
  maintenanceTimer = window.setTimeout(
    async () => {
      maintenanceTimer = null;
      await runMaintenance();
      const webNeedsMaintenance =
        !isAndroidNativeApp() &&
        webPushSupported() &&
        Notification.permission === "granted" &&
        !notificationsOptedOut() &&
        state.session;
      const nativeNeedsMaintenance =
        isAndroidNativeApp() && nativePushState?.user_enabled && state.session;
      if (webNeedsMaintenance || nativeNeedsMaintenance) {
        const lastSyncAt = isAndroidNativeApp()
          ? lastNativeSyncAt
          : lastSubscriptionSyncAt;
        const elapsed = Date.now() - lastSyncAt;
        scheduleMaintenance(
          Math.max(5 * 60_000, PUSH_SUBSCRIPTION_SYNC_MS - elapsed),
        );
      }
    },
    Math.max(0, delay),
  );
}

export async function detachPushSubscriptions() {
  if (!state.session?.token) return;
  if (isAndroidNativeApp()) {
    const token = nativePushState?.token;
    if (token) {
      await pushApi(
        { action: "unsubscribe_native", device_token: token },
        { keepalive: true },
      ).catch(() => {});
    }
    lastNativeFingerprint = "";
    lastNativeSyncAt = 0;
    return;
  }
  if (!webPushSupported()) return;
  try {
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription)
      await pushApi(
        { action: "unsubscribe", endpoint: subscription.endpoint },
        { keepalive: true },
      ).catch(() => {});
  } catch {
    // Logging out must still succeed if notification cleanup is unavailable.
  }
}

export function initPushNotifications() {
  if (initialized) return;
  initialized = true;

  document.addEventListener("aurora-native-push-state", (event) => {
    nativePushState = event.detail || null;
    renderPushCard();
    if (nativePushState?.enabled && nativePushState?.token && state.session)
      void ensureNativeSubscription().catch((error) =>
        console.warn("Native push subscription failed", error),
      );
  });

  if (isAndroidNativeApp()) requestAndroidNotificationState();
  scheduleMaintenance(0);
  const root = document.getElementById("root");
  if (root && !pushObserver) {
    pushObserver = new MutationObserver(() => scheduleMaintenance());
    pushObserver.observe(root, {
      childList: true,
      subtree: true,
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") scheduleMaintenance(0);
  });
  window.addEventListener("online", () => scheduleMaintenance(0));
  window.setTimeout(handlePushLaunch, 600);
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "aurora-push-open" && event.data.url)
      location.assign(event.data.url);
  });
}
