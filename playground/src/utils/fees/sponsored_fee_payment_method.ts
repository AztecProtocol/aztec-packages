import type { FeePaymentMethod } from '@aztec/aztec.js';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import type { GasSettings } from '@aztec/stdlib/gas';

import { getDeployedSponsoredFPCAddress, getSponsoredFPCAddress, setupSponsoredFPC } from './sponsored_fpc.js';

/**
 * A payment method that uses the SponsoredFPCContract to pay the fee unconditionally.
 * This is primarily intended for testing and development environments.
 */
export class SponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(
    /**
     * Contract which will pay the fee.
     */
    private paymentContract: AztecAddress,
  ) {}

  /**
   * Creates a new SponsoredFeePaymentMethod by checking if SponsoredFPC exists in the sandbox,
   * and deploying it if it doesn't.
   * @param pxe - The PXE instance to use
   * @returns A new SponsoredFeePaymentMethod
   */
  static async new(pxe: PXE): Promise<SponsoredFeePaymentMethod> {
    try {
      // First try to get the existing SponsoredFPC from the sandbox
      let sponsoredFPC = await getDeployedSponsoredFPCAddress(pxe);

      // If the SponsoredFPC doesn't exist, deploy it
      if (!sponsoredFPC) {
        console.log('SponsoredFPC not found in sandbox, deploying...');
        try {
          const deployed = await setupSponsoredFPC(pxe, console.log);
          sponsoredFPC = deployed.address;
          console.log(`Successfully deployed SponsoredFPC at ${sponsoredFPC}`);
        } catch (error) {
          console.error('Failed to deploy SponsoredFPC:', error);
          // Fallback to the computed address even if deployment failed
          sponsoredFPC = await getSponsoredFPCAddress();
          console.log(`Using computed SponsoredFPC address: ${sponsoredFPC}`);
        }
      } else {
        console.log(`Using existing SponsoredFPC at ${sponsoredFPC}`);
      }

      return new SponsoredFeePaymentMethod(sponsoredFPC);
    } catch (error) {
      console.error('Error in SponsoredFeePaymentMethod.new:', error);
      // Last resort fallback to the computed address
      const address = await getSponsoredFPCAddress();
      console.log(`Using fallback SponsoredFPC address: ${address}`);
      return new SponsoredFeePaymentMethod(address);
    }
  }

  /**
   * Returns the asset that the fee is paid in.
   * FeeJuice is the protocol token used for fee payment.
   */
  getAsset(): Promise<AztecAddress> {
    return Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  /**
   * Returns the address of the contract that will pay the fee.
   */
  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Returns the execution payload that will be used to pay the fee.
   * This calls the sponsor_unconditionally function on the SponsoredFPC contract.
   * @param gasSettings - Gas settings for the transaction (not used in sponsored payments)
   */
  async getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload> {
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
}
