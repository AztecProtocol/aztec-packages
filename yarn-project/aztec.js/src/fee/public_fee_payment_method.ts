import type { FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type { Wallet } from '../wallet/wallet.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

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
    protected sender: AztecAddress,

    /**
     * A wallet to perform the simulation to get the accepted asset
     */
    protected wallet: Wallet,
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
   * Creates an execution payload to pay the fee using a public function through an FPC in the desired asset
   * @param gasSettings - The gas settings.
   * @returns An execution payload that contains the required function calls.
   */
  async getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload> {
    const txNonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit();

    const setPublicAuthWitInteraction = await this.wallet.setPublicAuthWit(
      this.sender,
      {
        caller: this.paymentContract,
        action: {
          name: 'transfer_in_public',
          args: [this.sender.toField(), this.paymentContract.toField(), maxFee, txNonce],
          selector: await FunctionSelector.fromSignature('transfer_in_public((Field),(Field),u128,Field)'),
          type: FunctionType.PUBLIC,
          isStatic: false,
          to: await this.getAsset(),
          returnTypes: [],
        },
      },
      true,
    );

    return new ExecutionPayload(
      [
        ...(await setPublicAuthWitInteraction.request()).calls,
        {
          name: 'fee_entrypoint_public',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('fee_entrypoint_public(u128,Field)'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [maxFee, txNonce],
          returnTypes: [],
        },
      ],
      [],
      [],
    );
  }
}
