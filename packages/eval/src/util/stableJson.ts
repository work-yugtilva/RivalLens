// Deterministic JSON: recursively key-sorted, 2-space indented, trailing newline.
// Used for every committed / written artifact so re-runs are byte-identical.
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, sortDeep(nested)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

export function stableJsonl(rows: readonly unknown[]): string {
  if (rows.length === 0) return '';
  return `${rows.map((row) => JSON.stringify(sortDeep(row))).join('\n')}\n`;
}
