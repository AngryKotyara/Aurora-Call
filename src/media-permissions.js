import { config } from "./config.js";

const permissionNames = ["microphone", "camera"];
const DEVICE_ID_KEY = "aurora_device_id_v1";

function createDeviceId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fall through to a non-cryptographic local identifier. This ID is only
    // used to namespace browser state; it is not an authentication secret.
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceId(storage = globalThis.localStorage) {
  try {
    let deviceId = storage?.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = createDeviceId();
      storage?.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId || "ephemeral-device";
  } catch {
    return "ephemeral-device";
  }
}

function deviceStorageKey(storage = globalThis.localStorage) {
  return `${config.mediaPermissionStoragePrefix}:device:${encodeURIComponent(getDeviceId(storage))}`;
}

function legacyAccountStorageKey(session) {
  const account = session?.username?.trim().toLocaleLowerCase() || "anonymous";
  return `${config.mediaPermissionStoragePrefix}:${encodeURIComponent(account)}`;
}

function hasStoredGrant(session, storage = globalThis.localStorage) {
  try {
    const deviceKey = deviceStorageKey(storage);
    if (storage?.getItem(deviceKey) === "granted") return true;

    // One-time migration from the previous account-bound implementation.
    // If this browser had already been granted access for the current account,
    // move that grant to the device-level record instead of prompting again.
    if (storage?.getItem(legacyAccountStorageKey(session)) === "granted") {
      storage?.setItem(deviceKey, "granted");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function storeGrant(storage = globalThis.localStorage) {
  try {
    storage?.setItem(deviceStorageKey(storage), "granted");
  } catch {
    // Browser permission remains authoritative when storage is unavailable.
  }
}

export function clearMediaPermissionRecord(
  _session,
  storage = globalThis.localStorage,
) {
  try {
    storage?.removeItem(deviceStorageKey(storage));
  } catch {
    // Private browsing and storage policies may make localStorage unavailable.
  }
}

export function getLocalDeviceId(storage = globalThis.localStorage) {
  return getDeviceId(storage);
}

async function readBrowserPermission(name, browser) {
  if (!browser?.permissions?.query) return null;

  try {
    return (await browser.permissions.query({ name })).state;
  } catch {
    return null;
  }
}

export async function inspectMediaPermissions(
  session,
  browser = globalThis.navigator,
  storage = globalThis.localStorage,
) {
  if (!browser?.mediaDevices?.getUserMedia) {
    return { status: "unsupported", deviceId: getDeviceId(storage) };
  }

  const states = await Promise.all(
    permissionNames.map((name) => readBrowserPermission(name, browser)),
  );
  const storedGrant = hasStoredGrant(session, storage);
  const deviceId = getDeviceId(storage);

  if (states.includes("denied")) {
    clearMediaPermissionRecord(session, storage);
    return { status: "blocked", deviceId };
  }

  if (states.every((state) => state === "granted")) {
    storeGrant(storage);
    return { status: "granted", deviceId };
  }

  return {
    // Safari can report prompt/unknown again after relaunch even though its
    // origin-level grant still exists. Do not proactively call getUserMedia on
    // startup: retain the device record and let the actual call/voice action
    // ask the browser only when media is really needed.
    status: storedGrant ? "granted" : "prompt",
    deviceId,
  };
}

export async function requestMediaPermissions(
  session,
  browser = globalThis.navigator,
  storage = globalThis.localStorage,
) {
  const deviceId = getDeviceId(storage);
  if (!browser?.mediaDevices?.getUserMedia) {
    return { status: "unsupported", deviceId };
  }

  let stream;

  try {
    stream = await browser.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    storeGrant(storage);
    return { status: "granted", deviceId };
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      clearMediaPermissionRecord(session, storage);
      return { status: "blocked", deviceId };
    }

    if (error?.name === "NotFoundError") {
      return { status: "missing-device", deviceId };
    }

    return { status: "error", deviceId };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
