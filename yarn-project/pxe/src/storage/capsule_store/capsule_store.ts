import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { JobContext } from '../../job_coordinator/index.js';
import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

export class CapsuleStore implements StagedStore {
  readonly storeName = 'capsules';

  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  /** In-memory staging: jobId -> key -> (Buffer or null for deletion) */
  #stagedCapsules: Map<string, Map<string, Buffer | null>>;

  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');
    this.#stagedCapsules = new Map();

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  /**
   * Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`.
   * * If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @param context - Optional job context for staged writes.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  async storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], context?: JobContext): Promise<void> {
    const key = dbSlotToKey(contractAddress, slot);
    const buffer = Buffer.concat(capsule.map(value => value.toBuffer()));

    if (context) {
      let jobStaging = this.#stagedCapsules.get(context.jobId);
      if (!jobStaging) {
        jobStaging = new Map();
        this.#stagedCapsules.set(context.jobId, jobStaging);
      }
      jobStaging.set(key, buffer);
    } else {
      await this.#capsules.set(key, buffer);
    }
  }

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @param context - Optional job context to check staging first.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  async loadCapsule(contractAddress: AztecAddress, slot: Fr, context?: JobContext): Promise<Fr[] | null> {
    const key = dbSlotToKey(contractAddress, slot);

    // Check staging first if context provided
    if (context) {
      const jobStaging = this.#stagedCapsules.get(context.jobId);
      if (jobStaging?.has(key)) {
        const stagedValue = jobStaging.get(key);
        // null means staged deletion, undefined means not in staging (shouldn't happen after has() check)
        if (stagedValue === null || stagedValue === undefined) {
          return null;
        }
        return this.#bufferToCapsule(stagedValue);
      }
    }

    // Fall back to committed data
    const dataBuffer = await this.#capsules.getAsync(key);
    if (!dataBuffer) {
      this.logger.trace(`Data not found for contract ${contractAddress.toString()} and slot ${slot.toString()}`);
      return null;
    }
    return this.#bufferToCapsule(dataBuffer);
  }

  #bufferToCapsule(dataBuffer: Buffer): Fr[] {
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
   * @param context - Optional job context for staged writes.
   */
  async deleteCapsule(contractAddress: AztecAddress, slot: Fr, context?: JobContext): Promise<void> {
    const key = dbSlotToKey(contractAddress, slot);

    if (context) {
      let jobStaging = this.#stagedCapsules.get(context.jobId);
      if (!jobStaging) {
        jobStaging = new Map();
        this.#stagedCapsules.set(context.jobId, jobStaging);
      }
      // null marks deletion in staging
      jobStaging.set(key, null);
    } else {
      await this.#capsules.delete(key);
    }
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
   * @param context - Optional job context for staged writes.
   */
  async copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    context?: JobContext,
  ): Promise<void> {
    // In order to support overlapping source and destination regions, we need to check the relative positions of source
    // and destination. If destination is ahead of source, then by the time we overwrite source elements using forward
    // indexes we'll have already read those. On the contrary, if source is ahead of destination we need to use backward
    // indexes to avoid reading elements that've been overwritten.

    const indexes = Array.from(Array(numEntries).keys());
    if (srcSlot.lt(dstSlot)) {
      indexes.reverse();
    }

    if (context) {
      // Staged copy
      for (const i of indexes) {
        const currentSrcSlot = srcSlot.add(new Fr(i));
        const currentDstSlot = dstSlot.add(new Fr(i));

        const toCopy = await this.loadCapsule(contractAddress, currentSrcSlot, context);
        if (!toCopy) {
          throw new Error(
            `Attempted to copy empty slot ${dbSlotToKey(contractAddress, currentSrcSlot)} for contract ${contractAddress.toString()}`,
          );
        }

        await this.storeCapsule(contractAddress, currentDstSlot, toCopy, context);
      }
    } else {
      // Direct copy in transaction
      await this.#store.transactionAsync(async () => {
        for (const i of indexes) {
          const currentSrcKey = dbSlotToKey(contractAddress, srcSlot.add(new Fr(i)));
          const currentDstKey = dbSlotToKey(contractAddress, dstSlot.add(new Fr(i)));

          const toCopy = await this.#capsules.getAsync(currentSrcKey);
          if (!toCopy) {
            throw new Error(`Attempted to copy empty slot ${currentSrcKey} for contract ${contractAddress.toString()}`);
          }

          await this.#capsules.set(currentDstKey, toCopy);
        }
      });
    }
  }

  /**
   * Appends multiple capsules to a capsule array stored at the base slot.
   * The array length is stored at the base slot, and elements are stored in consecutive slots after it.
   * All operations are performed in a single transaction (when not staging).
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - Array of capsule data to append
   * @param context - Optional job context for staged writes.
   */
  appendToCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    context?: JobContext,
  ): Promise<void> {
    const doAppend = async () => {
      // Load current length, defaulting to 0 if not found
      const lengthData = await this.loadCapsule(contractAddress, baseSlot, context);
      const currentLength = lengthData ? lengthData[0].toNumber() : 0;

      // Store each capsule at consecutive slots after baseSlot + 1 + currentLength
      for (let i = 0; i < content.length; i++) {
        const nextSlot = arraySlot(baseSlot, currentLength + i);
        await this.storeCapsule(contractAddress, nextSlot, content[i], context);
      }

      // Update length to include all new capsules
      const newLength = currentLength + content.length;
      await this.storeCapsule(contractAddress, baseSlot, [new Fr(newLength)], context);
    };

    if (context) {
      return doAppend();
    }
    return this.#store.transactionAsync(doAppend);
  }

  /**
   * Reads a capsule array from the per-contract non-volatile database.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param context - Optional job context to check staging first.
   * @returns The array of capsules
   */
  readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, context?: JobContext): Promise<Fr[][]> {
    const doRead = async () => {
      // Load length, defaulting to 0 if not found
      const maybeLength = await this.loadCapsule(contractAddress, baseSlot, context);
      const length = maybeLength ? maybeLength[0].toBigInt() : 0n;

      const values: Fr[][] = [];

      // Read each capsule at consecutive slots after baseSlot
      for (let i = 0; i < length; i++) {
        const currentValue = await this.loadCapsule(contractAddress, arraySlot(baseSlot, i), context);
        if (currentValue == undefined) {
          throw new Error(
            `Expected non-empty value at capsule array in base slot ${baseSlot} at index ${i} for contract ${contractAddress}`,
          );
        }

        values.push(currentValue);
      }

      return values;
    };

    if (context) {
      return doRead();
    }
    return this.#store.transactionAsync(doRead);
  }

  /**
   * Sets a capsule array in the per-contract non-volatile database.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - The array of capsules to set
   * @param context - Optional job context for staged writes.
   */
  setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], context?: JobContext) {
    const doSet = async () => {
      // Load current length, defaulting to 0 if not found
      const maybeLength = await this.loadCapsule(contractAddress, baseSlot, context);
      const originalLength = maybeLength ? maybeLength[0].toNumber() : 0;

      // Set the new length
      await this.storeCapsule(contractAddress, baseSlot, [new Fr(content.length)], context);

      // Store the new content, possibly overwriting existing values
      for (let i = 0; i < content.length; i++) {
        await this.storeCapsule(contractAddress, arraySlot(baseSlot, i), content[i], context);
      }

      // Clear any stragglers
      for (let i = content.length; i < originalLength; i++) {
        await this.deleteCapsule(contractAddress, arraySlot(baseSlot, i), context);
      }
    };

    if (context) {
      return doSet();
    }
    return this.#store.transactionAsync(doSet);
  }

  // StagedStore implementation

  /**
   * Commits staged data to main storage.
   * Called by JobCoordinator when a job completes successfully.
   * @param context - The job context identifying which staged data to commit
   */
  async commit(context: JobContext): Promise<void> {
    const jobStaging = this.#stagedCapsules.get(context.jobId);
    if (!jobStaging) {
      return;
    }

    for (const [key, value] of jobStaging) {
      if (value === null) {
        await this.#capsules.delete(key);
      } else {
        await this.#capsules.set(key, value);
      }
    }

    this.#stagedCapsules.delete(context.jobId);
  }

  /**
   * Discards staged data without committing.
   * @param stagingPrefix - The staging prefix (format: "job_{jobId}:")
   */
  discardStaged(stagingPrefix: string): Promise<void> {
    // Extract jobId from prefix format "job_{jobId}:"
    const jobId = stagingPrefix.slice(4, -1);
    this.#stagedCapsules.delete(jobId);
    return Promise.resolve();
  }
}

function dbSlotToKey(contractAddress: AztecAddress, slot: Fr): string {
  return `${contractAddress.toString()}:${slot.toString()}`;
}

function arraySlot(baseSlot: Fr, index: number) {
  return baseSlot.add(new Fr(1)).add(new Fr(index));
}
