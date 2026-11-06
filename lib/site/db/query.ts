/**
 * A small query builder with the supabase-js call shape this app uses
 * (`from().select().eq()…`, resolving to `{ data, error, status, count }`).
 * It only describes the query; an executor runs it: PostgreSQL in production
 * (`postgres.ts`) or the in-memory tables used by tests.
 */
export type Row = Record<string, unknown>;

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is";

export type QuerySpec = Readonly<{
  action: "select" | "insert" | "update" | "delete";
  table: string;
  /** Selected columns, or the RETURNING list for writes (`null` = no rows back). */
  columns: string | null;
  filters: readonly Readonly<{ column: string; operator: FilterOperator; value: unknown }>[];
  order: readonly Readonly<{ column: string; ascending: boolean }>[];
  limit: number | null;
  values: readonly Row[];
  count: boolean;
  head: boolean;
}>;

export type ExecutorResult = Readonly<{ rows: Row[]; count: number | null }>;
export type QueryExecutor = (spec: QuerySpec) => Promise<ExecutorResult>;

export type DbError = Readonly<{ message: string; code?: string }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export type DbResult<T> = Readonly<{
  data: T | null;
  error: DbError | null;
  status: number;
  count: number | null;
}>;

/** Thrown by executors so a failure keeps its HTTP-like status (404 = missing table). */
export class DbExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const SUCCESS_STATUS = { delete: 204, insert: 201, select: 200, update: 200 } as const;

export class Query<T = AnyRow[]> implements PromiseLike<DbResult<T>> {
  private action: QuerySpec["action"] = "select";
  private columns: string | null = "*";
  private filters: QuerySpec["filters"][number][] = [];
  private orderBy: QuerySpec["order"][number][] = [];
  private limitCount: number | null = null;
  private values: Row[] = [];
  private wantsCount = false;
  private headOnly = false;
  private mode: "many" | "maybe" = "many";

  constructor(
    private readonly table: string,
    private readonly execute: QueryExecutor,
    private readonly timeoutMs: number,
  ) {}

  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}) {
    this.columns = columns;
    this.wantsCount = options.count === "exact";
    this.headOnly = options.head === true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.action = "insert";
    this.columns = null;
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.columns = null;
    this.values = [values];
    return this;
  }

  delete() {
    this.action = "delete";
    this.columns = null;
    return this;
  }

  private filter(column: string, operator: FilterOperator, value: unknown) {
    this.filters.push({ column, operator, value });
    return this;
  }

  eq(column: string, value: unknown) { return this.filter(column, "eq", value); }
  neq(column: string, value: unknown) { return this.filter(column, "neq", value); }
  gt(column: string, value: unknown) { return this.filter(column, "gt", value); }
  gte(column: string, value: unknown) { return this.filter(column, "gte", value); }
  lt(column: string, value: unknown) { return this.filter(column, "lt", value); }
  lte(column: string, value: unknown) { return this.filter(column, "lte", value); }
  is(column: string, value: null | boolean) { return this.filter(column, "is", value); }

  match(values: Row) {
    for (const [column, value] of Object.entries(values)) this.eq(column, value);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy.push({ ascending: options.ascending !== false, column });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle<R = AnyRow>() {
    this.mode = "maybe";
    return this as unknown as Query<R>;
  }

  private async run(): Promise<DbResult<T>> {
    const spec: QuerySpec = {
      action: this.action,
      columns: this.columns,
      count: this.wantsCount,
      filters: this.filters,
      head: this.headOnly,
      limit: this.limitCount,
      order: this.orderBy,
      table: this.table,
      values: this.values,
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DbExecutionError(`Hết thời gian chờ database (${this.timeoutMs}ms).`, 0, "TIMEOUT")),
          this.timeoutMs,
        );
      });
      const { count, rows } = await Promise.race([this.execute(spec), timeout]);
      const status = SUCCESS_STATUS[this.action];
      if (this.columns === null || this.headOnly) return { count, data: null, error: null, status };
      if (this.mode === "many") return { count, data: rows as T, error: null, status };
      if (rows.length > 1)
        return { count, data: null, error: { code: "PGRST116", message: `Kết quả có ${rows.length} dòng, cần nhiều nhất 1.` }, status: 406 };
      return { count, data: (rows[0] ?? null) as T, error: null, status };
    } catch (error) {
      const failure = error instanceof DbExecutionError ? error : new DbExecutionError(String((error as Error)?.message ?? error), 500);
      return { count: null, data: null, error: { code: failure.code, message: failure.message }, status: failure.status };
    } finally {
      clearTimeout(timer);
    }
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}
