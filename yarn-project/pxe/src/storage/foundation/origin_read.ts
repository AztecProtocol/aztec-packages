import type { Origin, WithOrigin } from './origin.js';

/** The capability filterCanonical needs: the canonicality predicate. */
export type CanonicalityCheck = {
  isCanonical(origin: Origin): Promise<boolean>;
};

/**
 * Drop non-canonical rows from a list of rows that carry an origin, preserving input order.
 * Stores apply this to origin-tagged reads so retracted (reorged-out) rows are invisible.
 */
export async function filterCanonical<T>(chain: CanonicalityCheck, rows: WithOrigin<T>[]): Promise<WithOrigin<T>[]> {
  const out: WithOrigin<T>[] = [];
  for (const row of rows) {
    if (await chain.isCanonical(row.origin)) {
      out.push(row);
    }
  }
  return out;
}
