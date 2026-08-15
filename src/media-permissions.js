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
  } catch {}
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
  } catch { return "ephemeral-device"; }
}

function deviceStorageKey(storage = globalThis.localStorage) {
  return `${config.mediaPermissionStoragePrefix}:device:${encodeURIComponent(getDeviceId(storage))}`;
}
function disabledStorageKey(storage = globalThis.localStorage) {
  return `${deviceStorageKey(storage)}:disabled`;
}
function legacyAccountStorageKey(session) {
  const account = session?.username?.trim().toLocaleLowerCase() || "anonymous";
  return `${config.mediaPermissionStoragePrefix}:${encodeURIComponent(account)}`;
}

export function isMediaAccessDisabled(storage = globalThis.localStorage) {
  try { return storage?.getItem(disabledStorageKey(storage)) === "1"; }
  catch { return false; }
}
export function disableMediaAccess(storage = globalThis.localStorage) {
  try {
    storage?.setItem(disabledStorageKey(storage), "1");
    storage?.removeItem(deviceStorageKey(storage));
  } catch {}
}
export function enableMediaAccess(storage = globalThis.localStorage) {
  try { storage?.removeItem(disabledStorageKey(storage)); } catch {}
}

function hasStoredGrant(session, storage = globalThis.localStorage) {
  if (isMediaAccessDisabled(storage)) return false;
  try {
    const deviceKey = deviceStorageKey(storage);
    if (storage?.getItem(deviceKey) === "granted") return true;
    if (storage?.getItem(legacyAccountStorageKey(session)) === "granted") {
      storage?.setItem(deviceKey, "granted");
      return true;
    }
    return false;
  } catch { return false; }
}
function storeGrant(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(disabledStorageKey(storage));
    storage?.setItem(deviceStorageKey(storage), "granted");
  } catch {}
}
export function clearMediaPermissionRecord(_session, storage = globalThis.localStorage) {
  try { storage?.removeItem(deviceStorageKey(storage)); } catch {}
}
export function getLocalDeviceId(storage = globalThis.localStorage) { return getDeviceId(storage); }

async function readBrowserPermission(name, browser) {
  if (!browser?.permissions?.query) return null;
  try { return (await browser.permissions.query({ name })).state; }
  catch { return null; }
}

export async function inspectMediaPermissions(session, browser = globalThis.navigator, storage = globalThis.localStorage) {
  const deviceId = getDeviceId(storage);
  if (isMediaAccessDisabled(storage)) return { status: "disabled", deviceId };
  if (!browser?.mediaDevices?.getUserMedia) return { status: "unsupported", deviceId };

  const states = await Promise.all(permissionNames.map((name) => readBrowserPermission(name, browser)));
  const storedGrant = hasStoredGrant(session, storage);
  if (states.includes("denied")) {
    clearMediaPermissionRecord(session, storage);
    return { status: "blocked", deviceId };
  }
  if (states.every((state) => state === "granted")) {
    storeGrant(storage);
    return { status: "granted", deviceId };
  }
  return { status: storedGrant ? "granted" : "prompt", deviceId };
}

export async function requestMediaPermissions(session, browser = globalThis.navigator, storage = globalThis.localStorage) {
  const deviceId = getDeviceId(storage);
  enableMediaAccess(storage);
  if (!browser?.mediaDevices?.getUserMedia) return { status: "unsupported", deviceId };
  let stream;
  try {
    stream = await browser.mediaDevices.getUserMedia({ audio: true, video: true });
    storeGrant(storage);
    return { status: "granted", deviceId };
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      clearMediaPermissionRecord(session, storage);
      return { status: "blocked", deviceId };
    }
    if (error?.name === "NotFoundError") return { status: "missing-device", deviceId };
    return { status: "error", deviceId };
  } finally { stream?.getTracks().forEach((track) => track.stop()); }
}
