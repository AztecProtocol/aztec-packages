import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

export class CapsuleDataProvider {
  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  /**
   * Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`.
   * * If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  async storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    await this.#capsules.set(dbSlotToKey(contractAddress, slot), Buffer.concat(capsule.map(value => value.toBuffer())));
  }

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  async loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    const dataBuffer = await this.#capsules.getAsync(dbSlotToKey(contractAddress, slot));
    if (!dataBuffer) {
      this.logger.trace(`Data not found for contract ${contractAddress.toString()} and slot ${slot.toString()}`);
      return null;
    }
    const capsule: Fr[] = [];
    for (let i = 0; i < dataBuffer.length; i += Fr.SIZE_IN_BYTES) {
      capsule.push(Fr.fromBuffer(dataBuffer.subarray(i, i + Fr.SIZE_IN_BYTES)));
    }
    return capsule;
  }

  /**
   * Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to delete.
   */
  async deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    await this.#capsules.delete(dbSlotToKey(contractAddress, slot));
  }

  /**
   * Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data
   * structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`.
   * Supports overlapping source and destination regions (which will result in the overlapped source values being
   * overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
   *
   * @param contractAddress - The contract address under which the data is scoped.
   * @param srcSlot - The first slot to copy from.
   * @param dstSlot - The first slot to copy to.
   * @param numEntries - The number of entries to copy.
   */
  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    return this.#store.transactionAsync(async () => {
      // In order to support overlapping source and destination regions, we need to check the relative positions of source
      // and destination. If destination is ahead of source, then by the time we overwrite source elements using forward
      // indexes we'll have already read those. On the contrary, if source is ahead of destination we need to use backward
      // indexes to avoid reading elements that've been overwritten.

      const indexes = Array.from(Array(numEntries).keys());
      if (srcSlot.lt(dstSlot)) {
        indexes.reverse();
      }

      for (const i of indexes) {
        const currentSrcSlot = dbSlotToKey(contractAddress, srcSlot.add(new Fr(i)));
        const currentDstSlot = dbSlotToKey(contractAddress, dstSlot.add(new Fr(i)));

        const toCopy = await this.#capsules.getAsync(currentSrcSlot);
        if (!toCopy) {
          throw new Error(`Attempted to copy empty slot ${currentSrcSlot} for contract ${contractAddress.toString()}`);
        }

        await this.#capsules.set(currentDstSlot, toCopy);
      }
    });
  }

  /**
   * Appends multiple capsules to a capsule array stored at the base slot.
   * The array length is stored at the base slot, and elements are stored in consecutive slots after it.
   * All operations are performed in a single transaction.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - Array of capsule data to append
   */
  appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][]): Promise<void> {
    return this.#store.transactionAsync(async () => {
      // Load current length, defaulting to 0 if not found
      const lengthData = await this.loadCapsule(contractAddress, baseSlot);
      const currentLength = lengthData ? lengthData[0].toNumber() : 0;

      // Store each capsule at consecutive slots after baseSlot + 1 + currentLength
      for (let i = 0; i < content.length; i++) {
        const nextSlot = arraySlot(baseSlot, currentLength + i);
        await this.storeCapsule(contractAddress, nextSlot, content[i]);
      }

      // Update length to include all new capsules
      const newLength = currentLength + content.length;
      await this.storeCapsule(contractAddress, baseSlot, [new Fr(newLength)]);
    });
  }

  readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr): Promise<Fr[][]> {
    return this.#store.transactionAsync(async () => {
      // Load length, defaulting to 0 if not found
      const maybeLength = await this.loadCapsule(contractAddress, baseSlot);
      const length = maybeLength ? maybeLength[0].toBigInt() : 0n;

      const values: Fr[][] = [];

      // Read each capsule at consecutive slots after baseSlot
      for (let i = 0; i < length; i++) {
        const currentValue = await this.loadCapsule(contractAddress, arraySlot(baseSlot, i));
        if (currentValue == undefined) {
          throw new Error(
            `Expected non-empty value at capsule array in base slot ${baseSlot} at index ${i} for contract ${contractAddress}`,
          );
        }

        values.push(currentValue);
      }

      return values;
    });
  }

  setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][]) {
    return this.#store.transactionAsync(async () => {
      // Load current length, defaulting to 0 if not found
      const maybeLength = await this.loadCapsule(contractAddress, baseSlot);
      const originalLength = maybeLength ? maybeLength[0].toNumber() : 0;

      // Set the new length
      await this.storeCapsule(contractAddress, baseSlot, [new Fr(content.length)]);

      // Store the new content, possibly overwriting existing values
      for (let i = 0; i < content.length; i++) {
        await this.storeCapsule(contractAddress, arraySlot(baseSlot, i), content[i]);
      }

      // Clear any stragglers
      for (let i = content.length; i < originalLength; i++) {
        await this.deleteCapsule(contractAddress, arraySlot(baseSlot, i));
      }
    });
  }
}

function dbSlotToKey(contractAddress: AztecAddress, slot: Fr): string {
  return `${contractAddress.toString()}:${slot.toString()}`;
}

function arraySlot(baseSlot: Fr, index: number) {
  return baseSlot.add(new Fr(1)).add(new Fr(index));
}
