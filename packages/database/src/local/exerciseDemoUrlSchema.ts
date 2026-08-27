/**
 * Añade `demo_url` a `exercises` (migración incremental — la tabla ya existe
 * en instalaciones previas a la versión 5, así que se usa ALTER TABLE en vez
 * de tocar el CREATE TABLE original de `schema.ts`, ver nota en `migrations.ts`).
 */
export const EXERCISE_DEMO_URL_SCHEMA_STATEMENTS: string[] = [
  `ALTER TABLE exercises ADD COLUMN demo_url TEXT`,
];
