/**
 * Abstraction over a local SQL database connection, modeled closely on
 * expo-sqlite's async API (execAsync/runAsync/getAllAsync/getFirstAsync/
 * withTransactionAsync) so the mobile adapter is a near passthrough.
 * Local repositories depend on this interface, not on expo-sqlite directly,
 * so Vitest can substitute a Node driver (see local/testing/nodeSqlExecutor.ts).
 */
export interface SqlRunResult {
  changes: number;
  lastInsertRowId?: number;
}

export interface SqlExecutor {
  /** Run one or more statements (separated by `;`) with no bound params. */
  execAsync(sql: string): Promise<void>;
  /** Run a single statement with bound params; returns affected-row info. */
  runAsync(sql: string, params?: unknown[]): Promise<SqlRunResult>;
  /** Run a SELECT and return all matching rows. */
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run a SELECT and return the first matching row, or null. */
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Run `fn` inside a transaction; rolls back if `fn` throws. */
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}
