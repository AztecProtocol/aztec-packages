import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { packFactSet } from './fact_packing.js';
import { StoredFact } from './stored_fact.js';

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
  it('packs the pinned example [count, (factTypeId, payloadLen, ...payload) per fact]', () => {
    const facts = [makeFact(1n, [9n]), makeFact(2n, [])];

    const packed = packFactSet(facts).map(f => f.toBigInt());

    expect(packed).toEqual([2n, 1n, 1n, 9n, 2n, 0n]);
  });

  it('packs an empty fact set as a single zero count', () => {
    expect(packFactSet([]).map(f => f.toBigInt())).toEqual([0n]);
  });

  it('packs multi-field payloads inline after their length', () => {
    const facts = [makeFact(5n, [11n, 22n, 33n])];

    expect(packFactSet(facts).map(f => f.toBigInt())).toEqual([1n, 5n, 3n, 11n, 22n, 33n]);
  });
});
