import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import type { P2PClient } from './p2p.js';

/** Provides basic operations for ProverNodes to interact with other nodes in the network. */
export interface ProverCoordination {
  /**
   * Returns a set of transactions given their hashes if available.
   * @param txHashes - The hashes of the transactions, used as an ID.
   * @returns The transactions found, no necessarily in the same order as the hashes.
   */
  getTxsByHash(txHashes: TxHash[]): Promise<Tx[]>;

  gatherTxs(txHashes: TxHash[]): Promise<void>;

  getP2PClient(): P2PClient | undefined;
}
