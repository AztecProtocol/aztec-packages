import { Fr } from '@aztec/foundation/fields';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { PublicTreesDB } from '../public_db_sources.js';
import { NullifierManager } from './nullifiers.js';

describe('avm nullifier caching', () => {
  let worldStateDB: MockProxy<PublicTreesDB>;
  let nullifiers: NullifierManager;

  beforeEach(() => {
    worldStateDB = mock<PublicTreesDB>();
    nullifiers = new NullifierManager(worldStateDB);
  });

  describe('Nullifier caching and existence checks', () => {
    it('Reading a non-existent nullifier works (gets zero & DNE)', async () => {
      const nullifier = new Fr(2);
      // never written!
      worldStateDB.checkNullifierExists.mockResolvedValue(false);
      const { exists, cacheHit } = await nullifiers.checkExists(nullifier);
      // doesn't exist, not pending, index is zero (non-existent)
      expect(exists).toEqual(false);
      expect(cacheHit).toEqual(false);
    });
    it('Should cache nullifier, existence check works after creation', async () => {
      const nullifier = new Fr(2);

      // Write to cache
      await nullifiers.append(nullifier);
      const { exists, cacheHit } = await nullifiers.checkExists(nullifier);
      // exists (in cache), cacheHit, index is zero (not in tree)
      expect(exists).toEqual(true);
      expect(cacheHit).toEqual(true);
    });
    it('Existence check works on fallback to host (gets index, exists, not-pending)', async () => {
      const nullifier = new Fr(2);

      worldStateDB.checkNullifierExists.mockResolvedValue(true);

      const { exists, cacheHit } = await nullifiers.checkExists(nullifier);
      // exists (in host), not pending, tree index retrieved from host
      expect(exists).toEqual(true);
      expect(cacheHit).toEqual(false);
    });
    it('Existence check works on fallback to parent (gets value, exists, is pending)', async () => {
      const nullifier = new Fr(2);
      const childNullifiers = nullifiers.fork();

      // Write to parent cache
      await nullifiers.append(nullifier);
      // Get from child cache
      const { exists, cacheHit } = await childNullifiers.checkExists(nullifier);
      // exists (in parent), cacheHit, index is zero (not in tree)
      expect(exists).toEqual(true);
      expect(cacheHit).toEqual(true);
    });
    it('Existence check works on fallback to grandparent (gets value, exists, is pending)', async () => {
      const nullifier = new Fr(2);
      const childNullifiers = nullifiers.fork();
      const grandChildNullifiers = childNullifiers.fork();

      // Write to parent cache
      await nullifiers.append(nullifier);
      // Get from child cache
      const { exists, cacheHit } = await grandChildNullifiers.checkExists(nullifier);
      // exists (in parent), cacheHit, index is zero (not in tree)
      expect(exists).toEqual(true);
      expect(cacheHit).toEqual(true);
    });
  });

  describe('Nullifier collision failures', () => {
    it('Cant append nullifier that already exists in cache', async () => {
      const nullifier = new Fr(2); // same nullifier for both!

      // Append a nullifier to cache
      await nullifiers.append(nullifier);
      // Can't append again
      await expect(nullifiers.append(nullifier)).rejects.toThrow(
        `Siloed nullifier ${nullifier} already exists in parent cache or host.`,
      );
    });
    it('Cant append nullifier that already exists in parent cache', async () => {
      const nullifier = new Fr(2); // same nullifier for both!

      // Append a nullifier to parent
      await nullifiers.append(nullifier);
      const childNullifiers = nullifiers.fork();
      // Can't append again in child
      await expect(childNullifiers.append(nullifier)).rejects.toThrow(
        `Siloed nullifier ${nullifier} already exists in parent cache or host.`,
      );
    });
    it('Cant append nullifier that already exist in host', async () => {
      const nullifier = new Fr(2); // same nullifier for both!

      // Nullifier exists in host
      worldStateDB.checkNullifierExists.mockResolvedValue(true);
      // Can't append to cache
      await expect(nullifiers.append(nullifier)).rejects.toThrow(
        `Siloed nullifier ${nullifier} already exists in parent cache or host.`,
      );
    });
  });

  describe('Nullifier cache merging', () => {
    it('Should be able to merge two nullifier caches together', async () => {
      const nullifier0 = new Fr(2);
      const nullifier1 = new Fr(3);

      // Append a nullifier to parent
      await nullifiers.append(nullifier0);

      const childNullifiers = nullifiers.fork();
      // Append a nullifier to child
      await childNullifiers.append(nullifier1);

      // Parent accepts child's nullifiers
      nullifiers.acceptAndMerge(childNullifiers);

      // After merge, parent has both nullifiers
      const results0 = await nullifiers.checkExists(nullifier0);
      expect(results0).toEqual({ exists: true, cacheHit: true });
      const results1 = await nullifiers.checkExists(nullifier1);
      expect(results1).toEqual({ exists: true, cacheHit: true });
    });
    it('Cant merge two nullifier caches with colliding entries', async () => {
      const nullifier = new Fr(2);

      // Append a nullifier to parent
      await nullifiers.append(nullifier);

      // Create child cache, don't derive from parent so we can concoct a collision on merge
      const childNullifiers = new NullifierManager(worldStateDB);
      // Append a nullifier to child
      await childNullifiers.append(nullifier);

      // Parent accepts child's nullifiers
      expect(() => nullifiers.acceptAndMerge(childNullifiers)).toThrow(
        `Failed to merge in fork's cached nullifiers. Siloed nullifier ${nullifier.toBigInt()} already exists in parent cache.`,
      );
    });
  });
});
