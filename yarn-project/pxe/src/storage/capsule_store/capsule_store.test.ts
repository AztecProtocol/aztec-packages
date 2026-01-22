import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleStore } from './capsule_store.js';

describe('capsule data provider', () => {
  let contract: AztecAddress;
  let capsuleStore: CapsuleStore;
  let store: AztecLMDBStoreV2;

  beforeEach(async () => {
    // Setup mock contract address
    contract = await AztecAddress.random();
    // Setup store
    const log = createLogger('pxe:test');
    store = await openTmpStore('capsule_store_test', log);
    capsuleStore = new CapsuleStore(store, log);
  });

  describe('store and load', () => {
    it('stores and loads a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.storeCapsule(contract, slot, values, 'test');
      const result = await capsuleStore.loadCapsule(contract, slot, 'test');
      expect(result).toEqual(values);
    });

    it('stores and loads multiple values', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42), new Fr(43), new Fr(44)];

      capsuleStore.storeCapsule(contract, slot, values, 'test');
      const result = await capsuleStore.loadCapsule(contract, slot, 'test');
      expect(result).toEqual(values);
    });

    it('overwrites existing values', async () => {
      const slot = new Fr(1);
      const initialValues = [new Fr(42)];
      const newValues = [new Fr(100)];

      capsuleStore.storeCapsule(contract, slot, initialValues, 'test');
      capsuleStore.storeCapsule(contract, slot, newValues, 'test');

      const result = await capsuleStore.loadCapsule(contract, slot, 'test');
      expect(result).toEqual(newValues);
    });

    it('stores values for different contracts independently', async () => {
      const anotherContract = await AztecAddress.random();
      const slot = new Fr(1);
      const values1 = [new Fr(42)];
      const values2 = [new Fr(100)];

      capsuleStore.storeCapsule(contract, slot, values1, 'test');
      capsuleStore.storeCapsule(anotherContract, slot, values2, 'test');

      const result1 = await capsuleStore.loadCapsule(contract, slot, 'test');
      const result2 = await capsuleStore.loadCapsule(anotherContract, slot, 'test');

      expect(result1).toEqual(values1);
      expect(result2).toEqual(values2);
    });

    it('returns null for non-existent slots', async () => {
      const slot = Fr.random();
      const result = await capsuleStore.loadCapsule(contract, slot, 'test');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a slot', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.storeCapsule(contract, slot, values, 'test');
      capsuleStore.deleteCapsule(contract, slot, 'test');

      expect(await capsuleStore.loadCapsule(contract, slot, 'test')).toBeNull();
    });

    it('deletes an empty slot', async () => {
      const slot = new Fr(1);
      capsuleStore.deleteCapsule(contract, slot, 'test');

      expect(await capsuleStore.loadCapsule(contract, slot, 'test')).toBeNull();
    });
  });

  describe('copy', () => {
    it('copies a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      capsuleStore.storeCapsule(contract, slot, values, 'test');

      const dstSlot = new Fr(5);
      await capsuleStore.copyCapsule(contract, slot, dstSlot, 1, 'test');

      expect(await capsuleStore.loadCapsule(contract, dstSlot, 'test')).toEqual(values);
    });

    it('copies multiple non-overlapping values', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.storeCapsule(contract, src, valuesArray[0], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test');

      const dst = new Fr(5);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test');

      expect(await capsuleStore.loadCapsule(contract, dst, 'test')).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)), 'test')).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)), 'test')).toEqual(valuesArray[2]);
    });

    it('copies overlapping values with src ahead', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.storeCapsule(contract, src, valuesArray[0], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test');

      const dst = new Fr(2);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test');

      expect(await capsuleStore.loadCapsule(contract, dst, 'test')).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)), 'test')).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)), 'test')).toEqual(valuesArray[2]);

      // Slots 2 and 3 (src[1] and src[2]) should have been overwritten since they are also dst[0] and dst[1]
      expect(await capsuleStore.loadCapsule(contract, src, 'test')).toEqual(valuesArray[0]); // src[0] (unchanged)
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(1)), 'test')).toEqual(valuesArray[0]); // dst[0]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(2)), 'test')).toEqual(valuesArray[1]); // dst[1]
    });

    it('copies overlapping values with dst ahead', async () => {
      const src = new Fr(5);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.storeCapsule(contract, src, valuesArray[0], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1], 'test');
      capsuleStore.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test');

      const dst = new Fr(4);
      await capsuleStore.copyCapsule(contract, src, dst, 3, 'test');

      expect(await capsuleStore.loadCapsule(contract, dst, 'test')).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)), 'test')).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)), 'test')).toEqual(valuesArray[2]);

      // Slots 5 and 6 (src[0] and src[1]) should have been overwritten since they are also dst[1] and dst[2]
      expect(await capsuleStore.loadCapsule(contract, src, 'test')).toEqual(valuesArray[1]); // dst[1]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(1)), 'test')).toEqual(valuesArray[2]); // dst[2]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(2)), 'test')).toEqual(valuesArray[2]); // src[2] (unchanged)
    });

    it('copying fails if any value is empty', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      capsuleStore.storeCapsule(contract, src, valuesArray[0], 'test');
      // We skip src[1]
      capsuleStore.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2], 'test');

      const dst = new Fr(5);
      await expect(capsuleStore.copyCapsule(contract, src, dst, 3, 'test')).rejects.toThrow(
        'Attempted to copy empty slot',
      );
    });
  });

  describe('arrays', () => {
    describe('appendToCapsuleArray', () => {
      it('creates a new array', async () => {
        const baseSlot = new Fr(3);
        const array = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, array, 'test');

        expect(await capsuleStore.loadCapsule(contract, baseSlot, 'test')).toEqual([new Fr(array.length)]);
        for (const i of range(array.length)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test')).toEqual(array[i]);
        }
      });

      it('appends to an existing array', async () => {
        const baseSlot = new Fr(3);
        const originalArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, originalArray, 'test');

        const newElements = [[new Fr(13)], [new Fr(42)]];
        await capsuleStore.appendToCapsuleArray(contract, baseSlot, newElements, 'test');

        const expectedLength = originalArray.length + newElements.length;

        expect(await capsuleStore.loadCapsule(contract, baseSlot, 'test')).toEqual([new Fr(expectedLength)]);
        for (const i of range(expectedLength)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test')).toEqual(
            [...originalArray, ...newElements][i],
          );
        }
      });
    });

    describe('readCapsuleArray', () => {
      it('reads an empty array', async () => {
        const baseSlot = new Fr(3);
        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual([]);
      });

      it('reads an existing array', async () => {
        const baseSlot = new Fr(3);
        const storedArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.appendToCapsuleArray(contract, baseSlot, storedArray, 'test');

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual(storedArray);
      });

      it('throws on a corrupted array', async () => {
        const baseSlot = new Fr(3);

        // Store in the base slot a non-zero value, indicating a non-zero array length
        capsuleStore.storeCapsule(contract, baseSlot, [new Fr(1)], 'test');

        // Reading should now fail as some of the capsules in the array are empty
        await expect(capsuleStore.readCapsuleArray(contract, baseSlot, 'test')).rejects.toThrow(
          'Expected non-empty value',
        );
      });
    });

    describe('setCapsuleArray', () => {
      it('sets an empty array', async () => {
        const baseSlot = new Fr(3);
        const newArray = range(4).map(x => [new Fr(x)]);

        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test');

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing shorter array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(4, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test');

        const newArray = range(10, 10).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test');

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing longer array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test');

        const newArray = range(4, 10).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, newArray, 'test');

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual(newArray);

        // Not only do we read the expected array, but also all capsules past the new array length have been cleared
        for (const i of range(originalArray.length - newArray.length)) {
          expect(
            await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + newArray.length + i)), 'test'),
          ).toBeNull();
        }
      });

      it('clears an existing array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await capsuleStore.setCapsuleArray(contract, baseSlot, originalArray, 'test');

        await capsuleStore.setCapsuleArray(contract, baseSlot, [], 'test');

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot, 'test');
        expect(retrievedArray).toEqual([]);

        // All capsules from the original array have been cleared
        for (const i of range(originalArray.length)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)), 'test')).toBeNull();
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
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        // Append a single element
        await capsuleStore.appendToCapsuleArray(contract, new Fr(0), [range(ARRAY_LENGTH).map(x => new Fr(x))], 'test');

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
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        // We just move the entire thing one slot.
        await capsuleStore.copyCapsule(contract, new Fr(0), new Fr(1), NUMBER_OF_ITEMS, 'test');

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
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        await capsuleStore.readCapsuleArray(contract, new Fr(0), 'test');

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
        );

        await store.transactionAsync(async () => {
          await capsuleStore.commit('test');
        });

        await capsuleStore.setCapsuleArray(contract, new Fr(0), [], 'test');

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

      capsuleStore.storeCapsule(contract, slot, committedValues1, 'job-1');

      // After this commit, 'job-1' should logically be reset
      // Any read of contract-slot after this should see committedValues1
      await capsuleStore.commit('job-1');

      // Any read of contract-slot should see job2committedValues
      capsuleStore.storeCapsule(contract, slot, committedValues2, 'job-2');
      await capsuleStore.commit('job-2');

      // If we failed to properly dispose 'job-1's staged writes on commit,
      // Instead of reading committedValues2 (as we should), we would end
      // up reading committedValues1 (which would be wrong)
      expect(await capsuleStore.loadCapsule(contract, slot, 'job-1')).toEqual(committedValues2);
    });

    it('writes to job view are isolated from another job view', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagedJob1: string = 'staged-job-1';
      const stagedJob2: string = 'staged-job-2';

      // First set a committed capsule (using a different job that we commit)
      capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);

      // Then set a staged capsule (not committed)
      capsuleStore.storeCapsule(contract, slot, stagedValues, stagedJob1);

      // With jobId=1, should get staged capsule
      expect(await capsuleStore.loadCapsule(contract, slot, stagedJob1)).toEqual(stagedValues);

      // With jobId=2, should get committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot, stagedJob2)).toEqual(committedValues);
    });

    it('staged deletions hide committed data', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagedJob1: string = 'staged-job-1';
      const stagedJob2: string = 'staged-job-2';

      // First set a committed capsule
      capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);

      // Delete in staging (not committed)
      capsuleStore.deleteCapsule(contract, slot, stagedJob1);

      // Without jobId=2, should still see committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot, stagedJob2)).toEqual(committedValues);

      // With jobId=1, should see null (deleted in staging)
      expect(await capsuleStore.loadCapsule(contract, slot, stagedJob1)).toBeNull();
    });

    it('commit applies staged deletions', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const deleteJobId: string = 'delete-job';

      capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);
      capsuleStore.deleteCapsule(contract, slot, deleteJobId);

      await capsuleStore.commit(deleteJobId);

      // Now any job should see this null (deleted)
      expect(await capsuleStore.loadCapsule(contract, slot, 'any-job-sees-this')).toBeNull();
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);
      capsuleStore.storeCapsule(contract, slot, stagedValues, stagingJobId);

      await capsuleStore.discardStaged(stagingJobId);

      // Should still get committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot, 'any-job')).toEqual(committedValues);

      // With stagingJobId should fall back to committed since staging was discarded
      expect(await capsuleStore.loadCapsule(contract, slot, stagingJobId)).toEqual(committedValues);
    });
  });
});
