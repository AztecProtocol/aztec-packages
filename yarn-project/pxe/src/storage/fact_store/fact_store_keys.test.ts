import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';

describe('fact store keys', () => {
  const contract = AztecAddress.fromBigIntUnsafe(100n);
  const scope = AztecAddress.fromBigIntUnsafe(1n);
  const type = new Fr(7n);
  const id = new Fr(42n);

  const collectionKey = () =>
    FactCollectionKey.from({ contractAddress: contract, scope, factCollectionTypeId: type, factCollectionId: id });

  it('encodes scope between contract and type in the collection key', () => {
    expect(collectionKey().toString()).toBe(`${contract}:${scope}:${type}:${id}`);
  });

  it('encodes scope in the type key and carries it through factCollectionTypeKey()', () => {
    expect(collectionKey().factCollectionTypeKey().toString()).toBe(`${contract}:${scope}:${type}`);
    expect(
      FactCollectionTypeKey.from({ contractAddress: contract, scope, factCollectionTypeId: type }).toString(),
    ).toBe(`${contract}:${scope}:${type}`);
  });

  it('round-trips a collection key through fromString', () => {
    expect(FactCollectionKey.fromString(collectionKey().toString())).toEqual(collectionKey());
  });

  it('rejects the zero address as scope', () => {
    expect(() =>
      FactCollectionKey.from({
        contractAddress: contract,
        scope: AztecAddress.ZERO,
        factCollectionTypeId: type,
        factCollectionId: id,
      }),
    ).toThrow('scope must not be the zero address');
    expect(() =>
      FactCollectionTypeKey.from({ contractAddress: contract, scope: AztecAddress.ZERO, factCollectionTypeId: type }),
    ).toThrow('scope must not be the zero address');
  });
});
