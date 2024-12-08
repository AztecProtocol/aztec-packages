import type { FunctionCall, PrivateKernelProverProfileResult, TxExecutionRequest } from '@aztec/circuit-types';
import { type AztecAddress, type GasSettings } from '@aztec/circuits.js';
import {
  type FunctionAbi,
  FunctionSelector,
  FunctionType,
  decodeFromAbi,
  encodeArguments,
} from '@aztec/foundation/abi';

import { type Wallet } from '../account/wallet.js';
import { BaseContractInteraction, type SendMethodOptions } from './base_contract_interaction.js';

export { SendMethodOptions };

/**
 * Represents the options for simulating a contract function interaction.
 * Allows specifying the address from which the view method should be called.
 * Disregarded for simulation of public functions
 */
export type SimulateMethodOptions = {
  /** The sender's Aztec address. */
  from?: AztecAddress;
  /** Gas settings for the simulation. */
  gasSettings?: GasSettings;
  /** Simulate without checking for the validity of the resulting transaction, e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
};

/**
 * The result of a profile() call.
 */
export type ProfileResult = PrivateKernelProverProfileResult & {
  /** The result of the transaction as returned by the contract function. */
  returnValues: any;
};

/**
 * This is the class that is returned when calling e.g. `contract.methods.myMethod(arg0, arg1)`.
 * It contains available interactions one can call on a method, including view.
 */
export class ContractFunctionInteraction extends BaseContractInteraction {
  constructor(
    wallet: Wallet,
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
  public async create(opts: SendMethodOptions = {}): Promise<TxExecutionRequest> {
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `create` on an unconstrained function.");
    }
    const calls = [this.request()];
    const fee = await this.getFeeOptions({ calls, ...opts });
    const { nonce, cancellable } = opts;
    return await this.wallet.createTxExecutionRequest({ calls, fee, nonce, cancellable });
  }

  /**
   * Returns an execution request that represents this operation. Useful as a building
   * block for constructing batch requests.
   * @returns An execution request wrapped in promise.
   */
  public async request(): Promise<FunctionCall> {
    const args = encodeArguments(this.functionDao, this.args);
    return {
      name: this.functionDao.name,
      args,
      selector: await FunctionSelector.fromNameAndParameters(this.functionDao.name, this.functionDao.parameters),
      type: this.functionDao.functionType,
      to: this.contractAddress,
      isStatic: this.functionDao.isStatic,
      returnTypes: this.functionDao.returnTypes,
    };
  }

  /**
   * Simulate a transaction and get its return values
   * Differs from prove in a few important ways:
   * 1. It returns the values of the function execution
   * 2. It supports `unconstrained`, `private` and `public` functions
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public async simulate(options: SimulateMethodOptions = {}): Promise<any> {
    if (this.functionDao.functionType == FunctionType.UNCONSTRAINED) {
      return this.wallet.simulateUnconstrained(this.functionDao.name, this.args, this.contractAddress, options?.from);
    }

    const txRequest = await this.create();
    const simulatedTx = await this.wallet.simulateTx(txRequest, true, options?.from, options?.skipTxValidation);

    // As account entrypoints are private, for private functions we retrieve the return values from the first nested call
    // since we're interested in the first set of values AFTER the account entrypoint
    // For public functions we retrieve the first values directly from the public output.
    const rawReturnValues =
      this.functionDao.functionType == FunctionType.PRIVATE
        ? simulatedTx.getPrivateReturnValues().nested?.[0].values
        : simulatedTx.getPublicReturnValues()?.[0].values;

    return rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];
  }

  /**
   * Simulate a transaction and profile the gate count for each function in the transaction.
   * @param options - Same options as `simulate`.
   *
   * @returns An object containing the function return value and profile result.
   */
  public async simulateWithProfile(options: SimulateMethodOptions = {}): Promise<ProfileResult> {
    if (this.functionDao.functionType == FunctionType.UNCONSTRAINED) {
      throw new Error("Can't profile an unconstrained function.");
    }

    const txRequest = await this.create();
    const simulatedTx = await this.wallet.simulateTx(txRequest, true, options?.from, options?.skipTxValidation, true);

    const rawReturnValues =
      this.functionDao.functionType == FunctionType.PRIVATE
        ? simulatedTx.getPrivateReturnValues().nested?.[0].values
        : simulatedTx.getPublicReturnValues()?.[0].values;
    const rawReturnValuesDecoded = rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];

    return {
      returnValues: rawReturnValuesDecoded,
      gateCounts: simulatedTx.profileResult!.gateCounts,
    };
  }
}
