import type { Fr } from '@aztec/foundation/fields';

import { z } from 'zod';

import type { OpcodeLocation } from '../abi/abi.js';
import { FunctionSelector } from '../abi/function_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, optional, schemas } from '../schemas/index.js';

/**
 * Address and selector of a function that failed during simulation.
 */
export interface FailingFunction {
  /**
   * The address of the contract that failed.
   */
  contractAddress: AztecAddress;
  /**
   * The name of the contract that failed.
   */
  contractName?: string;
  /**
   * The selector of the function that failed.
   */
  functionSelector?: FunctionSelector;
  /**
   * The name of the function that failed.
   */
  functionName?: string;
}

/**
 * A pointer to a failing section of the noir source code.
 */
export interface SourceCodeLocation {
  /**
   * The path to the source file.
   */
  filePath: string;
  /**
   * The line number of the call.
   */
  line: number;
  /**
   * The column number of the call.
   */
  column: number;
  /**
   * The source code of the file.
   */
  fileSource: string;
  /**
   * The source code text of the failed constraint.
   */
  locationText: string;
}

const SourceCodeLocationSchema = z.object({
  filePath: z.string(),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  fileSource: z.string(),
  locationText: z.string(),
});

/**
 * A stack of noir source code locations.
 */
export type NoirCallStack = SourceCodeLocation[] | OpcodeLocation[];

const NoirCallStackSchema: z.ZodType<NoirCallStack> = z.union([z.array(SourceCodeLocationSchema), z.array(z.string())]);

/**
 * Checks if a call stack is unresolved.
 */
export function isNoirCallStackUnresolved(callStack: NoirCallStack): callStack is OpcodeLocation[] {
  return typeof callStack[0] === 'string';
}

/**
 * An error during the simulation of a function call.
 */
export class SimulationError extends Error {
  private aztecContext: string = '';

  constructor(
    private originalMessage: string,
    private functionErrorStack: FailingFunction[],
    public revertData: Fr[] = [],
    private noirErrorStack?: NoirCallStack,
    options?: ErrorOptions,
  ) {
    super(originalMessage, options);
    const getMessage = () => this.getMessage();
    const getStack = () => this.getStack();
    Object.defineProperties(this, {
      message: {
        configurable: false,
        enumerable: true,
        /**
         * Getter for the custom error message. It has to be defined here because JS errors have the message property defined
         * in the error itself, not its prototype. Thus if we define it as a class getter will be shadowed.
         * @returns The message.
         */
        get() {
          return getMessage();
        },
      },
      stack: {
        configurable: false,
        enumerable: true,
        /**
         * Getter for the custom error stack. It has to be defined here due to the same issue as the message.
         * @returns The stack.
         */
        get() {
          return getStack();
        },
        /**
         * We need a setter to avoid the error "TypeError: Cannot set property stack of #<SimulationError> which has only a getter"
         * whenever we are traversing a nested error chain. However, we don't want to allow setting the stack, since the simulation
         * error is always gonna be the root of the error chain.
         * @param value
         */
        set(_: string | undefined) {},
      },
    });
  }

  getMessage() {
    if (this.noirErrorStack && !isNoirCallStackUnresolved(this.noirErrorStack) && this.noirErrorStack.length) {
      return `${this.originalMessage} '${this.noirErrorStack[this.noirErrorStack.length - 1].locationText}'${
        this.aztecContext
      }`;
    }
    return this.originalMessage;
  }

  getOriginalMessage() {
    return this.originalMessage;
  }

  setOriginalMessage(message: string) {
    this.originalMessage = message;
  }

  /**
   * Enriches the error with the name of a contract that failed.
   * @param contractAddress - The address of the contract
   * @param contractName - The corresponding name
   */
  enrichWithContractName(contractAddress: AztecAddress, contractName: string) {
    this.functionErrorStack.forEach(failingFunction => {
      if (failingFunction.contractAddress.equals(contractAddress)) {
        failingFunction.contractName = contractName;
      }
    });
  }

  /**
   * Enriches the error with the name of a function that failed.
   * @param contractAddress - The address of the contract
   * @param functionSelector - The selector of the function
   * @param functionName - The corresponding name
   */
  enrichWithFunctionName(contractAddress: AztecAddress, functionSelector: FunctionSelector, functionName: string) {
    this.functionErrorStack.forEach(failingFunction => {
      if (
        failingFunction.contractAddress.equals(contractAddress) &&
        !!failingFunction.functionSelector &&
        failingFunction.functionSelector.equals(functionSelector)
      ) {
        failingFunction.functionName = functionName;
      }
    });
  }

  getStack() {
    const functionCallStack = this.getCallStack();
    const noirCallStack = this.getNoirCallStack();

    // Try to resolve the contract and function names of the stack of failing functions.
    const stackLines: string[] = [
      ...functionCallStack.map(failingFunction => {
        return `at ${failingFunction.contractName ?? failingFunction.contractAddress.toString()}.${
          failingFunction.functionName ?? failingFunction.functionSelector?.toString() ?? 'unknown'
        }`;
      }),
      ...noirCallStack.map(errorLocation =>
        typeof errorLocation === 'string'
          ? `at opcode ${errorLocation}`
          : `at ${errorLocation.locationText} (${errorLocation.filePath}:${errorLocation.line}:${errorLocation.column})`,
      ),
    ];

    return [`Simulation error: ${this.message}`, ...stackLines.reverse()].join('\n');
  }

  /**
   * The aztec function stack that failed during simulation.
   */
  getCallStack(): FailingFunction[] {
    return this.functionErrorStack;
  }

  /**
   * Returns the noir call stack inside the first function that failed during simulation.
   * @returns The noir call stack.
   */
  getNoirCallStack(): NoirCallStack {
    return this.noirErrorStack || [];
  }

  /**
   * Sets the noir call stack.
   * @param callStack - The noir call stack.
   */
  setNoirCallStack(callStack: NoirCallStack) {
    this.noirErrorStack = callStack;
  }

  setAztecContext(context: string) {
    this.aztecContext = context;
  }

  toJSON() {
    return {
      originalMessage: this.originalMessage,
      functionErrorStack: this.functionErrorStack,
      noirErrorStack: this.noirErrorStack,
      revertData: this.revertData.map(fr => fr.toString()),
    };
  }

  static get schema(): ZodFor<SimulationError> {
    return z
      .object({
        originalMessage: z.string(),
        functionErrorStack: z.array(
          z.object({
            contractAddress: schemas.AztecAddress,
            contractName: z.string().optional(),
            functionSelector: optional(schemas.FunctionSelector),
            functionName: z.string().optional(),
          }),
        ),
        noirErrorStack: NoirCallStackSchema.optional(),
        revertData: z.array(schemas.Fr),
      })
      .transform(
        ({ originalMessage, functionErrorStack, noirErrorStack, revertData }) =>
          new SimulationError(originalMessage, functionErrorStack, revertData, noirErrorStack),
      );
  }

  static async random() {
    return new SimulationError('Random simulation error', [
      { contractAddress: await AztecAddress.random(), functionSelector: FunctionSelector.random() },
    ]);
  }
}
