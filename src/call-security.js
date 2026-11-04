// WebRTC encrypts media with DTLS-SRTP. This optional code lets participants
// compare the DTLS certificate fingerprints over another trusted channel.
// It does not by itself authenticate either person or protect against a
// compromised copy of the website.
const FINGERPRINT =
  /^a=fingerprint:sha-256[ \t]+((?:[0-9a-f]{2}:){31}[0-9a-f]{2})[ \t]*\r?$/gim;

function sha256Fingerprint(sdp) {
  if (typeof sdp !== "string") return null;
  const values = new Set(
    Array.from(sdp.matchAll(FINGERPRINT), (match) =>
      match[1].replace(/:/g, "").toLowerCase(),
    ),
  );
  return values.size === 1 ? [...values][0] : null;
}

export function callFingerprintPair(localSdp, remoteSdp) {
  const local = sha256Fingerprint(localSdp);
  const remote = sha256Fingerprint(remoteSdp);
  if (!local || !remote) return null;
  return [local, remote].sort().join("\0");
}

export async function callVerificationCode(localSdp, remoteSdp) {
  const fingerprints = callFingerprintPair(localSdp, remoteSdp);
  if (!fingerprints || !globalThis.crypto?.subtle) return null;
  const input = new TextEncoder().encode(
    `AuroraCall:dtls-check:v1\0${fingerprints}`,
  );
  const hash = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", input),
  );
  let number = 0;
  for (let i = 0; i < 5; i++) number = number * 256 + hash[i];
  const digits = String(number % 1_000_000_000_000).padStart(12, "0");
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}
