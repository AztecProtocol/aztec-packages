import { TxHash } from '@aztec/stdlib/tx';
import type { Tx } from '@aztec/stdlib/tx';

/**
 * Tracks which transactions are still missing and need to be fetched.
 * Allows external code to mark transactions as fetched, enabling coordination
 * between multiple fetching mechanisms (e.g., BatchTxRequester and Rpc Node requests).
 */
export interface IMissingTxsTracker {
  /** Returns the set of transaction hashes that are still missing. */
  get missingTxHashes(): Set<string>;
  /** Size of this.missingTxHashes */
  get numberOfMissingTxs(): number;
  /** Are all requested txs are fetched */
  allFetched(): boolean;
  /** Checks that transaction is still missing */
  isMissing(txHash: string): boolean;
  /** Marks a transaction as fetched. Returns true if it was previously missing. */
  markFetched(tx: Tx): boolean;
  /** Get list of collected txs */
  get collectedTxs(): Tx[];
}

export class MissingTxsTracker implements IMissingTxsTracker {
  public readonly collectedTxs: Tx[] = [];

  private constructor(public readonly missingTxHashes: Set<string>) {}

  public static fromArray(hashes: TxHash[] | string[]) {
    return new MissingTxsTracker(new Set(hashes.map(hash => hash.toString())));
  }

  markFetched(tx: Tx): boolean {
    if (this.missingTxHashes.delete(tx.txHash.toString())) {
      this.collectedTxs.push(tx);
      return true;
    }
    return false;
  }

  get numberOfMissingTxs(): number {
    return this.missingTxHashes.size;
  }

  allFetched(): boolean {
    return this.numberOfMissingTxs === 0;
  }

  isMissing(txHash: string): boolean {
    return this.missingTxHashes.has(txHash.toString());
  }
}
