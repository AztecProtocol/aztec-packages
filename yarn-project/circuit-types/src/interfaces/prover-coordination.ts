import { type EpochProofQuote } from '../prover_coordination/index.js';
import { type Tx } from '../tx/tx.js';
import { type TxHash } from '../tx/tx_hash.js';

/** Provides basic operations for ProverNodes to interact with other nodes in the network. */
export interface ProverCoordination {
  /**
   * Returns a transaction given its hash if available.
   * @param txHash - The hash of the transaction, used as an ID.
   * @returns The transaction, if found, 'undefined' otherwise.
   */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /**
   * Receives a quote for an epoch proof and stores it in its EpochProofQuotePool
   * @param quote - The quote to store
   */
  addEpochProofQuote(quote: EpochProofQuote): Promise<void>;
}
