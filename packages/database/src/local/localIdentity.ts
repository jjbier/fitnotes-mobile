import { generateUUID } from "@fitnotes/core";
import type { SqlExecutor } from "./sqlExecutor.js";
import { nowIso, type RawRow } from "./repositories/shared.js";

export interface LocalIdentity {
  activeUserId: string;
  isGuest: boolean;
}

function mapIdentityRow(row: RawRow): LocalIdentity {
  return {
    activeUserId: row.active_user_id as string,
    isGuest: row.is_guest === 1,
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
    `INSERT INTO local_identity (id, active_user_id, is_guest, created_at) VALUES (1, ?, 1, ?)`,
    [guestUserId, nowIso()]
  );
  return { activeUserId: guestUserId, isGuest: true };
}

/**
 * Actualiza la identidad activa del dispositivo — usado tras un claim
 * (invitado → cuenta real) o un sign-out (cuenta real → nuevo invitado).
 */
export async function setActiveIdentity(
  db: SqlExecutor,
  identity: LocalIdentity
): Promise<void> {
  await db.runAsync(`UPDATE local_identity SET active_user_id = ?, is_guest = ? WHERE id = 1`, [
    identity.activeUserId,
    identity.isGuest ? 1 : 0,
  ]);
}
