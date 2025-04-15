import type { P2PClientType } from '@aztec/stdlib/p2p';

import type { AttestationPool } from './attestation_pool/attestation_pool.js';
import type { TxPool } from './tx_pool/tx_pool.js';

/**
 * A interface the combines all mempools
 */
export type MemPools<T extends P2PClientType = P2PClientType.Full> = {
  txPool: TxPool;
  attestationPool?: T extends P2PClientType.Full ? AttestationPool : undefined;
};
