import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export class SponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(private paymentContract: AztecAddress) {}

  /**
   * Gets the asset used for fee payment.
   * For sponsored payments, this is not applicable as the sponsor covers all fees.
   *
   * @throws Always throws an error as sponsored payments don't require an asset.
   */
  getAsset(): Promise<AztecAddress> {
    throw new Error('Asset is not required for sponsored fpc.');
  }

  /**
   * Gets the address of the fee payer contract.
   *
   * @returns The address of the sponsoring payment contract.
   */
  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates an execution payload for unconditional fee sponsorship.
   * The sponsor will pay fees regardless of transaction outcome.
   *
   * @returns An execution payload containing the sponsor_unconditionally function call.
   */
  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        {
          name: 'sponsor_unconditionally',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('sponsor_unconditionally()'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [],
          returnTypes: [],
        },
      ],
      [],
      [],
    );
  }

  /**
   * Gets the gas settings for this payment method.
   * Sponsored payments don't specify gas settings as the sponsor handles it.
   *
   * @returns undefined as sponsored payments don't require gas settings.
   */
  getGasSettings(): GasSettings | undefined {
    return;
  }
}
