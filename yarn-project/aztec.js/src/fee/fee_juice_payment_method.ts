import type { FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

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

  getExecutionPayload(): Promise<ExecutionPayload> {
    return Promise.resolve(ExecutionPayload.empty());
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }
}
