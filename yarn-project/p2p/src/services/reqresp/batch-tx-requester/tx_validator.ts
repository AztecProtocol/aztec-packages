import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { TxValidator } from '@aztec/stdlib/tx';

import { createTxValidatorForOnDemandReceivedTxs } from '../../../msg_validators/index.js';
import type { TxValidationCache } from '../../../msg_validators/tx_validator/tx_validation_cache.js';

export interface BatchRequestTxValidatorConfig {
  l1ChainId: number;
  rollupVersion: number;
  proofVerifier: ClientProtocolCircuitVerifier;
  txValidationCache?: TxValidationCache;
}

export function createBatchRequestTxValidator(config: BatchRequestTxValidatorConfig): TxValidator {
  return createTxValidatorForOnDemandReceivedTxs(
    config.proofVerifier,
    {
      l1ChainId: config.l1ChainId,
      rollupVersion: config.rollupVersion,
    },
    /*bindings=*/ undefined,
    config.txValidationCache,
  );
}
