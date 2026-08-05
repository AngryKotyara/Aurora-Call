import { config } from "./config.js";

const permissionNames = ["microphone", "camera"];

function accountStorageKey(session) {
  const account = session?.username?.trim().toLocaleLowerCase() || "anonymous";
  return `${config.mediaPermissionStoragePrefix}:${encodeURIComponent(account)}`;
}

function hasStoredGrant(session, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(accountStorageKey(session)) === "granted";
  } catch {
    return false;
  }
}

function storeGrant(session, storage = globalThis.localStorage) {
  try {
    storage?.setItem(accountStorageKey(session), "granted");
  } catch {
    // Browser permission remains authoritative when storage is unavailable.
  }
}

export function clearMediaPermissionRecord(
  session,
  storage = globalThis.localStorage,
) {
  try {
    storage?.removeItem(accountStorageKey(session));
  } catch {
    // Private browsing and storage policies may make localStorage unavailable.
  }
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
    return { status: "unsupported" };
  }

  const states = await Promise.all(
    permissionNames.map((name) => readBrowserPermission(name, browser)),
  );

  if (states.includes("denied")) {
    clearMediaPermissionRecord(session, storage);
    return { status: "blocked" };
  }

  if (states.every((state) => state === "granted")) {
    storeGrant(session, storage);
    return { status: "granted" };
  }

  if (states.includes("prompt")) {
    clearMediaPermissionRecord(session, storage);
    return { status: "prompt" };
  }

  return {
    status: hasStoredGrant(session, storage) ? "granted" : "prompt",
  };
}

export async function requestMediaPermissions(
  session,
  browser = globalThis.navigator,
  storage = globalThis.localStorage,
) {
  if (!browser?.mediaDevices?.getUserMedia) {
    return { status: "unsupported" };
  }

  let stream;

  try {
    stream = await browser.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    storeGrant(session, storage);
    return { status: "granted" };
  } catch (error) {
    clearMediaPermissionRecord(session, storage);

    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return { status: "blocked" };
    }

    if (error?.name === "NotFoundError") {
      return { status: "missing-device" };
    }

    return { status: "error" };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
