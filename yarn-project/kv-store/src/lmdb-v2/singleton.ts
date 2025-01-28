import { Encoder } from 'msgpackr';

import { type AztecAsyncSingleton } from '../interfaces/singleton.js';
import { AztecLMDBStoreV2 } from './store.js';
import { execInReadTx, execInWriteTx, serializeKey } from './utils.js';

export class LMDBSingleValue<T> implements AztecAsyncSingleton<T> {
  private key: Uint8Array;
  private encoder = new Encoder();
  constructor(private store: AztecLMDBStoreV2, name: string) {
    this.key = serializeKey(`singleton:${name}`, 'value');
  }

  getAsync(): Promise<T | undefined> {
    return execInReadTx(this.store, async tx => {
      const val = await tx.get(this.key);
      return val ? this.encoder.unpack(val) : undefined;
    });
  }

  set(val: T): Promise<boolean> {
    return execInWriteTx(this.store, async tx => {
      await tx.set(this.key, this.encoder.pack(val));
      return true;
    });
  }

  delete(): Promise<boolean> {
    return execInWriteTx(this.store, async tx => {
      await tx.remove(this.key);
      return true;
    });
  }
}
