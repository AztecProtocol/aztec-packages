import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { type FunctionAbi, FunctionSelector, FunctionType, decodeFromAbi, encodeArguments } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule, HashedValues, SimulationStats, TxExecutionRequest, TxProfileResult } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import type {
  ProfileMethodOptions,
  RequestMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from './interaction_options.js';

/**
 * Represents the result type of a simulation.
 * By default, it will just be the return value of the simulated function
 * so contract interfaces behave as plain functions. If `includeStats` is set to true,
 * it will provide extra information.
 */
type SimulationReturn<T extends boolean | undefined> = T extends true
  ? {
      /**
       * Additional stats about the simulation
       */
      stats: SimulationStats;
      /**
       * Return value of the function
       */
      result: any;
    }
  : any;

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

  // docs:start:create
  /**
   * Create a transaction execution request that represents this call, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public override async create(options: SendMethodOptions = {}): Promise<TxExecutionRequest> {
    // docs:end:create
    if (this.functionDao.functionType === FunctionType.UTILITY) {
      throw new Error("Can't call `create` on a utility  function.");
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
   * @param options - An optional object containing additional configuration for the request generation.
   * @returns An execution payload wrapped in promise.
   */
  public override async request(options: RequestMethodOptions = {}): Promise<ExecutionPayload> {
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
      this.extraHashedArgs,
    );
  }

  // docs:start:simulate
  /**
   * Simulate a transaction and get its return values
   * Differs from prove in a few important ways:
   * 1. It returns the values of the function execution
   * 2. It supports `utility`, `private` and `public` functions
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public async simulate<T extends SimulateMethodOptions>(options?: T): Promise<SimulationReturn<T['includeStats']>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async simulate(options: SimulateMethodOptions = {}): Promise<SimulationReturn<typeof options.includeStats>> {
    // docs:end:simulate
    if (this.functionDao.functionType == FunctionType.UTILITY) {
      const utilityResult = await this.wallet.simulateUtility(
        this.functionDao.name,
        this.args,
        this.contractAddress,
        options.authWitnesses ?? [],
        options?.from,
      );

      if (options.includeStats) {
        return {
          stats: utilityResult.stats,
          result: utilityResult.result,
        };
      } else {
        return utilityResult.result;
      }
    }

    const txRequest = await this.create(options);
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

    const returnValue = rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];

    if (options.includeStats) {
      return { stats: simulatedTx.stats, result: returnValue };
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
  public async profile(
    options: ProfileMethodOptions = { profileMode: 'gates', skipProofGeneration: true },
  ): Promise<TxProfileResult> {
    if (this.functionDao.functionType == FunctionType.UTILITY) {
      throw new Error("Can't profile a utility function.");
    }
    const { authWitnesses, capsules, fee } = options;

    const txRequest = await this.create({ fee, authWitnesses, capsules });
    return await this.wallet.profileTx(txRequest, options.profileMode, options.skipProofGeneration, options?.from);
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
