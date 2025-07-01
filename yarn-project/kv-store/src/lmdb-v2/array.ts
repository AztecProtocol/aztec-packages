import { Encoder } from 'msgpackr/pack';

import type { AztecAsyncArray } from '../interfaces/array.js';
import type { Value } from '../interfaces/common.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { ReadTransaction } from './read_transaction.js';
// eslint-disable-next-line import/no-cycle
import { AztecLMDBStoreV2, execInReadTx, execInWriteTx } from './store.js';
import { deserializeKey, serializeKey } from './utils.js';

export class LMDBArray<T extends Value> implements AztecAsyncArray<T> {
  private length: AztecAsyncSingleton<number>;
  private encoder = new Encoder();
  private prefix: string;

  constructor(
    private store: AztecLMDBStoreV2,
    name: string,
  ) {
    this.length = store.openSingleton(name + ':length');
    this.prefix = `array:${name}`;
  }

  pop(): Promise<T | undefined> {
    return execInWriteTx(this.store, async tx => {
      const length = await this.lengthAsync();
      if (length === 0) {
        return;
      }

      const val = await tx.get(serializeKey(this.prefix, length - 1));
      await tx.remove(serializeKey(this.prefix, length - 1));

      await this.length.set(length - 1);

      return val ? this.encoder.unpack(val) : undefined;
    });
  }

  push(...vals: T[]): Promise<number> {
    return execInWriteTx(this.store, async tx => {
      let length = await this.lengthAsync();
      for (const val of vals) {
        await tx.set(serializeKey(this.prefix, length++), this.encoder.pack(val));
      }
      await this.length.set(length);
      return length;
    });
  }

  setAt(index: number, val: T): Promise<boolean> {
    return execInWriteTx(this.store, async tx => {
      const length = await this.lengthAsync();
      if (index < 0) {
        index += length;
      }
      if (index < 0 || index >= length) {
        return false;
      }
      await tx.set(serializeKey(this.prefix, index), this.encoder.pack(val));
      return true;
    });
  }

  atAsync(index: number): Promise<T | undefined> {
    return execInReadTx(this.store, async tx => {
      const length = await this.lengthAsync();
      if (index < 0) {
        index += length;
      }
      if (index < 0 || index >= length) {
        return undefined;
      }

      const val = await tx.get(serializeKey(this.prefix, index));
      return val ? this.encoder.unpack(val) : undefined;
    });
  }

  async lengthAsync(): Promise<number> {
    return (await this.length.getAsync()) ?? 0;
  }

  async *entriesAsync(): AsyncIterableIterator<[number, T]> {
    // pin array length so that pushes don't affect iteration
    const length = await this.lengthAsync();
    if (length === 0) {
      return;
    }

    let tx: ReadTransaction | undefined = this.store.getCurrentWriteTx();
    const shouldClose = !tx;
    tx ??= this.store.getReadTx();

    try {
      for await (const [key, val] of tx.iterate(serializeKey(this.prefix, 0), undefined, false, length)) {
        const deserializedKey = deserializeKey<number>(this.prefix, key);
        // if pops happened while iterating we may have read too much. Terminate early
        if (deserializedKey === false) {
          break;
        }
        yield [deserializedKey, this.encoder.unpack(val)];
      }
    } finally {
      if (shouldClose) {
        tx.close();
      }
    }
  }

  async *valuesAsync(): AsyncIterableIterator<T> {
    for await (const [_, value] of this.entriesAsync()) {
      yield value;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this.valuesAsync();
  }
}
