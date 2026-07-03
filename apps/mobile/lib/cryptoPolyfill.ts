// Hermes doesn't implement crypto.randomUUID() — install it via expo-crypto
// so @fitnotes/core's generateUUID() gets a real UUID on mobile too.
// Must be imported before any code that calls generateUUID().
import * as Crypto from "expo-crypto";

const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

if (!globalCrypto || typeof globalCrypto.randomUUID !== "function") {
  (globalThis as { crypto?: unknown }).crypto = {
    ...(globalCrypto ?? {}),
    randomUUID: () => Crypto.randomUUID(),
  };
}
