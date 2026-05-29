/**
 * A canonicality coordinate: the L2 chain position a row originated from.
 *
 * `blockHash` is the hex-string representation of the L2 block hash, consistent with how block
 * hashes already appear in PXE value types (e.g. `NoteDao.l2BlockHash`). The conceptual cross-layer
 * `Origin` shape lives in the spec; this is its TypeScript form.
 */
export type Origin = {
  /** L2 block number of the producing block. */
  blockNumber: number;
  /** L2 block hash (hex string) of the producing block. */
  blockHash: string;
};

/** A row that carries the chain position that produced it, under the `origin` field. */
export type WithOrigin<T> = T & { origin: Origin };

/** Tag a row with the chain position that produced it. Returns a new object; does not mutate `row`. */
export function withOrigin<T extends object>(row: T, origin: Origin): WithOrigin<T> {
  return { ...row, origin };
}

/**
 * Marker for rows that have no L2 birth block (capsules, offchain-delivered content, user state).
 * Such rows are unconditionally visible and survive reorgs. Returns the row unchanged; exists so
 * write sites read symmetrically with {@link withOrigin}.
 */
export function withoutOrigin<T>(row: T): T {
  return row;
}
