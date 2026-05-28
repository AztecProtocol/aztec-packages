import type { AztecAsyncBinaryMap, BinaryMapRange } from '../interfaces/binary_map.js';
import type { ReadTransaction } from './read_transaction.js';
import type { AztecLMDBStoreV2 } from './store.js';
import { execInReadTx, execInWriteTx } from './tx-helpers.js';
import { binaryMapPrefix, deserializeRawKey, maxRawKey, minRawKey, serializeRawKey } from './utils.js';

/**
 * A map keyed by raw `Uint8Array` byte buffers, with raw `Uint8Array` values. Keys are stored as
 * `prefix ++ rawKey`, where `prefix` is a length-prefixed namespace derived from the map's name, and
 * LMDB's default bytewise (`memcmp`) ordering gives the natural composite-key ordering for free.
 *
 * The per-kind value codec is the caller's responsibility — this map does no encoding of its own.
 */
export class LMDBBinaryMap implements AztecAsyncBinaryMap {
  private readonly prefix: Buffer;

  constructor(
    private store: AztecLMDBStoreV2,
    name: string,
  ) {
    this.prefix = binaryMapPrefix(`bmap:${name}`);
  }

  set(key: Uint8Array, value: Uint8Array): Promise<void> {
    return execInWriteTx(this.store, tx => tx.set(serializeRawKey(this.prefix, key), value));
  }

  delete(key: Uint8Array): Promise<void> {
    return execInWriteTx(this.store, tx => tx.remove(serializeRawKey(this.prefix, key)));
  }

  getAsync(key: Uint8Array): Promise<Uint8Array | undefined> {
    return execInReadTx(this.store, async tx => {
      const val = await tx.get(serializeRawKey(this.prefix, key));
      return val ?? undefined;
    });
  }

  hasAsync(key: Uint8Array): Promise<boolean> {
    return execInReadTx(this.store, async tx => (await tx.get(serializeRawKey(this.prefix, key))) !== undefined);
  }

  async *entriesAsync(range?: BinaryMapRange): AsyncIterableIterator<[Uint8Array, Uint8Array]> {
    const reverse = range?.reverse ?? false;

    const startKey = range?.start !== undefined ? serializeRawKey(this.prefix, range.start) : minRawKey(this.prefix);

    const endKey =
      range?.end !== undefined ? serializeRawKey(this.prefix, range.end) : reverse ? maxRawKey(this.prefix) : undefined;

    let tx: ReadTransaction | undefined = this.store.getCurrentWriteTx();
    const shouldClose = !tx;
    tx ??= this.store.getReadTx();

    try {
      for await (const [key, val] of tx.iterate(
        reverse ? endKey! : startKey,
        reverse ? startKey : endKey,
        reverse,
        range?.limit,
      )) {
        const userKey = deserializeRawKey(this.prefix, key);
        if (userKey === false) {
          break;
        }
        yield [userKey, val];
      }
    } finally {
      if (shouldClose) {
        tx.close();
      }
    }
  }
}
