let canvas = null;
let context = null;
let stream = null;
let firstFrameResolve = null;
let firstFrameReject = null;
let firstFrameTimer = null;
const nativeStreams = new WeakSet();

function bridge() {
  return window.webkit?.messageHandlers?.auroraScreenShare || null;
}

function clearFirstFrameWait() {
  if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
  firstFrameTimer = null;
  firstFrameResolve = null;
  firstFrameReject = null;
}

function destroyCanvasStream({ emitEnded = false } = {}) {
  const currentStream = stream;
  clearFirstFrameWait();
  currentStream?.getTracks().forEach((track) => track.stop());
  stream = null;
  canvas?.remove();
  canvas = null;
  context = null;

  if (emitEnded && currentStream)
    window.dispatchEvent(
      new CustomEvent("aurora-native-screen-share-ended", {
        detail: { stream: currentStream },
      }),
    );
}

export function isIOSNativeScreenShareAvailable() {
  return Boolean(bridge() && HTMLCanvasElement.prototype.captureStream);
}

export function isIOSScreenStream(candidate) {
  return Boolean(candidate && nativeStreams.has(candidate));
}

export async function createIOSScreenStream() {
  const nativeBridge = bridge();
  if (!nativeBridge)
    throw new Error("Aurora Call iOS bridge is unavailable");
  if (!HTMLCanvasElement.prototype.captureStream)
    throw new Error("Canvas capture is unavailable");

  destroyCanvasStream();

  canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  context = canvas.getContext("2d", { alpha: false });
  stream = canvas.captureStream(12);
  nativeStreams.add(stream);

  const firstFrame = new Promise((resolve, reject) => {
    firstFrameResolve = resolve;
    firstFrameReject = reject;
    firstFrameTimer = window.setTimeout(() => {
      firstFrameReject?.(new Error("ReplayKit did not start"));
      destroyCanvasStream();
    }, 25000);
  });

  window.__auroraReceiveScreenFrame = async (base64, width, height) => {
    if (!canvas || !context || !base64) return;

    try {
      const response = await fetch(`data:image/jpeg;base64,${base64}`);
      const bitmap = await createImageBitmap(await response.blob());
      const sourceWidth = Number(width) || bitmap.width;
      const sourceHeight = Number(height) || bitmap.height;

      if (canvas.width !== sourceWidth || canvas.height !== sourceHeight) {
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        context = canvas.getContext("2d", { alpha: false });
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      firstFrameResolve?.();
      clearFirstFrameWait();
    } catch (error) {
      firstFrameReject?.(error);
      clearFirstFrameWait();
    }
  };

  window.__auroraNativeScreenShareState = (status) => {
    if (status === "failed") {
      firstFrameReject?.(new Error("ReplayKit failed"));
      destroyCanvasStream({ emitEnded: true });
    } else if (status === "stopped") {
      destroyCanvasStream({ emitEnded: true });
    }
  };

  nativeBridge.postMessage({ action: "start" });
  await firstFrame;

  const videoTrack = stream?.getVideoTracks()[0];
  if (!videoTrack) throw new Error("ReplayKit video track is unavailable");
  videoTrack.contentHint = "detail";
  return stream;
}

export function stopIOSScreenShare() {
  bridge()?.postMessage({ action: "stop" });
  destroyCanvasStream();
}
