import { type AttestationPool } from './attestation_pool/attestation_pool.js';
import { type EpochProofQuotePool } from './epoch_proof_quote_pool/epoch_proof_quote_pool.js';
import { type TxPool } from './tx_pool/tx_pool.js';

/**
 * A interface the combines all mempools
 */
export interface MemPools {
  txPool: TxPool;
  attestationPool: AttestationPool;
  epochProofQuotePool: EpochProofQuotePool;
}
