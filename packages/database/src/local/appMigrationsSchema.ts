/**
 * Marcador de reparaciones/migraciones de datos de un solo uso (a diferencia
 * de `migrations.ts`, que versiona el ESQUEMA vía `PRAGMA user_version` con
 * SQL puro). Cada fila es un id de reparación ya aplicada — usado por código
 * JS que necesita ejecutarse una única vez por dispositivo (p.ej. recalcular
 * datos que quedaron mal por un bug ya corregido), disparado desde
 * `RepositoryContext` tras arrancar la DB.
 */
export const APP_MIGRATIONS_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS app_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
];
