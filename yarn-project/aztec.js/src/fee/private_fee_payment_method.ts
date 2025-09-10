import type { FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { Wallet } from '../wallet/wallet.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

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
    private sender: AztecAddress,

    /**
     * A wallet to perform the simulation to get the accepted asset
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
  async getAsset(): Promise<AztecAddress> {
    if (!this.assetPromise) {
      const abi = {
        name: 'get_accepted_asset',
        functionType: FunctionType.PRIVATE,
        isInternal: false,
        isStatic: false,
        parameters: [],
        returnTypes: [
          {
            kind: 'struct',
            path: 'authwit::aztec::protocol_types::address::aztec_address::AztecAddress',
            fields: [
              {
                name: 'inner',
                type: {
                  kind: 'field',
                },
              },
            ],
          },
        ],
        errorTypes: {},
        isInitializer: false,
      } as FunctionAbi;
      const interaction = new ContractFunctionInteraction(this.wallet, this.paymentContract, abi, []);

      const executionPayload = await interaction.request();
      this.assetPromise = this.wallet
        .simulateTx(executionPayload, {
          from: AztecAddress.ZERO,
          skipFeeEnforcement: true,
          fee: { paymentMethod: new FeeJuicePaymentMethod(AztecAddress.ZERO) },
        })
        .then(simulationResult => {
          const rawReturnValues = simulationResult.getPrivateReturnValues().nested[0].values;
          return decodeFromAbi(abi.returnTypes, rawReturnValues!);
        }) as Promise<AztecAddress>;
    }
    return this.assetPromise!;
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates an execution payload to pay the fee using a private function through an FPC in the desired asset
   * @param gasSettings - The gas settings.
   * @returns An execution payload that contains the required function calls and auth witnesses.
   */
  async getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload> {
    // We assume 1:1 exchange rate between fee juice and token. But in reality you would need to convert feeLimit
    // (maxFee) to be in token denomination.
    const maxFee = this.setMaxFeeToOne ? Fr.ONE : gasSettings.getFeeLimit();
    const txNonce = Fr.random();

    const witness = await this.wallet.createAuthWit(this.sender, {
      caller: this.paymentContract,
      action: {
        name: 'transfer_to_public',
        args: [this.sender.toField(), this.paymentContract.toField(), maxFee, txNonce],
        selector: await FunctionSelector.fromSignature('transfer_to_public((Field),(Field),u128,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        to: await this.getAsset(),
        returnTypes: [],
      },
    });

    return new ExecutionPayload(
      [
        {
          name: 'fee_entrypoint_private',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('fee_entrypoint_private(u128,Field)'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [maxFee, txNonce],
          returnTypes: [],
        },
      ],
      [witness],
      [],
    );
  }
}
