import { type Anchor, type Anchored } from './anchor.js';

/** The capability filterCanonical needs: the canonicality predicate. */
export type CanonicalityCheck = {
  isCanonical(anchor: Anchor): Promise<boolean>;
};

/**
 * Drop non-canonical rows from a list of anchored rows, preserving input order.
 * Stores apply this to anchored reads so retracted (reorged-out) rows are invisible.
 */
export async function filterCanonical<T>(chain: CanonicalityCheck, rows: Anchored<T>[]): Promise<Anchored<T>[]> {
  const out: Anchored<T>[] = [];
  for (const row of rows) {
    if (await chain.isCanonical(row.anchor)) {
      out.push(row);
    }
  }
  return out;
}
