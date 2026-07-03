import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";
import type { SyncableTable } from "../local/schema.js";

const PAGE_SIZE = 500;

/**
 * Descarga todas las filas de `table` para `userId` con updated_at posterior
 * a `since` (paginado). A diferencia del pull anterior (solo contaba filas),
 * esto trae los datos reales para poder aplicarlos a la base local.
 */
export async function pullTableChanges(
  client: SupabaseClient<Database>,
  table: SyncableTable,
  userId: string,
  since: string | null
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let query = client
      .from(table as never)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1) as unknown as {
      gt: (col: string, val: string) => typeof query;
    } & PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;

    if (since) {
      query = query.gt("updated_at", since) as typeof query;
    }

    const { data, error } = await query;
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
