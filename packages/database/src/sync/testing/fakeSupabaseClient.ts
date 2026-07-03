/**
 * Cliente Supabase falso, en memoria — solo implementa el subconjunto de la
 * API fluida que usa SyncEngine (from/select/insert/update/delete con
 * eq/gt/order/range), para poder testear el motor de sync sin red real.
 * NO usar fuera de tests.
 */
type Row = Record<string, unknown>;
type FakeDb = Record<string, Record<string, Row>>;

class SelectBuilder implements PromiseLike<{ data: Row[]; error: unknown }> {
  private filters: Array<(row: Row) => boolean> = [];
  private orderCol: string | null = null;
  private ascending = true;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
    private failNext: { current: string | null }
  ) {}

  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }

  gt(col: string, val: unknown): this {
    this.filters.push((r) => (r[col] as string) > (val as string));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.ascending = opts?.ascending ?? true;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private resolveRows(): Row[] {
    let rows = Object.values(this.db[this.table] ?? {}).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      const dir = this.ascending ? 1 : -1;
      rows = rows.slice().sort((a, b) => {
        const av = a[col] as string;
        const bv = b[col] as string;
        return av > bv ? dir : av < bv ? -dir : 0;
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    }
    return rows;
  }

  then<TResult1 = { data: Row[]; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null
  ): PromiseLike<TResult1 | TResult2> {
    if (this.failNext.current === this.table) {
      this.failNext.current = null;
      return Promise.resolve({ data: null, error: { message: "simulated failure" } }).then(
        onfulfilled as never
      ) as never;
    }
    return Promise.resolve({ data: this.resolveRows(), error: null }).then(onfulfilled as never) as never;
  }
}

export function createFakeSupabaseClient(seed: FakeDb = {}) {
  const db: FakeDb = JSON.parse(JSON.stringify(seed)) as FakeDb;
  const failNext = { current: null as string | null };

  function from(table: string) {
    db[table] = db[table] ?? {};
    return {
      select() {
        return new SelectBuilder(db, table, failNext);
      },
      insert(data: Row | Row[]) {
        if (failNext.current === table) {
          failNext.current = null;
          return Promise.resolve({ data: null, error: { message: "simulated failure" } });
        }
        const rows = Array.isArray(data) ? data : [data];
        for (const row of rows) db[table]![row.id as string] = { ...row };
        return Promise.resolve({ data: rows, error: null });
      },
      update(patch: Row) {
        return {
          eq(col: string, val: unknown) {
            if (failNext.current === table) {
              failNext.current = null;
              return Promise.resolve({ data: null, error: { message: "simulated failure" } });
            }
            const matches = Object.values(db[table]!).filter((r) => r[col] === val);
            for (const m of matches) Object.assign(m, patch);
            return Promise.resolve({ data: matches, error: null });
          },
        };
      },
      delete() {
        return {
          eq(col: string, val: unknown) {
            const ids = Object.entries(db[table]!)
              .filter(([, r]) => r[col] === val)
              .map(([id]) => id);
            for (const id of ids) delete db[table]![id];
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  }

  return {
    from,
    _db: db,
    _failNextOn(table: string) {
      failNext.current = table;
    },
  };
}
