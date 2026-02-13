import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

export class CapsuleStore implements StagedStore {
  readonly storeName = 'capsule';

  #store: AztecAsyncKVStore;

  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${key}`
  #capsules: AztecAsyncMap<string, Buffer>;

  // jobId => `${contractAddress}:${key}` => capsule data
  // when `#stagedCapsules.get('some-job-id').get('${some-contract-address:some-key') === null`,
  // it signals that the capsule was deleted during the job, so it needs to be deleted on commit
  #stagedCapsules: Map<string, Map<string, Buffer | null>>;

  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#capsules = this.#store.openMap('capsules');

    this.#stagedCapsules = new Map();

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  /**
   * Given a job denoted by `jobId`, it returns the
   * capsules that said job has interacted with.
   *
   * Capsules that haven't been committed to persistence KV storage
   * are kept in-memory in `#stagedCapsules`, this method provides a convenient
   * way to access that in-memory collection of data.
   *
   * @param jobId
   * @returns
   */
  #getJobStagedCapsules(jobId: string): Map<string, Buffer | null> {
    let jobStagedCapsules = this.#stagedCapsules.get(jobId);
    if (!jobStagedCapsules) {
      jobStagedCapsules = new Map();
      this.#stagedCapsules.set(jobId, jobStagedCapsules);
    }
    return jobStagedCapsules;
  }

  /**
   * Reads a capsule's slot from the staged version of the data associated to the given jobId.
   *
   * If it is not there, it reads it from the KV store.
   */
  async #getFromStage(jobId: string, dbSlotKey: string): Promise<Buffer | null | undefined> {
    const jobStagedCapsules = this.#getJobStagedCapsules(jobId);
    const staged: Buffer | null | undefined = jobStagedCapsules.get(dbSlotKey);

    // Always issue DB read to keep IndexedDB transaction alive, even if the value is in the job staged data. This
    // keeps IndexedDB transactions alive (they auto-commit when a new micro-task starts and there are no pending read
    // requests). The staged value still takes precedence if it exists (including null for deletions).
    const dbValue = await this.#loadCapsuleFromDb(dbSlotKey);

    return staged !== undefined ? staged : dbValue;
  }

  /**
   * Writes a capsule to the stage of a job.
   */
  #setOnStage(jobId: string, dbSlotKey: string, capsuleData: Buffer) {
    this.#getJobStagedCapsules(jobId).set(dbSlotKey, capsuleData);
  }

  /**
   * Deletes a capsule on the stage of a job. Note the capsule will still
   * exist in storage until the job is committed.
   */
  #deleteOnStage(jobId: string, dbSlotKey: string) {
    this.#getJobStagedCapsules(jobId).set(dbSlotKey, null);
  }

  async #loadCapsuleFromDb(dbSlotKey: string): Promise<Buffer | null> {
    const dataBuffer = await this.#capsules.getAsync(dbSlotKey);
    if (!dataBuffer) {
      return null;
    }

    return dataBuffer;
  }

  /**
   * Commits staged data to main storage.
   * Called by JobCoordinator when a job completes successfully.
   * Note: JobCoordinator wraps all commits in a single transaction, so we don't
   * need our own transactionAsync here (and using one would deadlock on IndexedDB).
   * @param jobId - The jobId identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    const jobStagedCapsules = this.#getJobStagedCapsules(jobId);

    for (const [key, value] of jobStagedCapsules) {
      // In the write stage, we represent deleted capsules with null
      // (as opposed to undefined, which denotes there was never a capsule there to begin with).
      // So we delete from actual KV store here.
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

  /**
   * Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`.
   * * If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @param jobId - The context in which this store will be visible until PXE decides to persist it to underlying KV store
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], jobId: string) {
    const dbSlotKey = dbSlotToKey(contractAddress, slot);

    // A store overrides any pre-existing data on the slot
    this.#setOnStage(jobId, dbSlotKey, Buffer.concat(capsule.map(value => value.toBuffer())));
  }

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  async loadCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string): Promise<Fr[] | null> {
    const dataBuffer = await this.#getFromStage(jobId, dbSlotToKey(contractAddress, slot));
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
  deleteCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string) {
    // When we commit this, we will interpret null as a deletion, so we'll propagate the delete to the KV store
    this.#deleteOnStage(jobId, dbSlotToKey(contractAddress, slot));
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
  copyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
    jobId: string,
  ): Promise<void> {
    // This transactional context gives us "copy atomicity":
    // there shouldn't be concurrent writes to what's being copied here.
    // Equally important: this in practice is expected to perform thousands of DB operations
    // and not using a transaction here would heavily impact performance.
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

        const toCopy = await this.#getFromStage(jobId, currentSrcSlot);
        if (!toCopy) {
          throw new Error(`Attempted to copy empty slot ${currentSrcSlot} for contract ${contractAddress.toString()}`);
        }

        this.#setOnStage(jobId, currentDstSlot, toCopy);
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
  appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string): Promise<void> {
    // We wrap this in a transaction to serialize concurrent calls from Promise.all.
    // Without this, concurrent appends to the same array could race: both read length=0,
    // both write at the same slots, one overwrites the other.
    // Equally important: this in practice is expected to perform thousands of DB operations
    // and not using a transaction here would heavily impact performance.
    return this.#store.transactionAsync(async () => {
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
    });
  }

  readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, jobId: string): Promise<Fr[][]> {
    // I'm leaving this transactional context here though because I'm assuming this
    // gives us "read array atomicity": there shouldn't be concurrent writes to what's being copied
    // here.
    // This is one point we should revisit in the future if we want to relax the concurrency
    // of jobs: different calls running concurrently on the same contract may cause trouble.
    return this.#store.transactionAsync(async () => {
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
    });
  }

  setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string) {
    // This transactional context in theory isn't so critical now because we aren't
    // writing to DB so if there's exceptions midway and it blows up, no visible impact
    // to persistent storage will happen.
    // I'm leaving this transactional context here though because I'm assuming this
    // gives us "write array atomicity": there shouldn't be concurrent writes to what's being copied
    // here.
    // This is one point we should revisit in the future if we want to relax the concurrency
    // of jobs: different calls running concurrently on the same contract may cause trouble.
    return this.#store.transactionAsync(async () => {
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
    });
  }
}

function dbSlotToKey(contractAddress: AztecAddress, slot: Fr): string {
  return `${contractAddress.toString()}:${slot.toString()}`;
}

function arraySlot(baseSlot: Fr, index: number) {
  return baseSlot.add(new Fr(1)).add(new Fr(index));
}
