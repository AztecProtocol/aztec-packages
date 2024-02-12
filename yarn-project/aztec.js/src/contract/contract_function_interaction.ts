import { FunctionCall, TxExecutionRequest } from '@aztec/circuit-types';
import { AztecAddress, FunctionData } from '@aztec/circuits.js';
import { FunctionAbi, FunctionType, encodeArguments } from '@aztec/foundation/abi';

import { Wallet } from '../account/wallet.js';
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
 * Options for sending a function execution request to a contract.
 * Allows specifying whether it is a static call or not, and additional send method options.
 */
export type ExecutionRequestOptions = {
  /**
   * Wether the execution is static, i.e. it does not modify state
   */
  static?: boolean;
} & SendMethodOptions;

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
   * Custom simulate supporting extended options
   * @param options - An optional object containing additional configuration for the transaction.
   * */
  public simulate(options: ExecutionRequestOptions = {}) {
    return super.simulate(options);
  }

  /**
   * Create a transaction execution request that represents this call, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public async create(options: ExecutionRequestOptions = {}): Promise<TxExecutionRequest> {
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `create` on an unconstrained function.");
    }
    if (!this.txRequest) {
      this.txRequest = await this.wallet.createTxExecutionRequest([this.request(options)]);
    }
    return this.txRequest;
  }

  /**
   * Returns an execution request that represents this operation. Useful as a building
   * block for constructing batch requests.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public request(options: ExecutionRequestOptions = {}): FunctionCall {
    const args = encodeArguments(this.functionDao, this.args);
    const functionData = FunctionData.fromAbi(this.functionDao);
    return { args, functionData, to: this.contractAddress, static: options.static ?? false };
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
}
