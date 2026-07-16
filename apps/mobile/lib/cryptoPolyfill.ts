/**
 * Polyfill de `crypto.randomUUID()` para el motor Hermes de React Native.
 *
 * Módulo de solo efecto secundario (no exporta nada): al importarse, parchea
 * `globalThis.crypto` si Hermes no trae `randomUUID` implementado, delegando
 * en `expo-crypto`. Necesario porque `generateUUID()` de `@fitnotes/core`
 * asume `crypto.randomUUID()` nativo (disponible en navegadores y Node, no en
 * Hermes) — sin este polyfill los inserts offline fallarían al generar el
 * UUID definitivo del registro.
 *
 * Debe importarse antes de cualquier código que llame a `generateUUID()`
 * (típicamente el primer import de la entrada de la app).
 */
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
