import { type FunctionCall, PackedArguments, TxExecutionRequest } from '@aztec/circuit-types';
import { type AztecAddress, FunctionData, TxContext } from '@aztec/circuits.js';
import { type FunctionAbi, FunctionType, encodeArguments } from '@aztec/foundation/abi';

import { type Wallet } from '../account/wallet.js';
import { BaseContractInteraction, SendMethodOptions } from './base_contract_interaction.js';

export { SendMethodOptions };

/**
 * Represents the options for a view method in a contract function interaction.
 * Allows specifying the address from which the view method should be called.
 */
export type ViewMethodOptions = {
  /**
   * The sender's Aztec address.
   */
  from?: AztecAddress;
};

/**
 * This is the class that is returned when calling e.g. `contract.methods.myMethod(arg0, arg1)`.
 * It contains available interactions one can call on a method, including view.
 */
export class ContractFunctionInteraction extends BaseContractInteraction {
  constructor(
    protected wallet: Wallet,
    protected contractAddress: AztecAddress,
    protected functionDao: FunctionAbi,
    protected args: any[],
  ) {
    super(wallet);
    if (args.some(arg => arg === undefined || arg === null)) {
      throw new Error('All function interaction arguments must be defined and not null. Received: ' + args);
    }
  }

  /**
   * Create a transaction execution request that represents this call, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param opts - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public async create(opts?: SendMethodOptions): Promise<TxExecutionRequest> {
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `create` on an unconstrained function.");
    }
    if (!this.txRequest) {
      this.txRequest = await this.wallet.createTxExecutionRequest([this.request()], opts?.fee);
    }
    return this.txRequest;
  }

  /**
   * Returns an execution request that represents this operation. Useful as a building
   * block for constructing batch requests.
   * @returns An execution request wrapped in promise.
   */
  public request(): FunctionCall {
    const args = encodeArguments(this.functionDao, this.args);
    const functionData = FunctionData.fromAbi(this.functionDao);
    return { args, functionData, to: this.contractAddress };
  }

  /**
   * Execute a view (read-only) transaction on an unconstrained function.
   * This method is used to call functions that do not modify the contract state and only return data.
   * Throws an error if called on a non-unconstrained function.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the view transaction as returned by the contract function.
   */
  public view(options: ViewMethodOptions = {}) {
    if (this.functionDao.functionType !== FunctionType.UNCONSTRAINED) {
      throw new Error('Can only call `view` on an unconstrained function.');
    }

    const { from } = options;
    return this.wallet.viewTx(this.functionDao.name, this.args, this.contractAddress, from);
  }

  /**
   * Execute a view (read-only) transaction on an unconstrained function.
   * This method is used to call functions that do not modify the contract state and only return data.
   * Throws an error if called on a non-unconstrained function.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the view transaction as returned by the contract function.
   */
  public async viewConstrained(options: ViewMethodOptions = {}) {
    // We need to create the request, but we need to change the entry-point slightly I think :thinking:

    const packedArgs = PackedArguments.fromArgs(encodeArguments(this.functionDao, this.args));

    // I have forgotten what the hell origin is.

    const nodeInfo = await this.wallet.getNodeInfo();

    // We need to figure something better around for doing the simulation to have a origin and a to that is different
    // such that we can actually replace the "msg_sender" etc

    // Depending on public or not we need to do some changes.
    const a = FunctionData.fromAbi(this.functionDao);

    if (a.isPrivate) {
      const txRequest = TxExecutionRequest.from({
        argsHash: packedArgs.hash,
        origin: this.contractAddress,
        functionData: FunctionData.fromAbi(this.functionDao),
        txContext: TxContext.empty(nodeInfo.chainId, nodeInfo.protocolVersion),
        packedArguments: [packedArgs],
        authWitnesses: [],
      });

      const vue = await this.pxe.simulateCall(txRequest, options.from ?? this.wallet.getAddress());
      return vue.rv;
    } else {
      await this.create();
      const vue = await this.pxe.simulateCall(this.txRequest!);
      return vue.rv;
    }
  }
}
