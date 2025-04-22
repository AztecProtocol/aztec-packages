import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { CapsuleDataProvider } from './capsule_data_provider.js';

describe('capsule data provider', () => {
  let contract: AztecAddress;
  let capsuleDataProvider: CapsuleDataProvider;

  beforeEach(async () => {
    // Setup mock contract address
    contract = await AztecAddress.random();
    // Setup data provider
    const store = await openTmpStore('capsule_data_provider_test');
    capsuleDataProvider = new CapsuleDataProvider(store);
  });

  describe('store and load', () => {
    it('stores and loads a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await capsuleDataProvider.storeCapsule(contract, slot, values);
      const result = await capsuleDataProvider.loadCapsule(contract, slot);
      expect(result).toEqual(values);
    });

    it('stores and loads multiple values', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42), new Fr(43), new Fr(44)];

      await capsuleDataProvider.storeCapsule(contract, slot, values);
      const result = await capsuleDataProvider.loadCapsule(contract, slot);
      expect(result).toEqual(values);
    });

    it('overwrites existing values', async () => {
      const slot = new Fr(1);
      const initialValues = [new Fr(42)];
      const newValues = [new Fr(100)];

      await capsuleDataProvider.storeCapsule(contract, slot, initialValues);
      await capsuleDataProvider.storeCapsule(contract, slot, newValues);

      const result = await capsuleDataProvider.loadCapsule(contract, slot);
      expect(result).toEqual(newValues);
    });

    it('stores values for different contracts independently', async () => {
      const anotherContract = await AztecAddress.random();
      const slot = new Fr(1);
      const values1 = [new Fr(42)];
      const values2 = [new Fr(100)];

      await capsuleDataProvider.storeCapsule(contract, slot, values1);
      await capsuleDataProvider.storeCapsule(anotherContract, slot, values2);

      const result1 = await capsuleDataProvider.loadCapsule(contract, slot);
      const result2 = await capsuleDataProvider.loadCapsule(anotherContract, slot);

      expect(result1).toEqual(values1);
      expect(result2).toEqual(values2);
    });

    it('returns null for non-existent slots', async () => {
      const slot = Fr.random();
      const result = await capsuleDataProvider.loadCapsule(contract, slot);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes a slot', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await capsuleDataProvider.storeCapsule(contract, slot, values);
      await capsuleDataProvider.deleteCapsule(contract, slot);

      expect(await capsuleDataProvider.loadCapsule(contract, slot)).toBeNull();
    });

    it('deletes an empty slot', async () => {
      const slot = new Fr(1);
      await capsuleDataProvider.deleteCapsule(contract, slot);

      expect(await capsuleDataProvider.loadCapsule(contract, slot)).toBeNull();
    });
  });

  describe('copy', () => {
    it('copies a single value', async () => {
      const slot = new Fr(1);
      const values = [new Fr(42)];

      await capsuleDataProvider.storeCapsule(contract, slot, values);

      const dstSlot = new Fr(5);
      await capsuleDataProvider.copyCapsule(contract, slot, dstSlot, 1);

      expect(await capsuleDataProvider.loadCapsule(contract, dstSlot)).toEqual(values);
    });

    it('copies multiple non-overlapping values', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await capsuleDataProvider.storeCapsule(contract, src, valuesArray[0]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(5);
      await capsuleDataProvider.copyCapsule(contract, src, dst, 3);

      expect(await capsuleDataProvider.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);
    });

    it('copies overlapping values with src ahead', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await capsuleDataProvider.storeCapsule(contract, src, valuesArray[0]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(2);
      await capsuleDataProvider.copyCapsule(contract, src, dst, 3);

      expect(await capsuleDataProvider.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

      // Slots 2 and 3 (src[1] and src[2]) should have been overwritten since they are also dst[0] and dst[1]
      expect(await capsuleDataProvider.loadCapsule(contract, src)).toEqual(valuesArray[0]); // src[0] (unchanged)
      expect(await capsuleDataProvider.loadCapsule(contract, src.add(new Fr(1)))).toEqual(valuesArray[0]); // dst[0]
      expect(await capsuleDataProvider.loadCapsule(contract, src.add(new Fr(2)))).toEqual(valuesArray[1]); // dst[1]
    });

    it('copies overlapping values with dst ahead', async () => {
      const src = new Fr(5);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await capsuleDataProvider.storeCapsule(contract, src, valuesArray[0]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(1)), valuesArray[1]);
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(4);
      await capsuleDataProvider.copyCapsule(contract, src, dst, 3);

      expect(await capsuleDataProvider.loadCapsule(contract, dst)).toEqual(valuesArray[0]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(1)))).toEqual(valuesArray[1]);
      expect(await capsuleDataProvider.loadCapsule(contract, dst.add(new Fr(2)))).toEqual(valuesArray[2]);

      // Slots 5 and 6 (src[0] and src[1]) should have been overwritten since they are also dst[1] and dst[2]
      expect(await capsuleDataProvider.loadCapsule(contract, src)).toEqual(valuesArray[1]); // dst[1]
      expect(await capsuleDataProvider.loadCapsule(contract, src.add(new Fr(1)))).toEqual(valuesArray[2]); // dst[2]
      expect(await capsuleDataProvider.loadCapsule(contract, src.add(new Fr(2)))).toEqual(valuesArray[2]); // src[2] (unchanged)
    });

    it('copying fails if any value is empty', async () => {
      const src = new Fr(1);
      const valuesArray = [[new Fr(42)], [new Fr(1337)], [new Fr(13)]];

      await capsuleDataProvider.storeCapsule(contract, src, valuesArray[0]);
      // We skip src[1]
      await capsuleDataProvider.storeCapsule(contract, src.add(new Fr(2)), valuesArray[2]);

      const dst = new Fr(5);
      await expect(capsuleDataProvider.copyCapsule(contract, src, dst, 3)).rejects.toThrow(
        'Attempted to copy empty slot',
      );
    });
  });

  describe('append to capsule array', () => {
    it('creates a new array', async () => {
      const baseSlot = new Fr(3);
      const array = range(4).map(x => [new Fr(x)]);

      await capsuleDataProvider.appendToCapsuleArray(contract, baseSlot, array);

      expect(await capsuleDataProvider.loadCapsule(contract, baseSlot)).toEqual([new Fr(array.length)]);
      for (const i of range(array.length)) {
        expect(await capsuleDataProvider.loadCapsule(contract, baseSlot.add(new Fr(1 + i)))).toEqual(array[i]);
      }
    });

    it('appends to an existing array', async () => {
      const baseSlot = new Fr(3);
      const originalArray = range(4).map(x => [new Fr(x)]);

      await capsuleDataProvider.appendToCapsuleArray(contract, baseSlot, originalArray);

      const newElements = [[new Fr(13)], [new Fr(42)]];
      await capsuleDataProvider.appendToCapsuleArray(contract, baseSlot, newElements);

      const expectedLength = originalArray.length + newElements.length;

      expect(await capsuleDataProvider.loadCapsule(contract, baseSlot)).toEqual([new Fr(expectedLength)]);
      for (const i of range(expectedLength)) {
        expect(await capsuleDataProvider.loadCapsule(contract, baseSlot.add(new Fr(1 + i)))).toEqual(
          [...originalArray, ...newElements][i],
        );
      }
    });
  });

  describe('performance tests', () => {
    // These tests serve as a very simple (and perhaps fragile) of preventing performance regressions. Since we
    // currently lack infrastructure to track metrics and see their evolution, we instead run these tests with a fixed
    // timeout, causing failures if performance degrades too much.
    const TEST_TIMEOUT_MS = 5000;

    // Capsules are being used to store arrays of private logs and of pending partial notes, both of which could reach
    // the low thousands in high-usage scenarios. The operations which we expect to be reasonably fast when dealing with
    // such arrays are creation (when syncing logs and sending them to the contract), appending (when discovering new
    // partial notes), and copying (when deleting entries not at the end).
    // Each entry has a length of ARRAY_LENGTH, which is representative of these workloads.
    const NUMBER_OF_ITEMS = 5000;
    const ARRAY_LENGTH = 50;

    it(
      'create large array',
      async () => {
        await capsuleDataProvider.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'append to large array',
      async () => {
        await capsuleDataProvider.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        // Append a single element
        await capsuleDataProvider.appendToCapsuleArray(contract, new Fr(0), [range(ARRAY_LENGTH).map(x => new Fr(x))]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'copy large number of elements',
      async () => {
        await capsuleDataProvider.appendToCapsuleArray(
          contract,
          new Fr(0),
          times(NUMBER_OF_ITEMS, () => range(ARRAY_LENGTH).map(x => new Fr(x))),
        );

        // We just move the entire thing one slot.
        await capsuleDataProvider.copyCapsule(contract, new Fr(0), new Fr(1), NUMBER_OF_ITEMS);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
