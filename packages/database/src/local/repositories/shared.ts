/**
 * Utilidades compartidas por todos los repos locales: timestamp ISO
 * consistente para `created_at`/`updated_at`, conversión bool↔INTEGER
 * (SQLite no tiene tipo boolean nativo) y los tipos base de fila/error
 * usados en las firmas `{ data, error }` que espejan los repos remotos.
 */

/** Timestamp actual en formato ISO 8601, usado para `created_at`/`updated_at` en cada escritura. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Convierte el valor crudo de una columna SQLite (0/1) a boolean JS. */
export function toBool(v: unknown): boolean {
  return v === 1 || v === true;
}

/** Convierte un boolean JS al INTEGER (0/1) que espera una columna SQLite. */
export function fromBool(v: boolean | undefined): number {
  return v ? 1 : 0;
}

/** Fila SQLite cruda (booleans como 0/1, más columnas de control _dirty/_deleted). */
export interface RawRow {
  [key: string]: unknown;
}

/** Forma de error usada en el shape `{ data, error }` — espeja `PostgrestError` del cliente remoto sin acoplarse a Supabase. */
export interface RepoError {
  message: string;
}
