import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { FactScope } from './fact_scope.js';
import { FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';

describe('fact store keys', () => {
  const contract = AztecAddress.fromBigIntUnsafe(100n);
  const account = AztecAddress.fromBigIntUnsafe(1n);
  const scope: FactScope = { type: 'account', account };
  const type = new Fr(7n);
  const id = new Fr(42n);

  const collectionKey = (keyScope: FactScope = scope) =>
    FactCollectionKey.from({
      contractAddress: contract,
      scope: keyScope,
      factCollectionTypeId: type,
      factCollectionId: id,
    });

  it('encodes scope between contract and type in the collection key', () => {
    expect(collectionKey().toString()).toBe(`${contract}:${account}:${type}:${id}`);
  });

  it('encodes scope in the type key and carries it through factCollectionTypeKey()', () => {
    expect(collectionKey().factCollectionTypeKey().toString()).toBe(`${contract}:${account}:${type}`);
    expect(
      FactCollectionTypeKey.from({ contractAddress: contract, scope, factCollectionTypeId: type }).toString(),
    ).toBe(`${contract}:${account}:${type}`);
  });

  it('round-trips a collection key through fromString', () => {
    expect(FactCollectionKey.fromString(collectionKey().toString())).toEqual(collectionKey());
  });

  it('encodes the public scope as a fixed key part that round-trips through fromString', () => {
    const publicKey = collectionKey({ type: 'public' });
    expect(publicKey.toString()).toBe(`${contract}:public:${type}:${id}`);
    expect(publicKey.factCollectionTypeKey().toString()).toBe(`${contract}:public:${type}`);
    expect(FactCollectionKey.fromString(publicKey.toString())).toEqual(publicKey);
  });
});
