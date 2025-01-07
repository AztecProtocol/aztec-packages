import { MerkleTreeId, type MerkleTreeReadOperations } from '@aztec/circuit-types';
import { times } from '@aztec/foundation/collection';

import { type MockProxy, mock } from 'jest-mock-extended';

import { NullifierCache } from './nullifier_cache.js';

describe('NullifierCache', () => {
  let nullifierCache: NullifierCache;
  let db: MockProxy<MerkleTreeReadOperations>;
  let nullifiers: Buffer[];

  beforeEach(() => {
    db = mock<MerkleTreeReadOperations>();
    nullifierCache = new NullifierCache(db);
    nullifiers = [Buffer.alloc(1, 1), Buffer.alloc(1, 2), Buffer.alloc(1, 3)];
  });

  it('checks nullifier existence against cache', async () => {
    nullifierCache.addNullifiers([nullifiers[0], nullifiers[1]]);
    db.findLeafIndices.mockResolvedValue([]);
    await expect(nullifierCache.nullifiersExist(nullifiers)).resolves.toEqual([true, true, false]);
  });

  it('checks nullifier existence against db', async () => {
    db.findLeafIndices.mockResolvedValue([1n, 2n, undefined]);
    await expect(nullifierCache.nullifiersExist(nullifiers)).resolves.toEqual([true, true, false]);
  });

  it('checks nullifier existence against db only on cache miss', async () => {
    nullifierCache.addNullifiers([nullifiers[0]]);
    db.findLeafIndices.mockResolvedValue([2n, undefined]);
    const result = await nullifierCache.nullifiersExist(nullifiers);
    expect(db.findLeafIndices).toHaveBeenCalledWith(MerkleTreeId.NULLIFIER_TREE, [nullifiers[1], nullifiers[2]]);
    expect(result).toEqual([true, true, false]);
  });

  it('checks existence with several nullifiers', async () => {
    // Split 60 nullifiers evenly across db, cache, or not found
    const nullifiers = times(60, i => Buffer.alloc(1, i));
    const where = nullifiers.map((_, i) =>
      i % 3 === 0 ? ('db' as const) : i % 3 === 1 ? ('cache' as const) : ('none' as const),
    );

    // Add to the cache nullifiers flagged as cache
    nullifierCache.addNullifiers(nullifiers.filter((_, i) => where[i] === 'cache'));
    // The db should be queried only with nullifiers not in the cache, return true for half of them then
    db.findLeafIndices.mockResolvedValue(times(40, i => (i % 2 === 0 ? BigInt(i) : undefined)));

    const result = await nullifierCache.nullifiersExist(nullifiers);
    expect(db.findLeafIndices).toHaveBeenCalledWith(
      MerkleTreeId.NULLIFIER_TREE,
      nullifiers.filter((_, i) => where[i] !== 'cache'),
    );
    expect(result).toEqual(times(60, i => where[i] !== 'none'));
  });
});
