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

/**
 * Picks the transaction an ambient read should run against: the enclosing write transaction so uncommitted writes are
 * visible, else the enclosing read-only snapshot, else a fresh one-shot transaction. `shouldClose` is true only for
 * that last case — the caller must not close a transaction it did not open.
 */
export function acquireReadTx(store: AztecLMDBStoreV2): { tx: ReadTransaction; shouldClose: boolean } {
  const currentWrite = store.getCurrentWriteTx();
  if (currentWrite) {
    return { tx: currentWrite, shouldClose: false };
  }

  const currentRead = store.getCurrentReadTx();
  if (currentRead) {
    return { tx: currentRead, shouldClose: false };
  }

  return { tx: store.getReadTx(), shouldClose: true };
}

export async function execInReadTx<T>(
  store: AztecLMDBStoreV2,
  fn: (tx: ReadTransaction) => T | Promise<T>,
): Promise<T> {
  const { tx, shouldClose } = acquireReadTx(store);
  try {
    return await fn(tx);
  } finally {
    if (shouldClose) {
      tx.close();
    }
  }
}
