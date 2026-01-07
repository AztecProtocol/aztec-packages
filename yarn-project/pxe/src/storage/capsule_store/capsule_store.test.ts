import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleStore } from './capsule_store.js';

const TEST_JOB_ID = 'test-job';

describe('capsule data provider', () => {
  let contract: AztecAddress;
  let capsuleStore: CapsuleStore;

  // Helper that writes and commits in one step
  const storeAndCommit = async (slot: Fr, values: Fr[]) => {
    await capsuleStore.storeCapsule(contract, slot, values, TEST_JOB_ID);
    await capsuleStore.commit(TEST_JOB_ID);
  };

  const deleteAndCommit = async (slot: Fr) => {
    await capsuleStore.deleteCapsule(contract, slot, TEST_JOB_ID);
    await capsuleStore.commit(TEST_JOB_ID);
  };

  const copyAndCommit = async (srcSlot: Fr, dstSlot: Fr, numEntries: number) => {
    await capsuleStore.copyCapsule(contract, srcSlot, dstSlot, numEntries, TEST_JOB_ID);
    await capsuleStore.commit(TEST_JOB_ID);
  };

  const appendAndCommit = async (baseSlot: Fr, content: Fr[][]) => {
    await capsuleStore.appendToCapsuleArray(contract, baseSlot, content, TEST_JOB_ID);
    await capsuleStore.commit(TEST_JOB_ID);
  };

  const setArrayAndCommit = async (baseSlot: Fr, content: Fr[][]) => {
    await capsuleStore.setCapsuleArray(contract, baseSlot, content, TEST_JOB_ID);
    await capsuleStore.commit(TEST_JOB_ID);
  };

  beforeEach(async () => {
    // Setup mock contract address
    contract = await AztecAddress.random();
    // Setup data provider
    const store = await openTmpStore('capsule_store_test');
    capsuleStore = new CapsuleStore(store);
  });

  describe('store and load', () => {
    it('stores and loads a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await storeAndCommit(slot, values);
      const result = await capsuleStore.loadCapsule(contract, slot);
      expect(result).toEqual(values);
    });

    it('stores and loads multiple values', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42), new Fr(43), new Fr(44)];

      await storeAndCommit(slot, values);
      const result = await capsuleStore.loadCapsule(contract, slot);
      expect(result).toEqual(values);
    });

    it('overwrites existing values', async () => {
      const slot = new Fr(1);
      const initialValues = [new Fr(42)];
      const newValues = [new Fr(100)];

      await storeAndCommit(slot, initialValues);
      await storeAndCommit(slot, newValues);

      const result = await capsuleStore.loadCapsule(contract, slot);
      expect(result).toEqual(newValues);
    });

    it('stores values for different contracts independently', async () => {
      const anotherContract = await AztecAddress.random();
      const slot = new Fr(1);
      const values1 = [new Fr(42)];
      const values2 = [new Fr(100)];

      await storeAndCommit(slot, values1);
      await capsuleStore.storeCapsule(anotherContract, slot, values2, TEST_JOB_ID);
      await capsuleStore.commit(TEST_JOB_ID);

      const result1 = await capsuleStore.loadCapsule(contract, slot);
      const result2 = await capsuleStore.loadCapsule(anotherContract, slot);

      expect(result1).toEqual(values1);
      expect(result2).toEqual(values2);
    });

    it('returns null for non-existent slots', async () => {
      const slot = Fr.random();
      const result = await capsuleStore.loadCapsule(contract, slot);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a slot', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await storeAndCommit(slot, values);
      await deleteAndCommit(slot);

      expect(await capsuleStore.loadCapsule(contract, slot)).toBeNull();
    });

    it('deletes an empty slot', async () => {
      const slot = new Fr(1);
      await deleteAndCommit(slot);

      expect(await capsuleStore.loadCapsule(contract, slot)).toBeNull();
    });
  });

  describe('copy', () => {
    it('copies a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await storeAndCommit(slot, values);

      const dstSlot = new Fr(5);
      await copyAndCommit(slot, dstSlot, 1);

      expect(await capsuleStore.loadCapsule(contract, dstSlot)).toEqual(values);
    });

    it('copies multiple non-overlapping values', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await storeAndCommit(src, valuesArray[0]);
      await storeAndCommit(src.add(new Fr(1)), valuesArray[1]);
      await storeAndCommit(src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(5);
      await copyAndCommit(src, dst, 3);

      expect(await capsuleStore.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);
    });

    it('copies overlapping values with src ahead', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await storeAndCommit(src, valuesArray[0]);
      await storeAndCommit(src.add(new Fr(1)), valuesArray[1]);
      await storeAndCommit(src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(2);
      await copyAndCommit(src, dst, 3);

      expect(await capsuleStore.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

      // Slots 2 and 3 (src[1] and src[2]) should have been overwritten since they are also dst[0] and dst[1]
      expect(await capsuleStore.loadCapsule(contract, src)).toEqual(valuesArray[0]); // src[0] (unchanged)
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(1)))).toEqual(valuesArray[0]); // dst[0]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(2)))).toEqual(valuesArray[1]); // dst[1]
    });

    it('copies overlapping values with dst ahead', async () => {
      const src = new Fr(5);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await storeAndCommit(src, valuesArray[0]);
      await storeAndCommit(src.add(new Fr(1)), valuesArray[1]);
      await storeAndCommit(src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(4);
      await copyAndCommit(src, dst, 3);

      expect(await capsuleStore.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleStore.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

      // Slots 5 and 6 (src[0] and src[1]) should have been overwritten since they are also dst[1] and dst[2]
      expect(await capsuleStore.loadCapsule(contract, src)).toEqual(valuesArray[1]); // dst[1]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(1)))).toEqual(valuesArray[2]); // dst[2]
      expect(await capsuleStore.loadCapsule(contract, src.add(new Fr(2)))).toEqual(valuesArray[2]); // src[2] (unchanged)
    });

    it('copying fails if any value is empty', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await storeAndCommit(src, valuesArray[0]);
      // We skip src[1]
      await storeAndCommit(src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(5);
      await expect(capsuleStore.copyCapsule(contract, src, dst, 3, TEST_JOB_ID)).rejects.toThrow(
        'Attempted to copy empty slot',
      );
    });
  });

  describe('arrays', () => {
    describe('appendToCapsuleArray', () => {
      it('creates a new array', async () => {
        const baseSlot = new Fr(3);
        const array = range(4).map(x => [new Fr(x)]);

        await appendAndCommit(baseSlot, array);

        expect(await capsuleStore.loadCapsule(contract, baseSlot)).toEqual([new Fr(array.length)]);
        for (const i of range(array.length)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)))).toEqual(array[i]);
        }
      });

      it('appends to an existing array', async () => {
        const baseSlot = new Fr(3);
        const originalArray = range(4).map(x => [new Fr(x)]);

        await appendAndCommit(baseSlot, originalArray);

        const newElements = [[new Fr(13)], [new Fr(42)]];
        await appendAndCommit(baseSlot, newElements);

        const expectedLength = originalArray.length + newElements.length;

        expect(await capsuleStore.loadCapsule(contract, baseSlot)).toEqual([new Fr(expectedLength)]);
        for (const i of range(expectedLength)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)))).toEqual(
            [...originalArray, ...newElements][i],
          );
        }
      });
    });

    describe('readCapsuleArray', () => {
      it('reads an empty array', async () => {
        const baseSlot = new Fr(3);
        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual([]);
      });

      it('reads an existing array', async () => {
        const baseSlot = new Fr(3);
        const storedArray = range(4).map(x => [new Fr(x)]);

        await appendAndCommit(baseSlot, storedArray);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual(storedArray);
      });

      it('throws on a corrupted array', async () => {
        const baseSlot = new Fr(3);

        // Store in the base slot a non-zero value, indicating a non-zero array length
        await storeAndCommit(baseSlot, [new Fr(1)]);

        // Reading should now fail as some of the capsules in the array are empty
        await expect(capsuleStore.readCapsuleArray(contract, baseSlot)).rejects.toThrow('Expected non-empty value');
      });
    });

    describe('setCapsuleArray', () => {
      it('sets an empty array', async () => {
        const baseSlot = new Fr(3);
        const newArray = range(4).map(x => [new Fr(x)]);

        await setArrayAndCommit(baseSlot, newArray);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing shorter array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(4, 0).map(x => [new Fr(x)]);
        await setArrayAndCommit(baseSlot, originalArray);

        const newArray = range(10, 10).map(x => [new Fr(x)]);
        await setArrayAndCommit(baseSlot, newArray);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual(newArray);
      });

      it('sets an existing longer array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await setArrayAndCommit(baseSlot, originalArray);

        const newArray = range(4, 10).map(x => [new Fr(x)]);
        await setArrayAndCommit(baseSlot, newArray);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual(newArray);

        // Not only do we read the expected array, but also all capsules past the new array length have been cleared
        for (const i of range(originalArray.length - newArray.length)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + newArray.length + i)))).toBeNull();
        }
      });

      it('clears an existing array', async () => {
        const baseSlot = new Fr(3);

        const originalArray = range(10, 0).map(x => [new Fr(x)]);
        await setArrayAndCommit(baseSlot, originalArray);

        await setArrayAndCommit(baseSlot, []);

        const retrievedArray = await capsuleStore.readCapsuleArray(contract, baseSlot);
        expect(retrievedArray).toEqual([]);

        // All capsules from the original array have been cleared
        for (const i of range(originalArray.length)) {
          expect(await capsuleStore.loadCapsule(contract, baseSlot.add(new Fr(1 + i)))).toBeNull();
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
        await appendAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'create large array by resetting',
      async () => {
        await setArrayAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'append to large array',
      async () => {
        await appendAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        // Append a single element
        await appendAndCommit(new Fr(0), [range(ARRAY_LENGTH).map(x => new Fr(x))]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'copy large number of elements',
      async () => {
        await appendAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        // We just move the entire thing one slot.
        await copyAndCommit(new Fr(0), new Fr(1), NUMBER_OF_ITEMS);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'read a large array',
      async () => {
        await appendAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        await capsuleStore.readCapsuleArray(contract, new Fr(0));
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'clear a large array',
      async () => {
        await appendAndCommit(
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        await setArrayAndCommit(new Fr(0), []);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('staging', () => {
    it('writes to staging when jobId provided', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // First set a committed capsule (using a different job that we commit)
      await capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);

      // Then set a staged capsule (not committed)
      await capsuleStore.storeCapsule(contract, slot, stagedValues, stagingJobId);

      // Without jobId, should get committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot)).toEqual(committedValues);

      // With jobId, should get staged capsule
      expect(await capsuleStore.loadCapsule(contract, slot, stagingJobId)).toEqual(stagedValues);
    });

    it('staged capsules are visible when reading with jobId', async () => {
      const slot = Fr.random();
      const stagedValues = [Fr.random()];
      const jobId: string = 'test123';

      // Store only in staging (not committed)
      await capsuleStore.storeCapsule(contract, slot, stagedValues, jobId);

      // Without jobId, should not see the staged capsule
      expect(await capsuleStore.loadCapsule(contract, slot)).toBeNull();

      // With jobId, should see the staged capsule
      expect(await capsuleStore.loadCapsule(contract, slot, jobId)).toEqual(stagedValues);
    });

    it('staged deletions hide committed data', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // First set a committed capsule
      await capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);

      // Delete in staging (not committed)
      await capsuleStore.deleteCapsule(contract, slot, stagingJobId);

      // Without jobId, should still see committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot)).toEqual(committedValues);

      // With stagingJobId, should see null (deleted in staging)
      expect(await capsuleStore.loadCapsule(contract, slot, stagingJobId)).toBeNull();
    });

    it('commit promotes staged data to main', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      await capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);
      await capsuleStore.storeCapsule(contract, slot, stagedValues, stagingJobId);

      await capsuleStore.commit(stagingJobId);

      // Now without jobId should get the previously staged capsule
      expect(await capsuleStore.loadCapsule(contract, slot)).toEqual(stagedValues);
    });

    it('commit applies staged deletions', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const deleteJobId: string = 'delete-job';

      await capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);
      await capsuleStore.deleteCapsule(contract, slot, deleteJobId);

      // Commit the staging
      await capsuleStore.commit(deleteJobId);

      // Now without jobId should see null (deleted)
      expect(await capsuleStore.loadCapsule(contract, slot)).toBeNull();
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const slot = Fr.random();
      const committedValues = [Fr.random()];
      const stagedValues = [Fr.random()];
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      await capsuleStore.storeCapsule(contract, slot, committedValues, commitJobId);
      await capsuleStore.commit(commitJobId);
      await capsuleStore.storeCapsule(contract, slot, stagedValues, stagingJobId);

      // Discard the staging
      await capsuleStore.discardStaged(stagingJobId);

      // Should still get committed capsule
      expect(await capsuleStore.loadCapsule(contract, slot)).toEqual(committedValues);

      // With jobId should fall back to committed since staging was discarded
      expect(await capsuleStore.loadCapsule(contract, slot, stagingJobId)).toEqual(committedValues);
    });
  });
});
