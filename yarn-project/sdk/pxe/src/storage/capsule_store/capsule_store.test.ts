import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleStore } from './capsule_store.js';

describe('capsule data provider', () => {
  let scope: AztecAddress;
  let contract: AztecAddress;
  let capsuleStore: CapsuleStore;
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    contract = await AztecAddress.random();
    scope = await AztecAddress.random();
    store = await openTmpStore('capsule_store_test');
    capsuleStore = new CapsuleStore(store);
  });

  describe('store and load', () => {
    it('stores and loads a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.setCapsule(contract, slot, values, 'test', scope);
      const result = await capsuleStore.getCapsule(contract, slot, 'test', scope);
      expect(result).toEqual(values);
    });

    it('stores and loads multiple values', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42), new Fr(43), new Fr(44)];

      capsuleStore.setCapsule(contract, slot, values, 'test', scope);
      const result = await capsuleStore.getCapsule(contract, slot, 'test', scope);
      expect(result).toEqual(values);
    });

    it('overwrites existing values', async () => {
      const slot = new Fr(1);
      const initialValues = [new Fr(42)];
      const newValues = [new Fr(100)];

      capsuleStore.setCapsule(contract, slot, initialValues, 'test', scope);
      capsuleStore.setCapsule(contract, slot, newValues, 'test', scope);

      const result = await capsuleStore.getCapsule(contract, slot, 'test', scope);
      expect(result).toEqual(newValues);
    });

    it('stores values for different contracts independently', async () => {
      const anotherContract = await AztecAddress.random();
      const slot = new Fr(1);
      const values1 = [new Fr(42)];
      const values2 = [new Fr(100)];

      capsuleStore.setCapsule(contract, slot, values1, 'test', scope);
      capsuleStore.setCapsule(anotherContract, slot, values2, 'test', scope);

      const result1 = await capsuleStore.getCapsule(contract, slot, 'test', scope);
      const result2 = await capsuleStore.getCapsule(anotherContract, slot, 'test', scope);

      expect(result1).toEqual(values1);
      expect(result2).toEqual(values2);
    });

    it('stores values for different scopes independently', async () => {
      const scopeA = await AztecAddress.random();
      const scopeB = await AztecAddress.random();
      const slot = new Fr(1);
      const valuesA = [new Fr(42)];
      const valuesB = [new Fr(100)];

      capsuleStore.setCapsule(contract, slot, valuesA, 'test', scopeA);
      capsuleStore.setCapsule(contract, slot, valuesB, 'test', scopeB);

      expect(await capsuleStore.getCapsule(contract, slot, 'test', scopeA)).toEqual(valuesA);
      expect(await capsuleStore.getCapsule(contract, slot, 'test', scopeB)).toEqual(valuesB);
      expect(await capsuleStore.getCapsule(contract, slot, 'test', scope)).toBeNull();
    });

    it('different scopes are isolated', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.setCapsule(contract, slot, values, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, slot, 'test', scope)).toEqual(values);
      expect(await capsuleStore.getCapsule(contract, slot, 'test', AztecAddress.ZERO)).toBeNull();
    });

    it('returns null for non-existent slots', async () => {
      const slot = Fr.random();
      const result = await capsuleStore.getCapsule(contract, slot, 'test', scope);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a slot', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.setCapsule(contract, slot, values, 'test', scope);
      capsuleStore.deleteCapsule(contract, slot, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, slot, 'test', scope)).toBeNull();
    });

    it('deletes an empty slot', async () => {
      const slot = new Fr(1);
      capsuleStore.deleteCapsule(contract, slot, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, slot, 'test', scope)).toBeNull();
    });

    it('deletes a scoped capsule without affecting other scopes', async () => {
      const scopeA = await AztecAddress.random();
      const scopeB = await AztecAddress.random();
      const slot = Fr.random();
      const valuesA = [Fr.random(), Fr.random(), Fr.random()];
      const valuesB = [Fr.random(), Fr.random(), Fr.random()];
      const globalValues = [Fr.random(), Fr.random(), Fr.random()];

      capsuleStore.setCapsule(contract, slot, valuesA, 'test', scopeA);
      capsuleStore.setCapsule(contract, slot, valuesB, 'test', scopeB);
      capsuleStore.setCapsule(contract, slot, globalValues, 'test', scope);

      capsuleStore.deleteCapsule(contract, slot, 'test', scopeA);

      expect(await capsuleStore.getCapsule(contract, slot, 'test', scopeA)).toBeNull();
      expect(await capsuleStore.getCapsule(contract, slot, 'test', scopeB)).toEqual(valuesB);
      expect(await capsuleStore.getCapsule(contract, slot, 'test', scope)).toEqual(globalValues);
    });
  });

  describe('copy', () => {
    it('copies a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.setCapsule(contract, slot, values, 'test', scope);

      const dstSlot = new Fr(5);
      await capsuleStore.copyCapsule(contract, slot, dstSlot, 1, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, dstSlot, 'test', scope)).toEqual(values);
    });

    it('copies multiple non-overlapping values', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.setCapsule(contract, src, valuesArray[0], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test', scope);

      const dst = new Fr(5);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, dst, 'test', scope)).toEqual(valuesArray[0]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(1)), 'test', scope)).toEqual(valuesArray[1]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(2)), 'test', scope)).toEqual(valuesArray[2]);
    });

    it('copies overlapping values with src ahead', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.setCapsule(contract, src, valuesArray[0], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test', scope);

      const dst = new Fr(2);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, dst, 'test', scope)).toEqual(valuesArray[0]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(1)), 'test', scope)).toEqual(valuesArray[1]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(2)), 'test', scope)).toEqual(valuesArray[2]);

      // Slots 2 and 3 (src[1] and src[2]) should have been overwritten since they are also dst[0] and dst[1]
      expect(await capsuleStore.getCapsule(contract, src, 'test', scope)).toEqual(valuesArray[0]); // src[0] (unchanged)
      expect(await capsuleStore.getCapsule(contract, src.add(new Fr(1)), 'test', scope)).toEqual(valuesArray[0]); // dst[0]
      expect(await capsuleStore.getCapsule(contract, src.add(new Fr(2)), 'test', scope)).toEqual(valuesArray[1]); // dst[1]
    });

    it('copies overlapping values with dst ahead', async () => {
      const src = new Fr(5);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.setCapsule(contract, src, valuesArray[0], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test', scope);
      capsuleStore.setCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test', scope);

      const dst = new Fr(4);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, dst, 'test', scope)).toEqual(valuesArray[0]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(1)), 'test', scope)).toEqual(valuesArray[1]);
      expect(await capsuleStore.getCapsule(contract, dst.add(new Fr(2)), 'test', scope)).toEqual(valuesArray[2]);

      // Slots 5 and 6 (src[0] and src[1]) should have been overwritten since they are also dst[1] and dst[2]
      expect(await capsuleStore.getCapsule(contract, src, 'test', scope)).toEqual(valuesArray[1]); // dst[1]
      expect(await capsuleStore.getCapsule(contract, src.add(new Fr(1)), 'test', scope)).toEqual(valuesArray[2]); // dst[2]
      expect(await capsuleStore.getCapsule(contract, src.add(new Fr(2)), 'test', scope)).toEqual(valuesArray[2]); // src[2] (unchanged)
    });

    it('copying fails if any value is empty', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.setCapsule(contract, src, valuesArray[0], 'test', scope);
      // We skip src[1]
      capsuleStore.setCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test', scope);

      const dst = new Fr(5);
      await expect(capsuleStore.copyCapsule(contract, src, dst, 3, 'test', scope)).rejects.toThrow(
        'Attempted to copy empty slot',
      );
    });

    it('copies values within a scope only', async () => {
      const scope = await AztecAddress.random();
      const src = new Fr(1);
      const dst = new Fr(5);
      const values = [new Fr(42)];

      capsuleStore.setCapsule(contract, src, values, 'test', scope);
      await capsuleStore.copyCapsule(contract, src, dst, 1, 'test', scope);

      expect(await capsuleStore.getCapsule(contract, dst, 'test', scope)).toEqual(values);
      expect(await capsuleStore.getCapsule(contract, dst, 'test', AztecAddress.ZERO)).toBeNull();
    });
  });

  describe('arrays', () => {
    describe('appendToCapsuleArray', () => {
      it('creates a new array', async () => {
        const baseSlot = new Fr(3);
        const array = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, array, 'test', scope);

        expect(await capsuleStore.getCapsule(contract, baseSlot, 'test', scope)).toEqual([new Fr(array.length)]);
        for (const i of range(array.length)) {
          expect(await capsuleStore.getCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test', scope)).toEqual(array[i]);
        }
      });

      it('appends to an existing array', async () => {
        const baseSlot = new Fr(3);
        const originalArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, originalArray, 'test', scope);

        const newElements = [[new Fr(13)], [new Fr(42)]];
        await capsuleStore.appendToCapsuleArray(contract, baseSlot, newElements, 'test', scope);

        const expectedLength = originalArray.length + newElements.length;

        expect(await capsuleStore.getCapsule(contract, baseSlot, 'test', scope)).toEqual([new Fr(expectedLength)]);
        for (const i of range(expectedLength)) {
          expect(await capsuleStore.getCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test', scope)).toEqual(
            [...originalArray, ...newElements][i],
          );
        }
      });
    });

    describe('readCapsuleArray', () => {
      it('reads an empty array', async () => {
        const baseSlot = new Fr(3);
        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual([]);
      });

      it('reads an existing array', async () => {
        const baseSlot = new Fr(3);
        const storedArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, storedArray, 'test', scope);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual(storedArray);
      });

      it('throws on a corrupted array', async () => {
        const baseSlot = new Fr(3);

        // Store in the base slot a non-zero value, indicating a non-zero array length
        capsuleStore.setCapsule(contract, baseSlot, [new Fr(1)], 'test', scope);

        // Reading should now fail as some of the capsules in the array are empty
        await expect(capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope)).rejects.toThrow(
          'Expected non-empty value',
        );
      });
    });

    describe('setCapsuleArray', () => {
      it('sets an empty array', async () => {
        const baseSlot = new Fr(3);
        const newArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test', scope);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing shorter array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(4, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test', scope);

        const newArray = range(10, 10).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test', scope);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing longer array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test', scope);

        const newArray = range(4, 10).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test', scope);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual(newArray);

        // Not only do we read the expected array, but also all capsules past the new array length have been cleared
        for (const i of range(originalArray.length - newArray.length)) {
          expect(
            await capsuleStore.getCapsule(contract, baseSlot.add(new Fr(1 + newArray.length + i)), 'test', scope),
          ).toBeNull();
        }
      });

      it('clears an existing array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test', scope);

        await capsuleStore.setCapsuleArray(contract, baseSlot, [], 'test', scope);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test', scope);
        expect(retrievedArray).toEqual([]);

        // All capsules from the original array have been cleared
        for (const i of range(originalArray.length)) {
          expect(await capsuleStore.getCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test', scope)).toBeNull();
        }
      });
    });
  });

  describe('performance tests', () => {
    // These tests serve as a very simple (and perhaps fragile) of preventing performance regressions. Since we
    // currently lack infrastructure to track metrics and see their evolution, we instead run these tests with a fixed
    // timeout, causing failures if performance degrades too much.
    const TEST_TIMEOUT_MS = 10000;

    // Capsules are being used to store arrays of private logs and of pending partial notes, both of which could reach
    // the low thousands in high-usage scenarios. The operations which we expect to be reasonably fast when dealing with
    // such arrays are creation (when syncing logs and sending them to the contract), appending (when discovering new
    // partial notes), and copying (when deleting entries not at the end).
    // Each entry has a length of ARRAY_LENGTH, which is representative of these workloads.
    const NUMBER_OF_ITEMS = 5000;
    const ARRAY_LENGTH = 50;

    it(
      'create large array by appending',
      async () => {
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'create large array by resetting',
      async () => {
        await capsuleStore.setCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'append to large array',
      async () => {
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        // Append a single element
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          [range(ARRAY_LENGTH).map(x => new Fr(x))],
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'copy large number of elements',
      async () => {
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        // We just move the entire thing one slot.
        await capsuleStore.copyCapsule(contract, new Fr(0), new Fr(1), NUMBER_OF_ITEMS, 'test', scope);

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'read a large array',
      async () => {
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        await capsuleStore.readCapsuleArray(contract, new Fr(0), 'test', scope);

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'clear a large array',
      async () => {
        await capsuleStore.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
          'test',
          scope,
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        await capsuleStore.setCapsuleArray(contract, new Fr(0), [], 'test', scope);

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('staged writes', () => {
    it('commit does not hold zombie data', async () => {
      // This test tries to reproduce a scenario where
      // we fail to clear a job's data after commit.
      // The effect of such an incorrect behavior would be perceived
      // if we re-used a jobId we had previously committed,
      // which should not happen given we generate random job id's,
      // but it's good to keep things clean and consistent.
      const slot = Fr.random();
      const committedValues1 = [Fr.random()];
      const committedValues2 = [Fr.random()];

      capsuleStore.setCapsule(contract, slot, committedValues1, 'job-1', scope);

      // After this commit, 'job-1' should logically be reset
      // Any read of contract-slot after this should see committedValues1
      await capsuleStore.commit('job-1');

      // Any read of contract-slot should see job2committedValues
      capsuleStore.setCapsule(contract, slot, committedValues2, 'job-2', scope);
      await capsuleStore.commit('job-2');

      // If we failed to properly dispose 'job-1's staged writes on commit,
      // Instead of reading committedValues2 (as we should), we would end
      // up reading committedValues1 (which would be wrong)
      expect(await capsuleStore.getCapsule(contract, slot, 'job-1', scope)).toEqual(committedValues2);
    });

    it('writes to job view are isolated from another job view', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagedJob1: string = 'staged-job-1';
      const stagedJob2: string = 'staged-job-2';

      // First set a committed capsule (using a different job that we commit)
      capsuleStore.setCapsule(contract, slot, committedValues, commitJobId, scope);
      await capsuleStore.commit(commitJobId);

      // Then set a staged capsule (not committed)
      capsuleStore.setCapsule(contract, slot, stagedValues, stagedJob1, scope);

      // With jobId=1, should get staged capsule
      expect(await capsuleStore.getCapsule(contract, slot, stagedJob1, scope)).toEqual(stagedValues);

      // With jobId=2, should get committed capsule
      expect(await capsuleStore.getCapsule(contract, slot, stagedJob2, scope)).toEqual(committedValues);
    });

    it('staged deletions hide committed data', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagedJob1: string = 'staged-job-1';
      const stagedJob2: string = 'staged-job-2';

      // First set a committed capsule
      capsuleStore.setCapsule(contract, slot, committedValues, commitJobId, scope);
      await capsuleStore.commit(commitJobId);

      // Delete in staging (not committed)
      capsuleStore.deleteCapsule(contract, slot, stagedJob1, scope);

      // Without jobId=2, should still see committed capsule
      expect(await capsuleStore.getCapsule(contract, slot, stagedJob2, scope)).toEqual(committedValues);

      // With jobId=1, should see null (deleted in staging)
      expect(await capsuleStore.getCapsule(contract, slot, stagedJob1, scope)).toBeNull();
    });

    it('commit applies staged deletions', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const deleteJobId: string = 'delete-job';

      capsuleStore.setCapsule(contract, slot, committedValues, commitJobId, scope);
      await capsuleStore.commit(commitJobId);
      capsuleStore.deleteCapsule(contract, slot, deleteJobId, scope);

      await capsuleStore.commit(deleteJobId);

      // Now any job should see this null (deleted)
      expect(await capsuleStore.getCapsule(contract, slot, 'any-job-sees-this', scope)).toBeNull();
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      capsuleStore.setCapsule(contract, slot, committedValues, commitJobId, scope);
      await capsuleStore.commit(commitJobId);
      capsuleStore.setCapsule(contract, slot, stagedValues, stagingJobId, scope);

      await capsuleStore.discardStaged(stagingJobId);

      // Should still get committed capsule
      expect(await capsuleStore.getCapsule(contract, slot, 'any-job', scope)).toEqual(committedValues);

      // With stagingJobId should fall back to committed since staging was discarded
      expect(await capsuleStore.getCapsule(contract, slot, stagingJobId, scope)).toEqual(committedValues);
    });
  });
});
