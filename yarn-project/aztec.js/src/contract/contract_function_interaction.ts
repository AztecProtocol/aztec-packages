import {
  type ABIParameter,
  type AbiType,
  type FunctionAbi,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  canBeMappedFromNullOrUndefined,
  decodeFromAbi,
  encodeArguments,
  isOptionStruct,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Capsule, HashedValues, TxProfileResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import {
  NO_FROM,
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SimulateInteractionOptions,
  type SimulationResult,
  extractOffchainOutput,
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
    // This may feel a bit ad-hoc here, so it warrants a comment. We accept Noir Option<T> parameters, and it's natural
    // to map JS's null/undefined to Noir Option's None. One possible way to deal with null/undefined arguments at this
    // point in the codebase is to conclude that they are accepted since at least one Noir type (ie: Option) can be
    // encoded from them. Then we would let `encode` deal with potential mismatches. I chose not to do that because of
    // the pervasiveness of null/undefined in JS, and how easy it is to inadvertently pass it around. Having this check
    // here allows us to fail at a point where the boundaries and intent are clear.
    if (this.hasInvalidNullOrUndefinedArguments(args)) {
      const signature = formatFunctionSignature(this.functionDao.name, this.functionDao.parameters);
      const received = args.map(formatArg).join(', ');
      throw new Error(
        `Null or undefined arguments are only allowed for Option<T> parameters in ${signature}. Received: (${received}).`,
      );
    }
  }

  private hasInvalidNullOrUndefinedArguments(args: any[]) {
    return args.some((arg, index) => {
      if (arg !== undefined && arg !== null) {
        return false;
      }

      const parameterType = this.functionDao.parameters[index]?.type;
      return !parameterType || !canBeMappedFromNullOrUndefined(parameterType);
    });
  }

  /**
   * Returns the encoded function call wrapped by this interaction
   * Useful when generating authwits
   * @returns An encoded function call
   */
  public async getFunctionCall() {
    const args = encodeArguments(this.functionDao, this.args);
    return FunctionCall.from({
      name: this.functionDao.name,
      to: this.contractAddress,
      selector: await FunctionSelector.fromNameAndParameters(this.functionDao.name, this.functionDao.parameters),
      type: this.functionDao.functionType,
      hideMsgSender: false /** Only set to `true` for enqueued public function calls */,
      isStatic: this.functionDao.isStatic,
      args,
      returnTypes: this.functionDao.returnTypes,
    });
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
  public async simulate(
    options: SimulateInteractionOptions = {} as SimulateInteractionOptions,
  ): Promise<SimulationResult> {
    // docs:end:simulate
    if (this.functionDao.functionType == FunctionType.UTILITY) {
      if (options.overrides?.publicStorage?.length || options.overrides?.contracts) {
        throw new Error('overrides are not supported for utility function simulation.');
      }
      const call = await this.getFunctionCall();
      const scopes = [...(options.additionalScopes ?? [])];
      const utilityResult = await this.wallet.executeUtility(call, {
        scopes: options.from === NO_FROM ? scopes : [options.from, ...scopes],
        authWitnesses: options.authWitnesses,
      });

      // Decode the raw field elements to the actual return type
      const returnValue = utilityResult.result ? decodeFromAbi(this.functionDao.returnTypes, utilityResult.result) : [];
      const offchainOutput = extractOffchainOutput(utilityResult.offchainEffects, utilityResult.anchorBlockTimestamp);

      if (options.includeMetadata) {
        return {
          stats: utilityResult.stats,
          ...offchainOutput,
          result: returnValue,
        };
      }
      return { result: returnValue, ...offchainOutput };
    }

    const executionPayload = await this.request(options);
    const simulatedTx = await this.wallet.simulateTx(executionPayload, toSimulateOptions(options));

    let rawReturnValues;
    if (this.functionDao.functionType == FunctionType.PRIVATE) {
      rawReturnValues = simulatedTx.getPrivateReturnValuesOfAppCall(0)?.values;
    } else {
      // For public functions we retrieve the first values directly from the public output.
      rawReturnValues = simulatedTx.getPublicReturnValues()?.[0]?.values;
    }

    const returnValue = rawReturnValues ? decodeFromAbi(this.functionDao.returnTypes, rawReturnValues) : [];
    const offchainOutput = extractOffchainOutput(
      simulatedTx.offchainEffects,
      simulatedTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
    );

    if (options.includeMetadata) {
      return {
        stats: simulatedTx.stats,
        ...offchainOutput,
        result: returnValue,
        gasUsed: simulatedTx.gasUsed,
      };
    }
    return { result: returnValue, ...offchainOutput };
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
    return await this.wallet.profileTx(executionPayload, toProfileOptions(options));
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

/**
 *  Render an AbiType as a human readable string
 * */
function formatAbiType(abiType: AbiType): string {
  switch (abiType.kind) {
    case 'field':
      return 'Field';
    case 'boolean':
      return 'bool';
    case 'integer':
      return `${abiType.sign === 'signed' ? 'i' : 'u'}${abiType.width}`;
    case 'string':
      return `str<${abiType.length}>`;
    case 'array':
      return `[${formatAbiType(abiType.type)}; ${abiType.length}]`;
    case 'struct': {
      if (isOptionStruct(abiType)) {
        const innerType = abiType.fields.find(f => f.name === '_value')!.type;
        return `Option<${formatAbiType(innerType)}>`;
      }
      return `(${abiType.fields.map(f => `${f.name}: ${formatAbiType(f.type)}`).join(', ')})`;
    }
    case 'tuple':
      return `(${abiType.fields.map(formatAbiType).join(', ')})`;
  }
}

/**
 * Pretty print a function signature
 */
function formatFunctionSignature(name: string, parameters: ABIParameter[]): string {
  const params = parameters.map(p => `${p.name}: ${formatAbiType(p.type)}`).join(', ');
  return `${name}(${params})`;
}

/**
 * Non-exhaustive pretty print of JS args to display in error messages in this module
 */
function formatArg(arg: unknown): string {
  if (arg === undefined) {
    return 'undefined';
  }
  if (arg === null) {
    return 'null';
  }
  if (typeof arg === 'bigint') {
    return `${arg}n`;
  }
  if (Array.isArray(arg)) {
    return `[${arg.map(formatArg).join(', ')}]`;
  }
  if (typeof arg === 'object') {
    const entries = Object.entries(arg).map(([k, v]) => `${k}: ${formatArg(v)}`);
    return `{ ${entries.join(', ')} }`;
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(arg);
}
