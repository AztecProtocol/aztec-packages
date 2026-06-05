import { Fr } from '@aztec/foundation/curves/bn254';

import type { StoredFact } from './stored_fact.js';

/**
 * Packs an entity's fact set into a flat, self-describing `Field[]` for return across the oracle boundary.
 *
 * Wire layout:
 * ```
 * [ count,
 *   for each fact: factTypeId, payloadLen, ...payload ]
 * ```
 * where `count` is the number of facts, and each fact contributes its `factTypeId`, the length of its `payload`,
 * and then the payload fields inline.
 *
 * @example `[ {factTypeId: 1, payload: [9]}, {factTypeId: 2, payload: []} ]` packs to `[2, 1, 1, 9, 2, 0]`
 *   (count=2; fact0: type 1, len 1, [9]; fact1: type 2, len 0, []).
 *
 * WIRE CONTRACT: must match noir-projects/aztec-nr/aztec/src/oracle/fact_store.nr unpack — [count, (factTypeId,
 * payloadLen, ...payload) per fact]. Any change here must be mirrored there byte-for-byte.
 */
export function packFactSet(facts: StoredFact[]): Fr[] {
  const packed: Fr[] = [new Fr(facts.length)];
  for (const fact of facts) {
    packed.push(fact.factTypeId, new Fr(fact.payload.length), ...fact.payload);
  }
  return packed;
}
