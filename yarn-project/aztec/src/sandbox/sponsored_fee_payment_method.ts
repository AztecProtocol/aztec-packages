import type { FeePaymentMethod } from '@aztec/aztec.js';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import { getDeployedSponsoredFPCAddress } from './sponsored_fpc.js';

/**
 * A payment method that uses the SponsoredFPCContract to pay the fee unconditionally.
 */
export class SponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(
    /**
     * Contract which will pay the fee.
     */
    private paymentContract: AztecAddress,
  ) {}

  static async new(pxe: PXE) {
    const sponsoredFPC = await getDeployedSponsoredFPCAddress(pxe);
    return new SponsoredFeePaymentMethod(sponsoredFPC);
  }

  getAsset(): Promise<AztecAddress> {
    return Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  async getFunctionCalls(): Promise<FunctionCall[]> {
    return [
      {
        name: 'sponsor_unconditionally',
        to: this.paymentContract,
        selector: await FunctionSelector.fromSignature('sponsor_unconditionally()'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [],
        returnTypes: [],
      },
    ];
  }
}
