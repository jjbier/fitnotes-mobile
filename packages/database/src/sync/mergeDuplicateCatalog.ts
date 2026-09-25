import type { SqlExecutor } from "../local/sqlExecutor.js";
import { enqueuePendingOp } from "../local/pendingOps.js";
import { nowIso } from "../local/repositories/shared.js";
import type { SyncableTable } from "../local/schema.js";

/** Cuántas filas duplicadas se colapsaron por tabla, devuelto por {@link mergeDuplicateCatalogEntries}. */
export interface MergeDuplicateCatalogResult {
  mergedCategories: number;
  mergedExercises: number;
  mergedBodyMeasurements: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

interface DatedRow {
  id: string;
  created_at: string;
}

/** Agrupa filas por clave normalizada; solo devuelve grupos con más de una fila (los duplicados reales). */
function groupDuplicates<T extends DatedRow>(rows: T[], keyOf: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

/** Ordena un grupo de duplicados por `created_at` asc (empate por `id` asc) — el primero es la fila canónica que sobrevive. */
function sortByAge<T extends DatedRow>(group: T[]): T[] {
  return group.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * Colapsa duplicados de "catálogo" (categorías, ejercicios, tipos de medida
 * corporal) creados de forma independiente en dos dispositivos en modo
 * invitado antes de vincularse a la misma cuenta real — p.ej. el catálogo por
 * defecto de ejercicios (importado a mano desde Settings) o las medidas
 * "Peso corporal"/"Grasa corporal" (auto-sembradas por
 * `seedDefaultMeasurementsIfNeeded`) creadas en ambos dispositivos, cada uno
 * con sus propios UUIDs — tras el claim+sync de los dos, conviven como filas
 * separadas con el mismo nombre. Pensada para ejecutarse justo después de
 * `claimGuestIdentity` + el `sync()` que le sigue (`_layout.tsx`), con la DB
 * local ya conteniendo tanto lo recién reclamado como lo que hubiera remoto
 * de un claim anterior en otro dispositivo — es el único momento en que un
 * dispositivo tiene visibilidad completa de ambos orígenes a la vez.
 *
 * Deliberadamente NO toca `workouts`/`routines`/`sets`, etc.: dos
 * entrenamientos o rutinas con el mismo nombre creados en dispositivos
 * distintos no son necesariamente el mismo dato — fusionarlos a ciegas
 * podría borrar historial real. Solo se fusiona lo que la propia app puede
 * crear de forma determinista con el mismo nombre en dos sitios (el catálogo
 * por defecto, las medidas por defecto) o que el usuario casi nunca querría
 * ver duplicado en un selector (categorías/ejercicios en general, por nombre
 * exacto case-insensitive).
 *
 * Para cada grupo de filas vivas con el mismo nombre normalizado, se queda
 * con la más antigua (`created_at` asc, `id` asc como desempate) como
 * canónica, reescribe las FKs que apuntaban a las demás, y tombstona las
 * duplicadas — mismo patrón de cascada manual que `deleteCategory`/
 * `deleteExercise` (`localExerciseRepository.ts`): un `pending_op` por fila
 * afectada, todo en una única transacción.
 */
export async function mergeDuplicateCatalogEntries(
  db: SqlExecutor,
  userId: string
): Promise<MergeDuplicateCatalogResult> {
  const ts = nowIso();
  let mergedCategories = 0;
  let mergedExercises = 0;
  let mergedBodyMeasurements = 0;

  await db.withTransactionAsync(async () => {
    // ─── Categories ──────────────────────────────────────────────────────
    const categories = await db.getAllAsync<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM categories WHERE user_id = ? AND _deleted = 0`,
      [userId]
    );
    for (const group of groupDuplicates(categories, (c) => normalizeName(c.name))) {
      const [canonical, ...duplicates] = sortByAge(group);
      for (const dup of duplicates) {
        const affectedExercises = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM exercises WHERE category_id = ?`,
          [dup.id]
        );
        for (const ex of affectedExercises) {
          await db.runAsync(`UPDATE exercises SET category_id = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
            canonical!.id,
            ts,
            ex.id,
          ]);
          await enqueuePendingOp(db, "exercises", ex.id, "update", { category_id: canonical!.id, updated_at: ts });
        }
        await db.runAsync(`UPDATE categories SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, dup.id]);
        await enqueuePendingOp(db, "categories", dup.id, "delete", null);
        mergedCategories++;
      }
    }

    // ─── Exercises (leídas después de canonicalizar categorías) ──────────
    const exercises = await db.getAllAsync<{ id: string; category_id: string | null; name: string; created_at: string }>(
      `SELECT id, category_id, name, created_at FROM exercises WHERE user_id = ? AND _deleted = 0`,
      [userId]
    );
    const referencingTables: SyncableTable[] = ["workout_exercises", "routine_day_exercises", "personal_records", "exercise_goals"];
    for (const group of groupDuplicates(exercises, (e) => `${e.category_id ?? ""}::${normalizeName(e.name)}`)) {
      const [canonical, ...duplicates] = sortByAge(group);
      for (const dup of duplicates) {
        for (const table of referencingTables) {
          const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE exercise_id = ?`, [dup.id]);
          for (const row of rows) {
            await db.runAsync(`UPDATE ${table} SET exercise_id = ?, updated_at = ?, _dirty = 1 WHERE id = ?`, [
              canonical!.id,
              ts,
              row.id,
            ]);
            await enqueuePendingOp(db, table, row.id, "update", { exercise_id: canonical!.id, updated_at: ts });
          }
        }
        await db.runAsync(`UPDATE exercises SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, dup.id]);
        await enqueuePendingOp(db, "exercises", dup.id, "delete", null);
        mergedExercises++;
      }
    }

    // ─── Body measurements ─────────────────────────────────────────────────
    const measurements = await db.getAllAsync<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM body_measurements WHERE user_id = ? AND _deleted = 0`,
      [userId]
    );
    for (const group of groupDuplicates(measurements, (m) => normalizeName(m.name))) {
      const [canonical, ...duplicates] = sortByAge(group);
      for (const dup of duplicates) {
        const entries = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM body_measurement_entries WHERE measurement_id = ?`,
          [dup.id]
        );
        for (const entry of entries) {
          await db.runAsync(
            `UPDATE body_measurement_entries SET measurement_id = ?, updated_at = ?, _dirty = 1 WHERE id = ?`,
            [canonical!.id, ts, entry.id]
          );
          await enqueuePendingOp(db, "body_measurement_entries", entry.id, "update", {
            measurement_id: canonical!.id,
            updated_at: ts,
          });
        }
        await db.runAsync(`UPDATE body_measurements SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?`, [ts, dup.id]);
        await enqueuePendingOp(db, "body_measurements", dup.id, "delete", null);
        mergedBodyMeasurements++;
      }
    }
  });

  return { mergedCategories, mergedExercises, mergedBodyMeasurements };
}
