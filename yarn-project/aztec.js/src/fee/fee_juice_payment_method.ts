import { type FunctionCall } from '@aztec/circuit-types';
import { type AztecAddress } from '@aztec/circuits.js';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type FeePaymentMethod } from './fee_payment_method.js';

/**
 * Pay fee directly in the Fee Juice.
 */
export class FeeJuicePaymentMethod implements FeePaymentMethod {
  constructor(protected sender: AztecAddress) {}

  getAsset() {
    return ProtocolContractAddress.FeeJuice;
  }

  getFunctionCalls(): Promise<FunctionCall[]> {
    return Promise.resolve([]);
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }
}
