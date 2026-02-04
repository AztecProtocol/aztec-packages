import type { AttestationPool } from './attestation_pool/attestation_pool.js';
import type { TxPoolV2 } from './tx_pool_v2/interfaces.js';

/**
 * A interface the combines all mempools
 */
export type MemPools = {
  txPool: TxPoolV2;
  attestationPool: AttestationPool;
};
