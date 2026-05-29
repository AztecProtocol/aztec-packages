/** The chain location that produced a row: the canonicality coordinate. */
export type Origin = { blockNumber: number; blockHash: string };

/** A row tagged with the origin that produced it. */
export type WithOrigin<T> = T & { origin: Origin };

/** Tag a row with its origin. */
export function withOrigin<T extends object>(row: T, origin: Origin): WithOrigin<T> {
  return { ...row, origin };
}

/** Marker for a row that carries no origin (persists regardless of the canonical chain). */
export function withoutOrigin<T>(row: T): T {
  return row;
}
