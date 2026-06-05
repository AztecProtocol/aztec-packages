import { Fr } from '@aztec/foundation/curves/bn254';

import type { StoredFact } from './stored_fact.js';

// These bounds MUST match the constants in noir-projects/aztec-nr/aztec/src/oracle/fact_store.nr. The oracle return
// types there are fixed-size `[Field; N]` arrays, so the packed payloads below are zero-padded to exactly those
// sizes — the ACVM foreign-call boundary reads a fixed field count with no length prefix, and the embedded `count`
// element tells the Noir side how many entries are real.

/** Maximum number of Field elements in a single fact's payload. */
export const FACT_MAX_PAYLOAD = 20;
/** Maximum number of facts that can be returned for a single entity. */
export const FACT_MAX_FACTS = 8;
/** Maximum number of active entities `packActiveEntities` can return. */
export const FACT_MAX_ACTIVE_ENTITIES = 64;
/** Fixed length of a packed fact set: 1 (count) + per fact (factTypeId + payloadLen + payload). */
export const FACT_SET_MAX_FIELDS = 1 + FACT_MAX_FACTS * (2 + FACT_MAX_PAYLOAD);
/** Fixed length of a packed active-entities set: 1 (count) + the correlation keys. */
export const ACTIVE_ENTITIES_MAX_FIELDS = 1 + FACT_MAX_ACTIVE_ENTITIES;

function padTo(fields: Fr[], length: number): Fr[] {
  if (fields.length > length) {
    throw new Error(`Packed fact field count ${fields.length} exceeds the fixed oracle return size ${length}`);
  }
  return [...fields, ...Array.from({ length: length - fields.length }, () => Fr.ZERO)];
}

/**
 * Packs an entity's fact set into a fixed-size, self-describing `Field[]` for return across the oracle boundary.
 *
 * Wire layout (zero-padded to `FACT_SET_MAX_FIELDS`):
 * ```
 * [ count,
 *   for each fact: factTypeId, payloadLen, ...payload,
 *   ...zero padding ]
 * ```
 *
 * @example `[ {factTypeId: 1, payload: [9]}, {factTypeId: 2, payload: []} ]` packs to `[2, 1, 1, 9, 2, 0, ...0]`
 *   (count=2; fact0: type 1, len 1, [9]; fact1: type 2, len 0, []) padded to `FACT_SET_MAX_FIELDS`.
 *
 * WIRE CONTRACT: must match the `unpack` in noir-projects/aztec-nr/aztec/src/oracle/fact_store.nr byte-for-byte.
 * Any change here must be mirrored there.
 */
export function packFactSet(facts: StoredFact[]): Fr[] {
  if (facts.length > FACT_MAX_FACTS) {
    throw new Error(`Entity has ${facts.length} facts, exceeding FACT_MAX_FACTS (${FACT_MAX_FACTS})`);
  }
  const packed: Fr[] = [new Fr(facts.length)];
  for (const fact of facts) {
    if (fact.payload.length > FACT_MAX_PAYLOAD) {
      throw new Error(`Fact payload length ${fact.payload.length} exceeds FACT_MAX_PAYLOAD (${FACT_MAX_PAYLOAD})`);
    }
    packed.push(fact.factTypeId, new Fr(fact.payload.length), ...fact.payload);
  }
  return padTo(packed, FACT_SET_MAX_FIELDS);
}

/**
 * Packs the correlation keys of active entities into a fixed-size, count-prefixed `Field[]`.
 *
 * Wire layout (zero-padded to `ACTIVE_ENTITIES_MAX_FIELDS`): `[ count, ...correlationKeys, ...zero padding ]`.
 *
 * WIRE CONTRACT: must match `unpack_active_entities` in noir-projects/aztec-nr/aztec/src/oracle/fact_store.nr.
 */
export function packActiveEntities(correlationKeys: Fr[]): Fr[] {
  if (correlationKeys.length > FACT_MAX_ACTIVE_ENTITIES) {
    throw new Error(
      `Scope has ${correlationKeys.length} active entities, exceeding FACT_MAX_ACTIVE_ENTITIES ` +
        `(${FACT_MAX_ACTIVE_ENTITIES})`,
    );
  }
  return padTo([new Fr(correlationKeys.length), ...correlationKeys], ACTIVE_ENTITIES_MAX_FIELDS);
}
