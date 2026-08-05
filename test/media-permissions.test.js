import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectMediaPermissions,
  requestMediaPermissions,
} from "../src/media-permissions.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const session = { username: "Aurora_User" };

test("media access is requested once and persisted for the account", async () => {
  const storage = memoryStorage();
  let mediaRequests = 0;
  let stoppedTracks = 0;
  const browser = {
    mediaDevices: {
      getUserMedia: async (constraints) => {
        mediaRequests += 1;
        assert.deepEqual(constraints, { audio: true, video: true });
        return {
          getTracks: () => [
            { stop: () => (stoppedTracks += 1) },
            { stop: () => (stoppedTracks += 1) },
          ],
        };
      },
    },
  };

  assert.deepEqual(await requestMediaPermissions(session, browser, storage), {
    status: "granted",
  });
  assert.equal(mediaRequests, 1);
  assert.equal(stoppedTracks, 2);

  assert.deepEqual(await inspectMediaPermissions(session, browser, storage), {
    status: "granted",
  });
  assert.equal(mediaRequests, 1);
});

test("browser denial overrides a previously stored grant", async () => {
  const storage = memoryStorage();
  const browserWithoutPermissionApi = {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [] }),
    },
  };

  await requestMediaPermissions(session, browserWithoutPermissionApi, storage);
  const deniedBrowser = {
    ...browserWithoutPermissionApi,
    permissions: {
      query: async () => ({ state: "denied" }),
    },
  };

  assert.deepEqual(
    await inspectMediaPermissions(session, deniedBrowser, storage),
    { status: "blocked" },
  );
  assert.deepEqual(
    await inspectMediaPermissions(
      session,
      browserWithoutPermissionApi,
      storage,
    ),
    { status: "prompt" },
  );
});

test("permission prompt is detected without a stored grant", async () => {
  let mediaRequests = 0;
  const browser = {
    mediaDevices: {
      getUserMedia: async () => {
        mediaRequests += 1;
      },
    },
    permissions: {
      query: async () => ({ state: "prompt" }),
    },
  };

  assert.deepEqual(
    await inspectMediaPermissions(session, browser, memoryStorage()),
    { status: "prompt" },
  );
  assert.equal(mediaRequests, 0);
});

test("stored access survives a browser restart that reports prompt", async () => {
  const storage = memoryStorage();
  const browserBeforeRestart = {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [] }),
    },
  };

  await requestMediaPermissions(session, browserBeforeRestart, storage);

  let mediaRequests = 0;
  const browserAfterRestart = {
    mediaDevices: {
      getUserMedia: async () => {
        mediaRequests += 1;
      },
    },
    permissions: {
      query: async () => ({ state: "prompt" }),
    },
  };

  assert.deepEqual(
    await inspectMediaPermissions(session, browserAfterRestart, storage),
    { status: "granted" },
  );
  assert.equal(mediaRequests, 0);
});

test("temporary device errors do not erase a stored grant", async () => {
  const storage = memoryStorage();
  const browser = {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [] }),
    },
  };

  await requestMediaPermissions(session, browser, storage);

  const temporarilyUnavailableBrowser = {
    mediaDevices: {
      getUserMedia: async () => {
        throw Object.assign(new Error("camera is busy"), {
          name: "NotReadableError",
        });
      },
    },
  };

  assert.deepEqual(
    await requestMediaPermissions(
      session,
      temporarilyUnavailableBrowser,
      storage,
    ),
    { status: "error" },
  );
  assert.deepEqual(await inspectMediaPermissions(session, browser, storage), {
    status: "granted",
  });
});
