import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

import { createTxReqRespValidator } from '../../../msg_validators/tx_validator/factory.js';

export interface BatchRequestTxValidatorConfig {
  l1ChainId: number;
  rollupVersion: number;
  proofVerifier: ClientProtocolCircuitVerifier;
}

export interface IBatchRequestTxValidator {
  validateRequestedTx(tx: Tx): Promise<TxValidationResult>;
  validateRequestedTxs(txs: Tx[]): Promise<TxValidationResult[]>;
}

export class BatchRequestTxValidator implements IBatchRequestTxValidator {
  readonly txValidator: TxValidator;
  constructor(private readonly config: BatchRequestTxValidatorConfig) {
    this.txValidator = BatchRequestTxValidator.createRequestedTxValidator(this.config);
  }

  public async validateRequestedTx(tx: Tx): Promise<TxValidationResult> {
    return await this.txValidator.validateTx(tx);
  }

  public async validateRequestedTxs(txs: Tx[]): Promise<TxValidationResult[]> {
    return await Promise.all(txs.map(tx => this.validateRequestedTx(tx)));
  }

  static createRequestedTxValidator(config: BatchRequestTxValidatorConfig): TxValidator {
    return createTxReqRespValidator(config.proofVerifier, {
      l1ChainId: config.l1ChainId,
      rollupVersion: config.rollupVersion,
    });
  }
}
