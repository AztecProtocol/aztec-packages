import { Fr } from '@aztec/foundation/fields';
import { type FunctionCall } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

import type { Wallet } from '../account/wallet.js';
import { SignerlessWallet } from '../wallet/signerless_wallet.js';
import { FPCContract, TokenContract } from './contracts/index.js';
import type { FeePaymentMethod } from './fee_payment_method.js';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PrivateFeePaymentMethod implements FeePaymentMethod {
  private assetPromise: Promise<AztecAddress> | null = null;

  constructor(
    /**
     * Address which will hold the fee payment.
     */
    private paymentContract: AztecAddress,

    /**
     * An auth witness provider to authorize fee payments
     */
    private wallet: Wallet,

    /**
     * If true, the max fee will be set to 1.
     * TODO(#7694): Remove this param once the lacking feature in TXE is implemented.
     */
    private setMaxFeeToOne = false,
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
    // We assume 1:1 exchange rate between fee juice and token. But in reality you would need to convert feeLimit
    // (maxFee) to be in token denomination.
    const maxFee = this.setMaxFeeToOne ? 1n : gasSettings.getFeeLimit().toBigInt();
    const nonce = Fr.random();

    // Add authwit such that the FPC can transfer our balance of fee token to itself.
    {
      const feeToken = await TokenContract.at(await this.getAsset(), this.wallet);
      const action = feeToken.methods.transfer_to_public(this.wallet.getAddress(), this.paymentContract, maxFee, nonce);

      const witness = await this.wallet.createAuthWit({ caller: this.paymentContract, action });
      await this.wallet.addAuthWitness(witness);
    }

    const fpc = await FPCContract.at(this.paymentContract, this.wallet);
    const action = fpc.methods.fee_entrypoint_private(maxFee, nonce);
    return [await action.request()];
  }
}
