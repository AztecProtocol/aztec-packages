import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Data provider for managing capsule storage in the PXE.
 *
 * Capsules are arbitrary data structures stored by contracts, organized by contract address
 * and storage slots. This provider supports individual capsule storage as well as dynamic
 * arrays of capsules with automatic length tracking.
 *
 * @remarks
 * The CapsuleDataProvider uses a key-value store where keys are formatted as
 * `${contractAddress}:${slot}` to ensure data isolation between contracts.
 * It supports both simple capsule storage and complex array operations including
 * append, read, and set operations with automatic length management.
 */
export class CapsuleDataProvider {
  /** The underlying async key-value store for data persistence */
  #store: AztecAsyncKVStore;

  /** Map storing arbitrary capsule data by contracts. Key format: `${contractAddress}:${slot}` */
  #capsules: AztecAsyncMap<string, Buffer>;

  /** Logger instance for debugging and tracing operations */
  logger: Logger;

  /**
   * Creates a new CapsuleDataProvider instance.
   *
   * @param store - The async key-value store to use for data persistence
   */
  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  /**
   * Stores a capsule of field elements at a specific slot for a contract.
   *
   * @param contractAddress - The address of the contract storing the data
   * @param slot - The storage slot where the capsule should be stored
   * @param capsule - Array of field elements to store
   *
   * @remarks
   * Capsules are serialized as concatenated field element buffers before storage.
   * Overwrites any existing data at the specified slot.
   */
  async storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    await this.#capsules.set(dbSlotToKey(contractAddress, slot), Buffer.concat(capsule.map(value => value.toBuffer())));
  }

  /**
   * Loads a capsule of field elements from a specific slot for a contract.
   *
   * @param contractAddress - The address of the contract that owns the data
   * @param slot - The storage slot to load from
   * @returns Array of field elements if found, null if the slot is empty
   *
   * @remarks
   * Deserializes the stored buffer back into an array of field elements.
   * Returns null if no data exists at the specified slot.
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
   * Deletes a capsule from a specific slot for a contract.
   *
   * @param contractAddress - The address of the contract that owns the data
   * @param slot - The storage slot to delete from
   *
   * @remarks
   * This permanently removes the capsule data from the specified slot.
   * No error is thrown if the slot is already empty.
   */
  async deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    await this.#capsules.delete(dbSlotToKey(contractAddress, slot));
  }

  /**
   * Copies multiple capsules from source slots to destination slots.
   *
   * @param contractAddress - The address of the contract that owns the data
   * @param srcSlot - The starting slot to copy from
   * @param dstSlot - The starting slot to copy to
   * @param numEntries - Number of consecutive slots to copy
   * @returns Promise that resolves when the copy is complete
   * @throws Error if any source slot is empty
   *
   * @remarks
   * This method correctly handles overlapping source and destination regions by
   * determining the copy direction based on the relative positions of source and
   * destination. When destination is after source, it uses forward iteration;
   * when source is after destination, it uses backward iteration to avoid
   * overwriting data before it's read.
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

  /**
   * Reads an entire capsule array stored at the base slot.
   *
   * @param contractAddress - The address of the contract that owns the array
   * @param baseSlot - The slot where the array length is stored
   * @returns Promise that resolves to an array of capsules (each capsule is an array of Fr)
   * @throws Error if any expected array element is missing
   *
   * @remarks
   * Capsule arrays follow a specific storage pattern:
   * - baseSlot: stores the array length
   * - baseSlot + 1 + i: stores the i-th array element
   * The method reads the length first, then iterates through all elements.
   */
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

  /**
   * Sets the entire content of a capsule array, replacing any existing data.
   *
   * @param contractAddress - The address of the contract that owns the array
   * @param baseSlot - The slot where the array length is stored
   * @param content - Array of capsules to store (each capsule is an array of Fr)
   * @returns Promise that resolves when the array is fully updated
   *
   * @remarks
   * This method performs a complete replacement of the array:
   * 1. Updates the array length at baseSlot
   * 2. Overwrites all elements up to the new length
   * 3. Deletes any elements beyond the new length (cleanup of old data)
   * All operations are performed atomically within a transaction.
   */
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

/**
 * Generates a unique database key for a capsule storage location.
 *
 * @param contractAddress - The contract address that owns the data
 * @param slot - The storage slot
 * @returns A string key in the format `${contractAddress}:${slot}`
 *
 * @remarks
 * This key format ensures data isolation between contracts while allowing
 * efficient lookups within a contract's storage space.
 */
function dbSlotToKey(contractAddress: AztecAddress, slot: Fr): string {
  return `${contractAddress.toString()}:${slot.toString()}`;
}

/**
 * Calculates the storage slot for an array element at a given index.
 *
 * @param baseSlot - The base slot where the array length is stored
 * @param index - The index of the array element
 * @returns The storage slot for the array element at the given index
 *
 * @remarks
 * Array storage layout:
 * - baseSlot: stores the array length
 * - baseSlot + 1 + index: stores the element at the given index
 */
function arraySlot(baseSlot: Fr, index: number) {
  return baseSlot.add(new Fr(1)).add(new Fr(index));
}
