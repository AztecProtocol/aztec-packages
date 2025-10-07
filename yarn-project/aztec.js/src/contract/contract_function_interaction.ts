import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi, encodeArguments } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type Capsule, type HashedValues, type TxProfileResult, collectOffchainEffects } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import { getGasLimits } from './get_gas_limits.js';
import {
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SimulateInteractionOptions,
  type SimulationReturn,
  toProfileOptions,
  toSimulateOptions,
} from './interaction_options.js';

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
    private extraHashedArgs: HashedValues[] = [],
  ) {
    super(wallet, authWitnesses, capsules);
    if (args.some(arg => arg === undefined || arg === null)) {
      throw new Error(`All function interaction arguments must be defined and not null. Received: ${args}`);
    }
  }

  /**
   * Returns the encoded function call wrapped by this interaction
   * Useful when generating authwits
   * @returns An encoded function call
   */
  public async getFunctionCall() {
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
   * Returns the execution payload that allows this operation to happen on chain.
   * @param options - Configuration options.
   * @returns The execution payload for this operation
   */
  public override async request(options: RequestInteractionOptions = {}): Promise<ExecutionPayload> {
    const calls = [await this.getFunctionCall()];
    const { authWitnesses, capsules } = options;
    const feeExecutionPayload = options.fee?.paymentMethod
      ? await options.fee.paymentMethod.getExecutionPayload()
      : undefined;
    const functionExecutionPayload = new ExecutionPayload(
      calls,
      this.authWitnesses.concat(authWitnesses ?? []),
      this.capsules.concat(capsules ?? []),
      this.extraHashedArgs,
    );
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, functionExecutionPayload])
      : functionExecutionPayload;
    return finalExecutionPayload;
  }

  // docs:start:simulate
  /**
   * Simulate a transaction and get information from its execution.
   * Differs from prove in a few important ways:
   * 1. It returns the values of the function execution, plus additional metadata if requested
   * 2. It supports `utility`, `private` and `public` functions
   *
   * @param options - An optional object containing additional configuration for the simulation.
   * @returns Depending on the simulation options, this method directly returns the result value of the executed
   * function or a rich object containing extra metadata, such as estimated gas costs (if requested via options),
   * execution statistics and emitted offchain effects
   */
  public async simulate<T extends SimulateInteractionOptions>(
    options: T,
  ): Promise<SimulationReturn<Exclude<T['fee'], undefined>['estimateGas']>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async simulate<T extends SimulateInteractionOptions>(
    options: T,
  ): Promise<SimulationReturn<T['includeMetadata']>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async simulate(
    options: SimulateInteractionOptions,
  ): Promise<SimulationReturn<typeof options.includeMetadata>> {
    // docs:end:simulate
    if (this.functionDao.functionType == FunctionType.UTILITY) {
      const utilityResult = await this.wallet.simulateUtility(
        this.functionDao.name,
        this.args,
        this.contractAddress,
        options.authWitnesses ?? [],
      );

      if (options.includeMetadata) {
        return {
          stats: utilityResult.stats,
          result: utilityResult.result,
        };
      } else {
        return utilityResult.result;
      }
    }

    const executionPayload = await this.request(options);
    const simulatedTx = await this.wallet.simulateTx(executionPayload, await toSimulateOptions(options));

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
      rawReturnValues = simulatedTx.getPublicReturnValues()?.[0]?.values;
    }

    const returnValue = rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];

    if (options.includeMetadata || options.fee?.estimateGas) {
      const { gasLimits, teardownGasLimits } = getGasLimits(simulatedTx, options.fee?.estimatedGasPadding);
      this.log.verbose(
        `Estimated gas limits for tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
      );
      return {
        stats: simulatedTx.stats,
        offchainEffects: collectOffchainEffects(simulatedTx.privateExecutionResult),
        result: returnValue,
        estimatedGas: { gasLimits, teardownGasLimits },
      };
    } else {
      return returnValue;
    }
  }

  /**
   * Simulate a transaction and profile the gate count for each function in the transaction.
   * @param options - Same options as `simulate`, plus profiling method
   *
   * @returns An object containing the function return value and profile result.
   */
  public async profile(options: ProfileInteractionOptions): Promise<TxProfileResult> {
    if (this.functionDao.functionType == FunctionType.UTILITY) {
      throw new Error("Can't profile a utility function.");
    }

    const executionPayload = await this.request(options);
    return await this.wallet.profileTx(executionPayload, await toProfileOptions(options));
  }

  /**
   * Augments this ContractFunctionInteraction with additional metadata, such as authWitnesses, capsules, and extraHashedArgs.
   * This is useful when creating a "batteries included" interaction, such as registering a contract class with its associated
   * capsule instead of having the user provide them externally.
   * @param options - An object containing the metadata to add to the interaction
   * @returns A new ContractFunctionInteraction with the added metadata, but calling the same original function in the same manner
   */
  public with({
    authWitnesses = [],
    capsules = [],
    extraHashedArgs = [],
  }: {
    /** The authWitnesses to add to the interaction */
    authWitnesses?: AuthWitness[];
    /** The capsules to add to the interaction */
    capsules?: Capsule[];
    /** The extra hashed args to add to the interaction */
    extraHashedArgs?: HashedValues[];
  }): ContractFunctionInteraction {
    return new ContractFunctionInteraction(
      this.wallet,
      this.contractAddress,
      this.functionDao,
      this.args,
      this.authWitnesses.concat(authWitnesses),
      this.capsules.concat(capsules),
      this.extraHashedArgs.concat(extraHashedArgs),
    );
  }
}
