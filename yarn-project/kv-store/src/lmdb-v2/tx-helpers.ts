import type { ReadTransaction } from './read_transaction.js';
import type { AztecLMDBStoreV2 } from './store.js';
import type { WriteTransaction } from './write_transaction.js';

export function execInWriteTx<T>(store: AztecLMDBStoreV2, fn: (tx: WriteTransaction) => Promise<T>): Promise<T> {
  const currentWrite = store.getCurrentWriteTx();
  if (currentWrite) {
    return fn(currentWrite);
  } else {
    return store.transactionAsync(fn);
  }
}

export async function execInReadTx<T>(
  store: AztecLMDBStoreV2,
  fn: (tx: ReadTransaction) => T | Promise<T>,
): Promise<T> {
  const currentWrite = store.getCurrentWriteTx();
  if (currentWrite) {
    return await fn(currentWrite);
  } else {
    const tx = store.getReadTx();
    try {
      return await fn(tx);
    } finally {
      tx.close();
    }
  }
}
