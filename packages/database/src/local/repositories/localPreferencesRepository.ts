import { DEFAULT_PREFERENCES, type UserPreferences } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";

/**
 * Prefijo reservado para entradas efímeras de dispositivo (ver {@link
 * createLocalPreferencesRepository}'s `getRaw`/`setRaw`/`deleteRaw`) —
 * `getAll()` las excluye explícitamente para que nunca viajen dentro del
 * objeto `UserPreferences` (y, con cuenta real, nunca acaben escritas en
 * `user_metadata` remoto junto con las preferencias reales).
 */
export const EPHEMERAL_KEY_PREFIX = "_ephemeral:";

/**
 * Repositorio local de preferencias — clave/valor en SQLite (`user_preferences`),
 * codificado en JSON por valor. Sirve de fallback en modo invitado; para cuentas
 * reales, `_layout.tsx` mantiene esta tabla como espejo local de `user_metadata`
 * (hidrata al iniciar sesión, cada escritura también actualiza `user_metadata`
 * en segundo plano). No es una tabla sincronizable (sin `_dirty`/`_deleted`,
 * fuera de `SYNCABLE_TABLES`): es configuración de dispositivo, no datos de fitness.
 */
export function createLocalPreferencesRepository(db: SqlExecutor) {
  return {
    /**
     * Lee todas las preferencias en `user_preferences` y las funde sobre
     * `DEFAULT_PREFERENCES` — claves nunca escritas (primer arranque, o
     * añadidas en una versión posterior) caen al valor por defecto.
     */
    async getAll(): Promise<UserPreferences> {
      // GLOB (no LIKE) porque `_` es comodín de un carácter en LIKE y el
      // prefijo lo lleva de forma literal — con LIKE, "Xephemeral:foo"
      // también se colaría como excluido.
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        `SELECT key, value FROM user_preferences WHERE key NOT GLOB '${EPHEMERAL_KEY_PREFIX}*'`
      );
      const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
      return { ...DEFAULT_PREFERENCES, ...stored } as UserPreferences;
    },

    /** Escribe una única preferencia (upsert por `key`). No encola `pending_ops` — tabla fuera de sync. */
    async set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): Promise<void> {
      await db.runAsync(
        `INSERT INTO user_preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)]
      );
    },

    /** Escribe varias preferencias en una sola transacción (upsert por `key` cada una). */
    async setMany(partial: Partial<UserPreferences>): Promise<void> {
      await db.withTransactionAsync(async () => {
        for (const [key, value] of Object.entries(partial)) {
          await db.runAsync(
            `INSERT INTO user_preferences (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [key, JSON.stringify(value)]
          );
        }
      });
    },

    /**
     * Lee una entrada arbitraria de `user_preferences` fuera del tipado de
     * `UserPreferences` — para estado efímero de dispositivo (p.ej. el
     * cronómetro de un entrenamiento activo) que necesita sobrevivir a que la
     * app muera, pero que no es una preferencia de usuario real. La `key`
     * debe empezar por {@link EPHEMERAL_KEY_PREFIX} para que `getAll()` la
     * excluya.
     */
    async getRaw(key: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM user_preferences WHERE key = ?`,
        [key]
      );
      return row?.value ?? null;
    },

    /** Escribe una entrada arbitraria (ver {@link getRaw}). */
    async setRaw(key: string, value: string): Promise<void> {
      await db.runAsync(
        `INSERT INTO user_preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      );
    },

    /** Borra una entrada arbitraria (ver {@link getRaw}). No falla si no existía. */
    async deleteRaw(key: string): Promise<void> {
      await db.runAsync(`DELETE FROM user_preferences WHERE key = ?`, [key]);
    },
  };
}

/** Tipo del repositorio devuelto por {@link createLocalPreferencesRepository}. */
export type LocalPreferencesRepository = ReturnType<typeof createLocalPreferencesRepository>;
