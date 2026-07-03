export function nowIso(): string {
  return new Date().toISOString();
}

export function toBool(v: unknown): boolean {
  return v === 1 || v === true;
}

export function fromBool(v: boolean | undefined): number {
  return v ? 1 : 0;
}

/** Fila SQLite cruda (booleans como 0/1, más columnas de control _dirty/_deleted). */
export interface RawRow {
  [key: string]: unknown;
}

export interface RepoError {
  message: string;
}
