import type { Origin } from './origin.js';

/**
 * The capability a store needs to decide row visibility: a synchronous, in-memory predicate testing whether an
 * origin still belongs to the canonical chain. Synchronous by design — callers invoke it inside the await-free tail
 * of a KV read transaction, where issuing a DB read would let IndexedDB auto-commit the transaction.
 */
export interface CanonicalityCheck {
  isCanonical(origin: Origin): boolean;
}
