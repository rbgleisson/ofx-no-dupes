const PAGE_SIZE = 1000;

interface QueryResult<T> {
  data: T[] | null;
  error: unknown;
}

interface PaginatedQuery<T> {
  order(column: string, options?: { ascending?: boolean }): PaginatedQuery<T>;
  range(from: number, to: number): PromiseLike<QueryResult<T>>;
}

export async function fetchAllRows<T>(
  buildQuery: () => PaginatedQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}