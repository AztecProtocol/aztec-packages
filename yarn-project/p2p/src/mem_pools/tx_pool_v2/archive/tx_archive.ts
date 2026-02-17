import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { ChonkProof } from '@aztec/stdlib/proofs';
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
  async archiveTxs(txs: Tx[]): Promise<void> {
    if (!this.isEnabled() || txs.length === 0) {
      return;
    }

    try {
      await this.#store.transactionAsync(async () => {
        // Get current head and tail indices
        let headIdx = await this.getHeadIndex();
        let tailIdx = await this.getTailIndex();

        for (const tx of txs) {
          // Evict oldest entries if at capacity
          while (headIdx - tailIdx >= this.#limit) {
            const txHashToEvict = await this.#indices.getAsync(tailIdx);
            if (txHashToEvict) {
              await this.#txs.delete(txHashToEvict);
              await this.#indices.delete(tailIdx);
            }
            tailIdx++;
          }

          // Archive the transaction with stripped proof
          const archivedTx = this.stripProof(tx);
          const txHash = tx.getTxHash().toString();
          await this.#txs.set(txHash, archivedTx.toBuffer());
          await this.#indices.set(headIdx, txHash);
          headIdx++;
        }

        this.#log.debug(`Archived ${txs.length} txs, total: ${headIdx - tailIdx}`);
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

  /**
   * Strips the proof from a transaction for archival.
   */
  private stripProof(tx: Tx): Tx {
    return new Tx(tx.txHash, tx.data, ChonkProof.empty(), tx.contractClassLogFields, tx.publicFunctionCalldata);
  }

  private async getHeadIndex(): Promise<number> {
    const entry = await this.#indices.entriesAsync({ limit: 1, reverse: true }).next();
    return (entry.value?.[0] ?? -1) + 1;
  }

  private async getTailIndex(): Promise<number> {
    const entry = await this.#indices.entriesAsync({ limit: 1 }).next();
    return entry.value?.[0] ?? 0;
  }
}
