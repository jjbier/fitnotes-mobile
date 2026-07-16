/**
 * Decorador de `SqlExecutor` que serializa llamadas concurrentes — necesario
 * porque SQLite (vía expo-sqlite) no soporta transacciones solapadas; sin
 * esto, escrituras disparadas en ráfaga desde la UI (p. ej. cada pulsación)
 * pueden perderse en silencio. Ver comentario de `serializeExecutor` abajo
 * para el detalle del mecanismo de cola.
 */
import type { SqlExecutor } from "./sqlExecutor.js";

/**
 * Wraps a SqlExecutor so every call runs strictly one at a time, in call
 * order — never overlapping. Without this, two fire-and-forget writes issued
 * close together (e.g. onChangeText firing on every keystroke, neither call
 * awaited by the caller) can race: the second `withTransactionAsync` starts
 * its BEGIN before the first commits, SQLite throws "cannot start a
 * transaction within a transaction", and the write is lost silently since
 * nothing in the UI awaits or catches these calls.
 */
export function serializeExecutor(inner: SqlExecutor): SqlExecutor {
  let chain: Promise<unknown> = Promise.resolve();
  // >0 while running inside an already-serialized withTransactionAsync callback —
  // calls made in that window must bypass the queue (they'd otherwise wait on
  // themselves and deadlock, since the outer transaction call still holds the chain).
  let activeDepth = 0;

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (activeDepth > 0) return fn();
    const result = chain.then(fn, fn);
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    execAsync: (sql) => enqueue(() => inner.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => inner.runAsync(sql, params)),
    getAllAsync: (sql, params) => enqueue(() => inner.getAllAsync(sql, params)),
    getFirstAsync: (sql, params) => enqueue(() => inner.getFirstAsync(sql, params)),
    withTransactionAsync: (fn) =>
      enqueue(() =>
        inner.withTransactionAsync(async () => {
          activeDepth++;
          try {
            await fn();
          } finally {
            activeDepth--;
          }
        })
      ),
  };
}
