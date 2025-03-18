import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi, encodeArguments } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule, HashedValues, TxExecutionRequest, TxProfileResult } from '@aztec/stdlib/tx';

import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction, type SendMethodOptions } from './base_contract_interaction.js';

export type { SendMethodOptions };

/**
 * Represents the options for simulating a contract function interaction.
 * Allows specifying the address from which the view method should be called.
 * Disregarded for simulation of public functions
 */
export type ProfileMethodOptions = Pick<SendMethodOptions, 'fee'> & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** The sender's Aztec address. */
  from?: AztecAddress;
  /** Authwits to use in the simulation */
  authWitnesses?: AuthWitness[];
  /** Capsules to use in the simulation */
  capsules?: Capsule[];
};

/**
 * Represents the options for simulating a contract function interaction.
 * Allows specifying the address from which the view method should be called.
 * Disregarded for simulation of public functions
 */
export type SimulateMethodOptions = Pick<SendMethodOptions, 'fee'> & {
  /** The sender's Aztec address. */
  from?: AztecAddress;
  /** Simulate without checking for the validity of the resulting transaction, e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
  /** Whether to ensure the fee payer is not empty and has enough balance to pay for the fee. */
  skipFeeEnforcement?: boolean;
  /** Authwits to use in the simulation */
  authWitnesses?: AuthWitness[];
  /** Capsules to use in the simulation */
  capsules?: Capsule[];
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
    authWitnesses: AuthWitness[] = [],
    capsules: Capsule[] = [],
    extraHashedValues: HashedValues[] = [],
  ) {
    super(wallet, authWitnesses, capsules, extraHashedValues);
    if (args.some(arg => arg === undefined || arg === null)) {
      throw new Error('All function interaction arguments must be defined and not null. Received: ' + args);
    }
  }

  // docs:start:create
  /**
   * Create a transaction execution request that represents this call, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public async create(options: SendMethodOptions = {}): Promise<TxExecutionRequest> {
    // docs:end:create
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `create` on an unconstrained function.");
    }
    const requestWithoutFee = await this.request(options);

    const { fee: userFee, nonce, cancellable } = options;
    const fee = await this.getFeeOptions(requestWithoutFee, userFee, { nonce, cancellable });

    return await this.wallet.createTxExecutionRequest(requestWithoutFee, fee, { nonce, cancellable });
  }

  // docs:start:request
  /**
   * Returns an execution request that represents this operation.
   * Can be used as a building block for constructing batch requests.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public async request(options: SendMethodOptions = {}): Promise<ExecutionPayload> {
    // docs:end:request
    const args = encodeArguments(this.functionDao, this.args);
    const calls = [
      {
        name: this.functionDao.name,
        args,
        selector: await FunctionSelector.fromNameAndParameters(this.functionDao.name, this.functionDao.parameters),
        type: this.functionDao.functionType,
        to: this.contractAddress,
        isStatic: this.functionDao.isStatic,
        returnTypes: this.functionDao.returnTypes,
      },
    ];
    const { authWitnesses, capsules } = options;
    return new ExecutionPayload(
      calls,
      this.authWitnesses.concat(authWitnesses ?? []),
      this.capsules.concat(capsules ?? []),
      this.extraHashedValues,
    );
  }

  // docs:start:simulate
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
    // docs:end:simulate
    if (this.functionDao.functionType == FunctionType.UNCONSTRAINED) {
      return this.wallet.simulateUnconstrained(
        this.functionDao.name,
        this.args,
        this.contractAddress,
        options.authWitnesses ?? [],
        options?.from,
      );
    }

    const fee = options.fee ?? { paymentMethod: new FeeJuicePaymentMethod(AztecAddress.ZERO) };
    const { authWitnesses, capsules } = options;
    const txRequest = await this.create({ fee, authWitnesses, capsules });
    const simulatedTx = await this.wallet.simulateTx(
      txRequest,
      true /* simulatePublic */,
      options.from,
      options.skipTxValidation,
      options.skipFeeEnforcement ?? true,
    );

    let rawReturnValues;
    if (this.functionDao.functionType == FunctionType.PRIVATE) {
      if (simulatedTx.getPrivateReturnValues().nested.length > 0) {
        // The function invoked is private and it was called via an account contract
        // TODO(#10631): There is a bug here: this branch might be triggered when there is no-account contract as well
        rawReturnValues = simulatedTx.getPrivateReturnValues().nested[0].values;
      } else {
        // The function invoked is private and it was called directly (without account contract)
        rawReturnValues = simulatedTx.getPrivateReturnValues().values;
      }
    } else {
      // For public functions we retrieve the first values directly from the public output.
      rawReturnValues = simulatedTx.getPublicReturnValues()?.[0].values;
    }

    return rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];
  }

  /**
   * Simulate a transaction and profile the gate count for each function in the transaction.
   * @param options - Same options as `simulate`.
   *
   * @returns An object containing the function return value and profile result.
   */
  public async profile(options: ProfileMethodOptions = { profileMode: 'gates' }): Promise<TxProfileResult> {
    if (this.functionDao.functionType == FunctionType.UNCONSTRAINED) {
      throw new Error("Can't profile an unconstrained function.");
    }
    const { authWitnesses, capsules, fee } = options;

    const txRequest = await this.create({ fee, authWitnesses, capsules });
    return await this.wallet.profileTx(txRequest, options.profileMode, options?.from);
  }
}
