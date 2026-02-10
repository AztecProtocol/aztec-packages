import type { AttestationPoolApi } from './attestation_pool/attestation_pool.js';
import type { TxPool } from './tx_pool/tx_pool.js';

/**
 * A interface the combines all mempools
 */
export type MemPools = {
  txPool: TxPool;
  attestationPool: AttestationPoolApi;
};
