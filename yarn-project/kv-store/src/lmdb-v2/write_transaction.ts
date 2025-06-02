import { type Batch, Database, LMDBMessageType } from './message.js';
import { ReadTransaction } from './read_transaction.js';
import {
  dedupeSortedArray,
  findInSortedArray,
  findIndexInSortedArray,
  insertIntoSortedArray,
  keyCmp,
  merge,
  removeAnyOf,
  removeFromSortedArray,
  singleKeyCmp,
} from './utils.js';

export class WriteTransaction extends ReadTransaction {
  // exposed for tests
  public readonly dataBatch: Batch = {
    addEntries: [],
    removeEntries: [],
  };
  public readonly indexBatch: Batch = {
    addEntries: [],
    removeEntries: [],
  };

  set(key: Uint8Array, value: Uint8Array): Promise<void> {
    this.assertIsOpen();

    const addEntry = findInSortedArray(this.dataBatch.addEntries, key, singleKeyCmp);
    if (!addEntry) {
      insertIntoSortedArray(this.dataBatch.addEntries, [key, [value]], keyCmp);
    } else {
      addEntry[1] = [value];
    }

    const removeEntryIndex = findIndexInSortedArray(this.dataBatch.removeEntries, key, singleKeyCmp);
    if (removeEntryIndex > -1) {
      this.dataBatch.removeEntries.splice(removeEntryIndex, 1);
    }

    return Promise.resolve();
  }

  remove(key: Uint8Array): Promise<void> {
    const removeEntryIndex = findIndexInSortedArray(this.dataBatch.removeEntries, key, singleKeyCmp);
    if (removeEntryIndex === -1) {
      this.dataBatch.removeEntries.push([key, null]);
    }

    const addEntryIndex = findIndexInSortedArray(this.dataBatch.addEntries, key, singleKeyCmp);
    if (addEntryIndex > -1) {
      this.dataBatch.addEntries.splice(addEntryIndex, 1);
    }

    return Promise.resolve();
  }

  public override async get(key: Buffer): Promise<Uint8Array | undefined> {
    this.assertIsOpen();

    const addEntry = findInSortedArray(this.dataBatch.addEntries, key, singleKeyCmp);
    if (addEntry) {
      return addEntry[1][0];
    }
    const removeEntryIdx = findIndexInSortedArray(this.dataBatch.removeEntries, key, singleKeyCmp);
    if (removeEntryIdx > -1) {
      return undefined;
    }

    return await super.get(key);
  }

  setIndex(key: Buffer, ...values: Buffer[]): Promise<void> {
    this.assertIsOpen();

    const addEntries = findInSortedArray(this.indexBatch.addEntries, key, singleKeyCmp);
    const removeEntries = findInSortedArray(this.indexBatch.removeEntries, key, singleKeyCmp);

    if (removeEntries) {
      if (removeEntries[1]) {
        // check if we were deleting these values and update
        removeAnyOf(removeEntries[1], values, Buffer.compare);
      }

      if (!removeEntries[1] || removeEntries[1].length === 0) {
        // either we were deleting the entire key previously
        // or after cleaning up duplicates, we don't have anything else to delete
        removeFromSortedArray(this.indexBatch.removeEntries, removeEntries, keyCmp);
      }
    }

    if (addEntries) {
      merge(addEntries[1], values, Buffer.compare);
      dedupeSortedArray(addEntries[1], Buffer.compare);
    } else {
      insertIntoSortedArray(this.indexBatch.addEntries, [key, values], keyCmp);
    }

    return Promise.resolve();
  }

  removeIndex(key: Buffer, ...values: Buffer[]): Promise<void> {
    this.assertIsOpen();

    const addEntries = findInSortedArray(this.indexBatch.addEntries, key, singleKeyCmp);
    const removeEntries = findInSortedArray(this.indexBatch.removeEntries, key, singleKeyCmp);

    if (values.length === 0) {
      // special case, we're deleting the entire key
      if (addEntries) {
        removeFromSortedArray(this.indexBatch.addEntries, addEntries, keyCmp);
      }

      if (removeEntries) {
        removeEntries[1] = null;
      } else {
        insertIntoSortedArray(this.indexBatch.removeEntries, [key, null], keyCmp);
      }

      return Promise.resolve();
    }

    if (addEntries) {
      removeAnyOf(addEntries[1], values, Buffer.compare);
      if (addEntries[1].length === 0) {
        removeFromSortedArray(this.indexBatch.addEntries, addEntries, keyCmp);
      }
    }

    if (removeEntries) {
      removeEntries[1] ??= [];
      merge(removeEntries[1], values, Buffer.compare);
      dedupeSortedArray(removeEntries[1], Buffer.compare);
    } else {
      insertIntoSortedArray(this.indexBatch.removeEntries, [key, values], keyCmp);
    }

    return Promise.resolve();
  }

  public override async getIndex(key: Buffer): Promise<Uint8Array[]> {
    this.assertIsOpen();

    const removeEntries = findInSortedArray(this.indexBatch.removeEntries, key, singleKeyCmp);
    if (removeEntries && removeEntries[1] === null) {
      return [];
    }

    const addEntries = findInSortedArray(this.indexBatch.addEntries, key, singleKeyCmp);
    const results = await super.getIndex(key);

    if (addEntries) {
      merge(results, addEntries[1], Buffer.compare);
      dedupeSortedArray(results, Buffer.compare);
    }

    if (removeEntries && Array.isArray(removeEntries[1])) {
      removeAnyOf(results, removeEntries[1], Buffer.compare);
    }

    return results;
  }

  public override async *iterate(
    startKey: Uint8Array,
    endKey?: Uint8Array,
    reverse?: boolean,
    limit?: number,
  ): AsyncIterable<[Uint8Array, Uint8Array]> {
    yield* this.#iterate(
      super.iterate(startKey, endKey, reverse),
      this.dataBatch,
      startKey,
      endKey,
      reverse,
      limit,
      (committed, toAdd) => (toAdd.length > 0 ? toAdd[0] : committed),
      vals => vals[0],
    );
  }

  public override async *iterateIndex(
    startKey: Uint8Array,
    endKey?: Uint8Array,
    reverse?: boolean,
    limit?: number,
  ): AsyncIterable<[Uint8Array, Uint8Array[]]> {
    yield* this.#iterate(
      super.iterateIndex(startKey, endKey, reverse),
      this.indexBatch,
      startKey,
      endKey,
      reverse,
      limit,
      (committed, toAdd, toRemove) => {
        if (toAdd.length > 0) {
          merge(committed, toAdd, Buffer.compare);
          dedupeSortedArray(committed, Buffer.compare);
        }
        if (toRemove.length > 0) {
          removeAnyOf(committed, toRemove, Buffer.compare);
        }
        return committed;
      },
      vals => vals,
    );
  }

  async *#iterate<T>(
    iterator: AsyncIterable<[Uint8Array, T]>,
    batch: Batch,
    startKey: Uint8Array,
    endKey: Uint8Array | undefined,
    reverse: boolean = false,
    limit: number | undefined,
    merge: (committed: T, toAdd: Uint8Array[], toRemove: Uint8Array[]) => T,
    map: (vals: Uint8Array[]) => T,
  ): AsyncIterable<[Uint8Array, T]> {
    this.assertIsOpen();

    // make a copy of this in case we're running in reverse
    const uncommittedEntries = [...batch.addEntries];
    // used to check we're in the right order when comparing between a key and uncommittedEntries
    let cmpDirection = -1;
    if (reverse) {
      cmpDirection = 1;
      uncommittedEntries.reverse();
    }

    let uncommittedEntriesIdx = 0;
    while (uncommittedEntriesIdx < uncommittedEntries.length) {
      const entry = uncommittedEntries[uncommittedEntriesIdx];
      // go to the first key in our cache that would be captured by the iterator
      if (Buffer.compare(entry[0], startKey) !== cmpDirection) {
        break;
      }
      uncommittedEntriesIdx++;
    }

    let count = 0;
    // helper to early return if we've reached our limit
    const checkLimit = typeof limit === 'number' ? () => count < limit : () => true;
    for await (const [key, values] of iterator) {
      // yield every key that we have cached that's captured by the iterator
      while (uncommittedEntriesIdx < uncommittedEntries.length && checkLimit()) {
        const entry = uncommittedEntries[uncommittedEntriesIdx];
        if (endKey && Buffer.compare(entry[0], endKey) !== cmpDirection) {
          break;
        }

        if (Buffer.compare(entry[0], key) === cmpDirection) {
          count++;
          yield [entry[0], map(entry[1])];
        } else {
          break;
        }
        uncommittedEntriesIdx++;
      }

      if (!checkLimit()) {
        // we reached the imposed `limit`
        break;
      }

      const toRemove = findInSortedArray(batch.removeEntries, key, singleKeyCmp);

      // at this point we've either exhausted all uncommitted entries,
      // we reached a key strictly greater/smaller than `key`
      // or we found the key itself
      // check if it's the key and use the uncommitted value
      let toAdd: Uint8Array[] = [];
      if (
        uncommittedEntriesIdx < uncommittedEntries.length &&
        Buffer.compare(uncommittedEntries[uncommittedEntriesIdx][0], key) === 0
      ) {
        toAdd = uncommittedEntries[uncommittedEntriesIdx][1];
        uncommittedEntriesIdx++;
      }

      if (toRemove && !toRemove[1]) {
        // we were told to delete this key entirely
        continue;
      } else {
        const mergedValues = merge(values, toAdd, toRemove?.[1] ?? []);
        if (mergedValues) {
          count++;
          yield [key, mergedValues];
        }
      }
    }

    // emit all the uncommitted data that would be captured by this iterator
    while (uncommittedEntriesIdx < uncommittedEntries.length && checkLimit()) {
      const entry = uncommittedEntries[uncommittedEntriesIdx];
      if (endKey && Buffer.compare(entry[0], endKey) !== cmpDirection) {
        break;
      }
      count++;
      yield [entry[0], map(entry[1])];
      uncommittedEntriesIdx++;
    }
  }

  public async commit() {
    this.assertIsOpen();
    this.close();
    await this.channel.sendMessage(LMDBMessageType.BATCH, {
      batches: new Map([
        [Database.DATA, this.dataBatch],
        [Database.INDEX, this.indexBatch],
      ]),
    });
  }
}
