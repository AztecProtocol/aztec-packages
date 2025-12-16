import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { SetPublicAuthwitContractInteraction } from '../utils/authwit.js';
import type { Wallet } from '../wallet/wallet.js';
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
    protected sender: AztecAddress,
    /**
     * A wallet to perform the simulation to get the accepted asset
     */
    protected wallet: Wallet,
    /**
     * Gas settings used to compute the maximum fee the user is willing to pay
     */
    protected gasSettings: GasSettings,
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
  async getExecutionPayload(): Promise<ExecutionPayload> {
    const txNonce = Fr.random();
    const maxFee = this.gasSettings.getFeeLimit();

    const intent = {
      caller: this.paymentContract,
      call: {
        name: 'transfer_in_public',
        args: [this.sender.toField(), this.paymentContract.toField(), maxFee, txNonce],
        selector: await FunctionSelector.fromSignature('transfer_in_public((Field),(Field),u128,Field)'),
        type: FunctionType.PUBLIC,
        isStatic: false,
        to: await this.getAsset(),
        returnTypes: [],
      },
    };

    const setPublicAuthWitInteraction = await SetPublicAuthwitContractInteraction.create(
      this.wallet,
      this.sender,
      intent,
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

  getGasSettings(): GasSettings | undefined {
    return this.gasSettings;
  }
}
