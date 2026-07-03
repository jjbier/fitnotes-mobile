/**
 * UUID v4 generation, cross-platform (web + Hermes/React Native).
 * Uses the native crypto.randomUUID() when available (web, and mobile once
 * a polyfill installs it on Hermes); falls back to a manual RFC4122 v4
 * implementation otherwise. Real UUIDs (not a fake local ID swapped for a
 * server one later) let offline-created records keep a stable, final ID.
 */
export function generateUUID(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
