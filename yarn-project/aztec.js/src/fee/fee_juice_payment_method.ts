import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionCall } from '@aztec/stdlib/abi';
import { type AztecAddress } from '@aztec/stdlib/aztec-address';

import { type FeePaymentMethod } from './fee_payment_method.js';

/**
 * Pay fee directly in the Fee Juice.
 */
export class FeeJuicePaymentMethod implements FeePaymentMethod {
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
