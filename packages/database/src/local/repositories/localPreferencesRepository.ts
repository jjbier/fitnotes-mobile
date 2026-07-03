import { DEFAULT_PREFERENCES, type UserPreferences } from "@fitnotes/core";
import type { SqlExecutor } from "../sqlExecutor.js";

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
    async getAll(): Promise<UserPreferences> {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        `SELECT key, value FROM user_preferences`
      );
      const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
      return { ...DEFAULT_PREFERENCES, ...stored } as UserPreferences;
    },

    async set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): Promise<void> {
      await db.runAsync(
        `INSERT INTO user_preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, JSON.stringify(value)]
      );
    },

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
  };
}

export type LocalPreferencesRepository = ReturnType<typeof createLocalPreferencesRepository>;
