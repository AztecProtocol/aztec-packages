import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

import type { FeePaymentMethod } from './fee_payment_method.js';

/**
 * Pay fee directly in the Fee Juice.
 */
export class FeeJuicePaymentMethod implements FeePaymentMethod {
  constructor(protected sender: AztecAddress) {}

  getAsset() {
    return Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  getExecutionPayload(): Promise<ExecutionPayload> {
    return Promise.resolve(ExecutionPayload.empty());
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
