/**
 * Lectura/escritura de la identidad local singleton (`local_identity`) — quién
 * es el usuario activo en este dispositivo (invitado o cuenta real) y si el
 * SyncEngine debe intentar sincronizar. No hace cascadas ni encola pending_ops:
 * es metadato de dispositivo, no una tabla sincronizable.
 */
import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "./sqlExecutor.js";
import { nowIso, type RawRow } from "./repositories/shared.js";

/**
 * Identidad activa resuelta: `user_id` de escritura y si es invitado o cuenta
 * real vinculada. `wasRealAccount` distingue un invitado genuino (nunca
 * vinculado a ninguna cuenta) de una cuenta real "dormida" — vinculada antes,
 * ahora con `isGuest=true` tras un sign-out que conserva sus datos en local
 * (ver `setActiveIdentity` más abajo) — para decidir con seguridad, si más
 * tarde se inicia sesión con una cuenta DISTINTA, si es correcto fusionar los
 * datos locales como los de un invitado nuevo o si hay que vaciarlos antes
 * (nunca mezclar el historial de dos cuentas reales distintas).
 */
export interface LocalIdentity {
  activeUserId: string;
  isGuest: boolean;
  wasRealAccount: boolean;
}

function mapIdentityRow(row: RawRow): LocalIdentity {
  return {
    activeUserId: row.active_user_id as string,
    isGuest: row.is_guest === 1,
    wasRealAccount: row.was_real_account === 1,
  };
}

/**
 * Devuelve la identidad local del dispositivo, creando una identidad de
 * invitado (UUID generado en el dispositivo) si es el primer arranque.
 * Idempotente — llamadas posteriores devuelven siempre la misma fila.
 */
export async function getOrCreateLocalIdentity(db: SqlExecutor): Promise<LocalIdentity> {
  const existing = await db.getFirstAsync<RawRow>(`SELECT * FROM local_identity WHERE id = 1`);
  if (existing) return mapIdentityRow(existing);

  const guestUserId = generateUUID();
  await db.runAsync(
    `INSERT INTO local_identity (id, active_user_id, is_guest, was_real_account, created_at) VALUES (1, ?, 1, 0, ?)`,
    [guestUserId, nowIso()]
  );
  return { activeUserId: guestUserId, isGuest: true, wasRealAccount: false };
}

/**
 * Actualiza la identidad activa del dispositivo — usado tras un claim
 * (invitado → cuenta real), un sign-out "suave" (cuenta real → dormida, mismo
 * `activeUserId`, datos intactos) o un wipe (cuenta real → invitado nuevo).
 *
 * `was_real_account` solo se fuerza a 1 cuando `isGuest` pasa a `false`
 * (identidad vinculada a una cuenta real, ahora o de nuevo) — nunca se
 * resetea a 0 al pasar a `isGuest=true`, para que un sign-out "suave" siga
 * marcado como "fue una cuenta real" y así impida más tarde una fusión
 * insegura con una cuenta distinta (ver `LocalIdentity`).
 */
export async function setActiveIdentity(
  db: SqlExecutor,
  identity: Pick<LocalIdentity, "activeUserId" | "isGuest">
): Promise<void> {
  await db.runAsync(
    `UPDATE local_identity
     SET active_user_id = ?,
         is_guest = ?,
         was_real_account = CASE WHEN ? = 0 THEN 1 ELSE was_real_account END
     WHERE id = 1`,
    [identity.activeUserId, identity.isGuest ? 1 : 0, identity.isGuest ? 1 : 0]
  );
}
