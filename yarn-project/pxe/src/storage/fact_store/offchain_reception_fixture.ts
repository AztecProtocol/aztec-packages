import { Fr } from '@aztec/foundation/curves/bn254';

import type { StoredFact } from './fact_store.js';

// MUST match fact_store_fixture_contract/src/main.nr.
export const MAX_FACTS = 8;
export const MAX_PAYLOAD = 8;

export const OFFCHAIN_ENTITY_TYPE_ID = new Fr(1n);
export const FACT_TX_CONFIRMED = new Fr(1n);
export const FACT_DISCOVERED = new Fr(2n);
export const FACT_FINALIZED = new Fr(3n);
export const FACT_EXPIRED = new Fr(4n);
export const FACT_DELIVERED = new Fr(5n);

export type ReceptionState = 'AWAITING_TX' | 'EXPIRED' | 'CONFIRMED' | 'DISCOVERED' | 'FINALIZED';

const STATE_BY_CODE: Record<number, ReceptionState> = {
  0: 'AWAITING_TX',
  1: 'EXPIRED',
  2: 'CONFIRMED',
  3: 'DISCOVERED',
  4: 'FINALIZED',
};

export function receptionStateFromCode(code: number): ReceptionState {
  const state = STATE_BY_CODE[code];
  if (!state) {
    throw new Error(`Unknown reception state code: ${code}`);
  }
  return state;
}

export type PackedFact = { fact_type_id: Fr; payload: Fr[] };

/** Pack a canonical fact set into the fixed `[PackedFact; MAX_FACTS]` the Noir fold expects. */
export function packFacts(facts: StoredFact[]): PackedFact[] {
  if (facts.length > MAX_FACTS) {
    throw new Error(`Fact set of ${facts.length} exceeds fixture cap ${MAX_FACTS}`);
  }
  // eslint-disable-next-line camelcase
  const packed = facts.map(f => ({ fact_type_id: f.factType, payload: payloadToFields(f.payload) }));
  while (packed.length < MAX_FACTS) {
    // eslint-disable-next-line camelcase
    packed.push({ fact_type_id: Fr.ZERO, payload: zeroPayload() });
  }
  return packed;
}

function payloadToFields(payload: Buffer): Fr[] {
  const fields: Fr[] = [];
  for (let i = 0; i < MAX_PAYLOAD; i++) {
    const chunk = payload.subarray(i * 32, i * 32 + 32);
    fields.push(chunk.length ? Fr.fromBuffer(Buffer.concat([Buffer.alloc(32 - chunk.length), chunk])) : Fr.ZERO);
  }
  return fields;
}

function zeroPayload(): Fr[] {
  return Array.from({ length: MAX_PAYLOAD }, () => Fr.ZERO);
}
