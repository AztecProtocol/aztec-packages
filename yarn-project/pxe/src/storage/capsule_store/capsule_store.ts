import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

export class CapsuleStore implements StagedStore {
  readonly storeName = 'capsules';

  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  /** In-memory stage: jobId -> key -> (Buffer or null for deletion) */
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
   * @param jobId - The job ID for staged writes.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], jobId: string) {
    const key = dbSlotToKey(contractAddress, slot);
    const buffer = Buffer.concat(capsule.map(value => value.toBuffer()));

    let jobStaging = this.#stagedCapsules.get(jobId);
    if (!jobStaging) {
      jobStaging = new Map();
      this.#stagedCapsules.set(jobId, jobStaging);
    }
    jobStaging.set(key, buffer);
  }

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @param jobId - Optional jobId to check staging first.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  async loadCapsule(contractAddress: AztecAddress, slot: Fr, jobId?: string): Promise<Fr[] | null> {
    const key = dbSlotToKey(contractAddress, slot);

    // Check staging first if jobId provided
    if (jobId) {
      const jobStaging = this.#stagedCapsules.get(jobId);
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
   * @param jobId - The job ID for staged writes.
   */
  deleteCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string) {
    const key = dbSlotToKey(contractAddress, slot);

    let jobStaging = this.#stagedCapsules.get(jobId);
    if (!jobStaging) {
      jobStaging = new Map();
      this.#stagedCapsules.set(jobId, jobStaging);
    }
    // null marks deletion in staging
    jobStaging.set(key, null);
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
   * @param jobId - The job ID for staged writes.
   */
  async copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    jobId: string,
  ): Promise<void> {
    // In order to support overlapping source and destination regions, we need to check the relative positions of source
    // and destination. If destination is ahead of source, then by the time we overwrite source elements using forward
    // indexes we'll have already read those. On the contrary, if source is ahead of destination we need to use backward
    // indexes to avoid reading elements that've been overwritten.

    const indexes = Array.from(Array(numEntries).keys());
    if (srcSlot.lt(dstSlot)) {
      indexes.reverse();
    }

    for (const i of indexes) {
      const currentSrcSlot = srcSlot.add(new Fr(i));
      const currentDstSlot = dstSlot.add(new Fr(i));

      const toCopy = await this.loadCapsule(contractAddress, currentSrcSlot, jobId);
      if (!toCopy) {
        throw new Error(
          `Attempted to copy empty slot ${dbSlotToKey(contractAddress, currentSrcSlot)} for contract ${contractAddress.toString()}`,
        );
      }

      this.storeCapsule(contractAddress, currentDstSlot, toCopy, jobId);
    }
  }

  /**
   * Appends multiple capsules to a capsule array stored at the base slot.
   * The array length is stored at the base slot, and elements are stored in consecutive slots after it.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - Array of capsule data to append
   * @param jobId - The job ID for staged writes.
   */
  async appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string) {
    // Load current length, defaulting to 0 if not found
    const lengthData = await this.loadCapsule(contractAddress, baseSlot, jobId);
    const currentLength = lengthData ? lengthData[0].toNumber() : 0;

    // Store each capsule at consecutive slots after baseSlot + 1 + currentLength
    for (let i = 0; i < content.length; i++) {
      const nextSlot = arraySlot(baseSlot, currentLength + i);
      this.storeCapsule(contractAddress, nextSlot, content[i], jobId);
    }

    // Update length to include all new capsules
    const newLength = currentLength + content.length;
    this.storeCapsule(contractAddress, baseSlot, [new Fr(newLength)], jobId);
  }

  /**
   * Reads a capsule array from the per-contract non-volatile database.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param jobId - Optional jobId to check staging first.
   * @returns The array of capsules
   */
  async readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, jobId?: string): Promise<Fr[][]> {
    // Load length, defaulting to 0 if not found
    const maybeLength = await this.loadCapsule(contractAddress, baseSlot, jobId);
    const length = maybeLength ? maybeLength[0].toBigInt() : 0n;

    const values: Fr[][] = [];

    // Read each capsule at consecutive slots after baseSlot
    for (let i = 0; i < length; i++) {
      const currentValue = await this.loadCapsule(contractAddress, arraySlot(baseSlot, i), jobId);
      if (currentValue == undefined) {
        throw new Error(
          `Expected non-empty value at capsule array in base slot ${baseSlot} at index ${i} for contract ${contractAddress}`,
        );
      }

      values.push(currentValue);
    }

    return values;
  }

  /**
   * Sets a capsule array in the per-contract non-volatile database.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - The array of capsules to set
   * @param jobId - The job ID for staged writes.
   */
  async setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string): Promise<void> {
    // Load current length, defaulting to 0 if not found
    const maybeLength = await this.loadCapsule(contractAddress, baseSlot, jobId);
    const originalLength = maybeLength ? maybeLength[0].toNumber() : 0;

    // Set the new length
    this.storeCapsule(contractAddress, baseSlot, [new Fr(content.length)], jobId);

    // Store the new content, possibly overwriting existing values
    for (let i = 0; i < content.length; i++) {
      this.storeCapsule(contractAddress, arraySlot(baseSlot, i), content[i], jobId);
    }

    // Clear any stragglers
    for (let i = content.length; i < originalLength; i++) {
      this.deleteCapsule(contractAddress, arraySlot(baseSlot, i), jobId);
    }
  }

  /**
   * Commits staged data to main storage.
   * Called by JobCoordinator when a job completes successfully.
   * Note: JobCoordinator wraps all commits in a single transaction, so we don't
   * need our own transactionAsync here (and using one would deadlock on IndexedDB).
   * @param jobId - The jobId identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    const jobStaging = this.#stagedCapsules.get(jobId);
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

    this.#stagedCapsules.delete(jobId);
  }

  /**
   * Discards staged data without committing.
   */
  discardStaged(jobId: string): Promise<void> {
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
