import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { BaseStagingStore, type ReadonlyDb } from '../base_staging_store.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';

export class CapsuleStore extends BaseStagingStore<CapsuleStoreChangeSet, CapsuleStoreDb> {
  logger: Logger;

  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'capsule',
      store,
      buildChangeSet: () => new Map(),
      buildDb: db => ({
        capsules: db.openMap('capsules'),
      }),
    });

    this.logger = createLogger('pxe:capsule-data-provider');
  }

  /**
   * Reads a capsule's slot from the change set's staged data.
   *
   * If it is not there, it reads it from the KV store.
   * @returns The slot's contents, or `null` when the slot holds no capsule, whether it was never written or was
   * deleted in the change set.
   */
  async #readSlot(
    changeSet: CapsuleStoreChangeSet,
    db: ReadonlyDb<CapsuleStoreDb>,
    dbSlotKey: string,
  ): Promise<Buffer | null> {
    const staged: Buffer | null | undefined = changeSet.get(dbSlotKey);

    // Always issue DB read to keep IndexedDB transaction alive, even if the value is in the staged data. This
    // keeps IndexedDB transactions alive (they auto-commit when a new micro-task starts and there are no pending read
    // requests). The staged value still takes precedence if it exists (including null for deletions).
    const dbValue = (await db.capsules.getAsync(dbSlotKey)) ?? null;

    return staged !== undefined ? staged : dbValue;
  }

  /**
   * Writes a capsule to the staging area.
   */
  #writeCapsule(
    changeSet: CapsuleStoreChangeSet,
    contractAddress: AztecAddress,
    slot: Fr,
    capsule: Fr[],
    scope: AztecAddress,
  ) {
    changeSet.set(dbSlotToKey(contractAddress, slot, scope), packCapsule(capsule));
  }

  /**
   * Deletes a capsule on the staging area. Note the capsule will still
   * exist in storage until the change set is committed.
   */
  #deleteCapsule(changeSet: CapsuleStoreChangeSet, contractAddress: AztecAddress, slot: Fr, scope: AztecAddress) {
    changeSet.set(dbSlotToKey(contractAddress, slot, scope), null);
  }

  protected async flushChangeSet(changeSet: CapsuleStoreChangeSet, db: CapsuleStoreDb): Promise<void> {
    for (const [key, value] of changeSet) {
      // In the write stage, we represent deleted capsules with null
      // (as opposed to undefined, which denotes there was never a capsule there to begin with).
      // So we delete from actual KV store here.
      if (value === null) {
        await db.capsules.delete(key);
      } else {
        await db.capsules.set(key, value);
      }
    }
  }

  /** No-op: capsules are not anchored to a block, so a prune cannot orphan any of them. */
  protected applyRollback(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`.
   * * If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @param changeSetId - The context in which this store will be visible until PXE decides to persist it to underlying
   * KV store
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  setCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    capsule: Fr[],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    // A store overrides any pre-existing data on the slot
    return this.withChangeSet(changeSetId, changeSet => {
      this.#writeCapsule(changeSet, contractAddress, slot, capsule, scope);
    });
  }

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  getCapsule(
    contractAddress: AztecAddress,
    slot: Fr,
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<Fr[] | null> {
    return this.withChangeSetAndDb(changeSetId, (changeSet, db) =>
      this.#readCapsule(changeSet, db, contractAddress, slot, scope),
    );
  }

  /** Same as getCapsule but operating on an already entered change set, for use by the other operations. */
  async #readCapsule(
    changeSet: CapsuleStoreChangeSet,
    db: ReadonlyDb<CapsuleStoreDb>,
    contractAddress: AztecAddress,
    slot: Fr,
    scope: AztecAddress,
  ): Promise<Fr[] | null> {
    const dataBuffer = await this.#readSlot(changeSet, db, dbSlotToKey(contractAddress, slot, scope));
    if (!dataBuffer) {
      this.logger.trace(`Data not found for contract ${contractAddress.toString()} and slot ${slot.toString()}`);
      return null;
    }
    return BufferReader.asReader(dataBuffer).readArray(dataBuffer.length / Fr.SIZE_IN_BYTES, Fr);
  }

  /**
   * Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to delete.
   */
  deleteCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: ChangeSetId, scope: AztecAddress): Promise<void> {
    // When we commit this, we will interpret null as a deletion, so we'll propagate the delete to the KV store
    return this.withChangeSet(changeSetId, changeSet => {
      this.#deleteCapsule(changeSet, contractAddress, slot, scope);
    });
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
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // In order to support overlapping source and destination regions, we need to check the relative positions of source
      // and destination. If destination is ahead of source, then by the time we overwrite source elements using forward
      // indexes we'll have already read those. On the contrary, if source is ahead of destination we need to use backward
      // indexes to avoid reading elements that've been overwritten.
      const indexes = Array.from(Array(numEntries).keys());
      if (srcSlot.lt(dstSlot)) {
        indexes.reverse();
      }

      for (const i of indexes) {
        const currentSrcSlot = dbSlotToKey(contractAddress, srcSlot.add(new Fr(i)), scope);
        const currentDstSlot = dbSlotToKey(contractAddress, dstSlot.add(new Fr(i)), scope);

        const toCopy = await this.#readSlot(changeSet, db, currentSrcSlot);
        if (!toCopy) {
          throw new Error(`Attempted to copy empty slot ${currentSrcSlot} for contract ${contractAddress.toString()}`);
        }

        changeSet.set(currentDstSlot, toCopy);
      }
    });
  }

  /**
   * Appends multiple capsules to a capsule array stored at the base slot.
   * The array length is stored at the base slot, and elements are stored in consecutive slots after it.
   * @param contractAddress - The contract address that owns the capsule array
   * @param baseSlot - The slot where the array length is stored
   * @param content - Array of capsule data to append
   */
  appendToCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // Load current length, defaulting to 0 if not found
      const lengthData = await this.#readCapsule(changeSet, db, contractAddress, baseSlot, scope);
      const currentLength = lengthData ? lengthData[0].toNumber() : 0;

      // Store each capsule at consecutive slots after baseSlot + 1 + currentLength
      for (let i = 0; i < content.length; i++) {
        const nextSlot = arraySlot(baseSlot, currentLength + i);
        this.#writeCapsule(changeSet, contractAddress, nextSlot, content[i], scope);
      }

      // Update length to include all new capsules
      const newLength = currentLength + content.length;
      this.#writeCapsule(changeSet, contractAddress, baseSlot, [new Fr(newLength)], scope);
    });
  }

  readCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<Fr[][]> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // Load length, defaulting to 0 if not found
      const maybeLength = await this.#readCapsule(changeSet, db, contractAddress, baseSlot, scope);
      const length = maybeLength ? maybeLength[0].toBigInt() : 0n;

      const values: Fr[][] = [];

      // Read each capsule at consecutive slots after baseSlot
      for (let i = 0; i < length; i++) {
        const currentValue = await this.#readCapsule(changeSet, db, contractAddress, arraySlot(baseSlot, i), scope);
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

  setCapsuleArray(
    contractAddress: AztecAddress,
    baseSlot: Fr,
    content: Fr[][],
    changeSetId: ChangeSetId,
    scope: AztecAddress,
  ): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // Load current length, defaulting to 0 if not found
      const maybeLength = await this.#readCapsule(changeSet, db, contractAddress, baseSlot, scope);
      const originalLength = maybeLength ? maybeLength[0].toNumber() : 0;

      // Set the new length
      this.#writeCapsule(changeSet, contractAddress, baseSlot, [new Fr(content.length)], scope);

      // Store the new content, possibly overwriting existing values
      for (let i = 0; i < content.length; i++) {
        this.#writeCapsule(changeSet, contractAddress, arraySlot(baseSlot, i), content[i], scope);
      }

      // Clear any stragglers
      for (let i = content.length; i < originalLength; i++) {
        this.#deleteCapsule(changeSet, contractAddress, arraySlot(baseSlot, i), scope);
      }
    });
  }
}

function dbSlotToKey(contractAddress: AztecAddress, slot: Fr, scope: AztecAddress): string {
  return [contractAddress.toString(), scope.toString(), slot.toString()].join(':');
}

function arraySlot(baseSlot: Fr, index: number) {
  return baseSlot.add(new Fr(1)).add(new Fr(index));
}

function packCapsule(capsule: Fr[]): Buffer {
  return serializeToBuffer(capsule);
}

/**
 * A change set's staged capsules, keyed as `${contractAddress}:${scope}:${slot}`. A `null` value signals that the
 * capsule was deleted during the change set, so it needs to be deleted on commit.
 */
type CapsuleStoreChangeSet = Map<string, Buffer | null>;

type CapsuleStoreDb = {
  // Arbitrary data stored by contracts. Key is computed as `${contractAddress}:${scope}:${slot}`, using the zero
  // address for the global scope.
  capsules: AztecAsyncMap<string, Buffer>;
};
