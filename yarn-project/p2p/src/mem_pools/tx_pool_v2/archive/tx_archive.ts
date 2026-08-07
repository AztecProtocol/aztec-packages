import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { Tx, TxHash } from '@aztec/stdlib/tx';

/**
 * Manages archived transactions with FIFO eviction.
 * Archived transactions have their proofs stripped to save space.
 */
export class TxArchive {
  #store: AztecAsyncKVStore;
  #txs: AztecAsyncMap<string, Buffer>;
  #indices: AztecAsyncMap<number, string>;
  #limit: number;
  #log: Logger;

  constructor(store: AztecAsyncKVStore, limit: number, log?: Logger) {
    this.#store = store;
    this.#txs = store.openMap('archivedTxs');
    this.#indices = store.openMap('archivedTxIndices');
    this.#limit = limit;
    this.#log = log ?? createLogger('p2p:tx_pool_v2:archive');
  }

  /**
   * Updates the maximum number of archived transactions.
   */
  updateLimit(limit: number): void {
    this.#limit = limit;
  }

  /**
   * Gets the current archive limit.
   */
  getLimit(): number {
    return this.#limit;
  }

  /**
   * Checks if archiving is enabled.
   */
  isEnabled(): boolean {
    return this.#limit > 0;
  }

  /**
   * Archives transactions, stripping their proofs.
   * Evicts oldest transactions if the limit is exceeded.
   */
  archiveTxs(txs: Tx[]): Promise<void> {
    return this.archiveTxBuffers(
      txs.map(tx => ({ txHash: tx.getTxHash().toString(), buffer: tx.withoutProof().toBuffer() })),
    );
  }

  /**
   * Archives already-serialized proof-less tx buffers, avoiding any deserialization. This is the
   * hot path used at finalization time, where the pool already stores txs proof-stripped.
   * Evicts oldest transactions if the limit is exceeded.
   */
  async archiveTxBuffers(entries: { txHash: string; buffer: Buffer }[]): Promise<void> {
    if (!this.isEnabled() || entries.length === 0) {
      return;
    }

    try {
      await this.#store.transactionAsync(async () => {
        // Get current head and tail indices
        let headIdx = await this.getHeadIndex();
        let tailIdx = await this.getTailIndex();

        for (const { txHash, buffer } of entries) {
          // Evict oldest entries if at capacity
          while (headIdx - tailIdx >= this.#limit) {
            const txHashToEvict = await this.#indices.getAsync(tailIdx);
            if (txHashToEvict) {
              await this.#txs.delete(txHashToEvict);
              await this.#indices.delete(tailIdx);
            }
            tailIdx++;
          }

          await this.#txs.set(txHash, buffer);
          await this.#indices.set(headIdx, txHash);
          headIdx++;
        }

        this.#log.debug(`Archived ${entries.length} txs, total: ${headIdx - tailIdx}`);
      });
    } catch (error) {
      this.#log.error('Error archiving transactions', { error });
    }
  }

  /**
   * Retrieves an archived transaction by its hash.
   */
  async getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    const buffer = await this.#txs.getAsync(txHash.toString());
    return buffer ? Tx.fromBuffer(buffer) : undefined;
  }

  /**
   * Gets the current count of archived transactions.
   */
  async getCount(): Promise<number> {
    const head = await this.getHeadIndex();
    const tail = await this.getTailIndex();
    return head - tail;
  }

  // NOTE: these must consume the iterator via for-await so the underlying LMDB cursor is closed.
  // Calling .next() once and abandoning the generator leaks a cursor slot: inside a write
  // transaction the committed-state iterator is unbounded (the limit is applied by the wrapper),
  // and the abandoned generator never runs its finally block, so CLOSE_CURSOR is never sent. The
  // store has maxReaders - 1 cursor slots; leaking them deadlocks every later iteration on the store.
  private async getHeadIndex(): Promise<number> {
    for await (const [index] of this.#indices.entriesAsync({ limit: 1, reverse: true })) {
      return index + 1;
    }
    return 0;
  }

  private async getTailIndex(): Promise<number> {
    for await (const [index] of this.#indices.entriesAsync({ limit: 1 })) {
      return index;
    }
    return 0;
  }
}
