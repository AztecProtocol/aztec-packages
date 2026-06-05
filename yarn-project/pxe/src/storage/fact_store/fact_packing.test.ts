import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import {
  ACTIVE_ENTITIES_MAX_FIELDS,
  FACT_MAX_ACTIVE_ENTITIES,
  FACT_MAX_FACTS,
  FACT_MAX_PAYLOAD,
  FACT_SET_MAX_FIELDS,
  packActiveEntities,
  packFactSet,
} from './fact_packing.js';
import { StoredFact } from './stored_fact.js';

/** Strips the trailing zero padding so a packed array can be compared against its meaningful prefix. */
const unpadded = (packed: Fr[]): bigint[] => {
  const values = packed.map(f => f.toBigInt());
  let end = values.length;
  while (end > 0 && values[end - 1] === 0n) {
    end--;
  }
  return values.slice(0, end);
};

describe('packFactSet', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const CORR = new Fr(0xaan);

  const makeFact = (factTypeId: bigint, payload: bigint[]) =>
    new StoredFact(
      contract,
      scope,
      ENTITY,
      CORR,
      new Fr(factTypeId),
      payload.map(p => new Fr(p)),
      undefined,
    );

  // This concrete vector pins the wire encoding so the Noir `unpack` can match it exactly. Do not change without
  // updating noir-projects/aztec-nr/aztec/src/oracle/fact_store.nr.
  it('packs the pinned example [count, (factTypeId, payloadLen, ...payload) per fact], padded to the fixed size', () => {
    const facts = [makeFact(1n, [9n]), makeFact(2n, [])];

    const packed = packFactSet(facts);

    expect(packed).toHaveLength(FACT_SET_MAX_FIELDS);
    expect(unpadded(packed)).toEqual([2n, 1n, 1n, 9n, 2n]); // [2, 1, 1, 9, 2, 0] with the trailing 0 + padding stripped
  });

  it('packs an empty fact set as a single zero count (all padding)', () => {
    const packed = packFactSet([]);
    expect(packed).toHaveLength(FACT_SET_MAX_FIELDS);
    expect(unpadded(packed)).toEqual([]); // count 0, everything padded away
  });

  it('packs multi-field payloads inline after their length', () => {
    const packed = packFactSet([makeFact(5n, [11n, 22n, 33n])]);
    expect(packed).toHaveLength(FACT_SET_MAX_FIELDS);
    expect(unpadded(packed)).toEqual([1n, 5n, 3n, 11n, 22n, 33n]);
  });

  it('throws when the fact set exceeds FACT_MAX_FACTS', () => {
    const facts = Array.from({ length: FACT_MAX_FACTS + 1 }, () => makeFact(1n, []));
    expect(() => packFactSet(facts)).toThrow('exceeding FACT_MAX_FACTS');
  });

  it('throws when a payload exceeds FACT_MAX_PAYLOAD', () => {
    const facts = [
      makeFact(
        1n,
        Array.from({ length: FACT_MAX_PAYLOAD + 1 }, (_, i) => BigInt(i)),
      ),
    ];
    expect(() => packFactSet(facts)).toThrow('exceeds FACT_MAX_PAYLOAD');
  });
});

describe('packActiveEntities', () => {
  it('packs correlation keys as [count, ...keys] padded to the fixed size', () => {
    const packed = packActiveEntities([new Fr(0xaan), new Fr(0xbbn)]);
    expect(packed).toHaveLength(ACTIVE_ENTITIES_MAX_FIELDS);
    expect(unpadded(packed)).toEqual([2n, 0xaan, 0xbbn]);
  });

  it('packs an empty set as a single zero count', () => {
    expect(unpadded(packActiveEntities([]))).toEqual([]);
  });

  it('throws when the set exceeds FACT_MAX_ACTIVE_ENTITIES', () => {
    const keys = Array.from({ length: FACT_MAX_ACTIVE_ENTITIES + 1 }, (_, i) => new Fr(i + 1));
    expect(() => packActiveEntities(keys)).toThrow('exceeding FACT_MAX_ACTIVE_ENTITIES');
  });
});
