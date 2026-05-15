/**
 * A canonicality coordinate: the L2 chain position whose processing produced an anchored row.
 *
 * `blockHash` is the hex-string representation of the L2 block hash, consistent with how block
 * hashes already appear in PXE value types (e.g. `NoteDao.l2BlockHash`). The conceptual cross-layer
 * `Anchor` shape lives in the spec; this is its TypeScript form.
 */
export type Anchor = {
  /** L2 block number of the producing block. */
  blockNumber: number;
  /** L2 block hash (hex string) of the producing block. */
  blockHash: string;
};

/** A row that carries the chain position that produced it, under the `anchor` field. */
export type Anchored<T> = T & { anchor: Anchor };

/** Tag a row with the chain position that produced it. Returns a new object; does not mutate `row`. */
export function anchored<T extends object>(row: T, anchor: Anchor): Anchored<T> {
  return { ...row, anchor };
}

/**
 * Marker for rows that have no L2 birth block (capsules, offchain-delivered content, user state).
 * Such rows are unconditionally visible and survive reorgs. Returns the row unchanged; exists so
 * write sites read symmetrically with {@link anchored}.
 */
export function unanchored<T>(row: T): T {
  return row;
}
