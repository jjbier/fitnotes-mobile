import type { SqlExecutor } from "../local/sqlExecutor.js";
import { SYNCABLE_TABLES } from "../local/schema.js";

interface ClaimGuestDataOptions {
  guestUserId: string;
  realUserId: string;
}

/**
 * Vincula los datos creados en modo invitado a una cuenta real recién creada
 * o iniciada — reescribe `user_id` (invitado → real) en todas las tablas
 * sincronizables y en los payloads ya encolados en `pending_ops`, para que el
 * siguiente push suba filas que Supabase (RLS + FK a auth.users) pueda aceptar.
 *
 * Todo en una única transacción: si se interrumpe a mitad, no se aplica nada
 * y puede reintentarse sin efectos duplicados (es puro UPDATE, no INSERT).
 */
export async function claimGuestIdentity(
  db: SqlExecutor,
  { guestUserId, realUserId }: ClaimGuestDataOptions
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of SYNCABLE_TABLES) {
      await db.runAsync(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`, [realUserId, guestUserId]);
    }

    const pendingOps = await db.getAllAsync<{ id: number; payload: string | null }>(
      `SELECT id, payload FROM pending_ops`
    );
    for (const op of pendingOps) {
      if (!op.payload) continue;
      const data = JSON.parse(op.payload) as Record<string, unknown>;
      if (data.user_id !== guestUserId) continue;
      data.user_id = realUserId;
      await db.runAsync(`UPDATE pending_ops SET payload = ? WHERE id = ?`, [JSON.stringify(data), op.id]);
    }
  });
}
