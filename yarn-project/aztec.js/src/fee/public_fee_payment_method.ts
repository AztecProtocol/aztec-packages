import { Fr } from '@aztec/foundation/fields';
import type { FunctionCall } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

import type { AccountWallet } from '../wallet/account_wallet.js';
import { SignerlessWallet } from '../wallet/signerless_wallet.js';
import { FPCContract, TokenContract } from './contracts/index.js';
import type { FeePaymentMethod } from './fee_payment_method.js';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PublicFeePaymentMethod implements FeePaymentMethod {
  private assetPromise: Promise<AztecAddress> | null = null;

  constructor(
    /**
     * Address which will hold the fee payment.
     */
    protected paymentContract: AztecAddress,
    /**
     * An auth witness provider to authorize fee payments
     */
    protected wallet: AccountWallet,
  ) {}

  /**
   * The asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset(): Promise<AztecAddress> {
    if (!this.assetPromise) {
      // We use signer-less wallet because this function could be triggered before the associated account is deployed.
      const signerlessWallet = new SignerlessWallet(this.wallet);
      const fpc = FPCContract.at(this.paymentContract, signerlessWallet);
      this.assetPromise = fpc.then((contract: FPCContract) => contract.methods.get_accepted_asset().simulate());
    }
    return this.assetPromise!;
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas settings.
   * @returns The function call to pay the fee.
   */
  async getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    const nonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit().toBigInt();

    // Add authwit such that the FPC can transfer our balance of fee token to itself
    const feeToken = await TokenContract.at(await this.getAsset(), this.wallet);
    const tokenAction = feeToken.methods.transfer_in_public(
      this.wallet.getAddress(),
      this.paymentContract,
      maxFee,
      nonce,
    );

    const witness = await this.wallet.setPublicAuthWit(
      {
        caller: this.paymentContract,
        action: await tokenAction.request(),
      },
      true,
    );

    const fpc = await FPCContract.at(this.paymentContract, this.wallet);
    const fpcAction = fpc.methods.fee_entrypoint_public(maxFee, nonce);

    return [await witness.request(), await fpcAction.request()];
  }
}
