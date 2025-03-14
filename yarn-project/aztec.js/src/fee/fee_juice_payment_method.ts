import type { ExecutionPayload, ExecutionRequestInit, FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
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
    return Promise.resolve({ calls: [], authWitnesses: [], capsules: [] });
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }
}
