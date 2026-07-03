import type { SqlExecutor } from "./sqlExecutor.js";
import { LOCAL_SCHEMA_STATEMENTS } from "./schema.js";
import { PENDING_OPS_SCHEMA_STATEMENTS } from "./pendingOpsSchema.js";
import { WATERMARKS_SCHEMA_STATEMENTS } from "./watermarksSchema.js";
import { LOCAL_IDENTITY_SCHEMA_STATEMENTS } from "./localIdentitySchema.js";
import { LOCAL_PREFERENCES_SCHEMA_STATEMENTS } from "./localPreferencesSchema.js";

interface LocalMigration {
  version: number;
  statements: string[];
}

/**
 * Migraciones versionadas de la base local, aplicadas vía PRAGMA user_version
 * (equivalente in-app al histórico numerado de packages/database/src/supabase/migrations).
 * Añadir SIEMPRE una entrada nueva al final para cambios futuros — nunca editar
 * una entrada ya publicada, o las instalaciones existentes no la aplicarán.
 */
const MIGRATIONS: LocalMigration[] = [
  {
    version: 1,
    statements: [
      ...LOCAL_SCHEMA_STATEMENTS,
      ...PENDING_OPS_SCHEMA_STATEMENTS,
      ...WATERMARKS_SCHEMA_STATEMENTS,
    ],
  },
  {
    version: 2,
    statements: [...LOCAL_IDENTITY_SCHEMA_STATEMENTS],
  },
  {
    version: 3,
    statements: [...LOCAL_PREFERENCES_SCHEMA_STATEMENTS],
  },
];

export async function runLocalMigrations(db: SqlExecutor): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = row?.user_version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}
