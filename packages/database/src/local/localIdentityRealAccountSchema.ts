/**
 * Añade `was_real_account` a `local_identity` (migración incremental — la
 * tabla ya existe desde la v2, así que se usa ALTER TABLE en vez de tocar el
 * CREATE TABLE original de `localIdentitySchema.ts`, ver nota en
 * `migrations.ts`).
 *
 * Distingue un invitado genuino (nunca vinculado a ninguna cuenta) de una
 * cuenta real "dormida" tras un sign-out que conserva sus datos en local con
 * `is_guest=1` (ver `localIdentity.ts`) — sin este flag, iniciar sesión
 * después con una cuenta DISTINTA no podría saber si es seguro fusionar los
 * datos locales como los de un invitado nuevo, o si hay que vaciarlos primero
 * para no mezclar el historial de dos cuentas reales distintas.
 */
export const LOCAL_IDENTITY_REAL_ACCOUNT_SCHEMA_STATEMENTS: string[] = [
  `ALTER TABLE local_identity ADD COLUMN was_real_account INTEGER NOT NULL DEFAULT 0`,
];
