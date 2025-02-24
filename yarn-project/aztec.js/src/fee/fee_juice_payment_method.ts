import { type FunctionCall } from '@aztec/circuit-types';
import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type FeePaymentMethod } from './fee_payment_method.js';

// docs:start:fee_juice_method
/**
 * Pay fee directly in the Fee Juice.
 */
export class FeeJuicePaymentMethod implements FeePaymentMethod {
  // docs:end:fee_juice_method
  constructor(protected sender: AztecAddress) {}

  getAsset() {
    return Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  getFunctionCalls(): Promise<FunctionCall[]> {
    return Promise.resolve([]);
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }
}
