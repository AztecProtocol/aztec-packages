import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';
import { OpcodeLocation } from '@aztec/foundation/abi';

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
  functionSelector: FunctionSelector;
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
   * The source code of the file.
   */
  fileSource: string;
  /**
   * The source code text of the failed constraint.
   */
  locationText: string;
}

/**
 * A stack of noir source code locations.
 */
export type NoirCallStack = SourceCodeLocation[] | OpcodeLocation[];

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
  private constructor(
    message: string,
    private originalMessage: string,
    private functionErrorStack: FailingFunction[],
    private noirErrorStack?: NoirCallStack,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.addSourceCodeSnippetToMessage();
  }

  private addCaller(failingFunction: FailingFunction) {
    this.functionErrorStack.unshift(failingFunction);
  }

  /**
   * Creates a new simulation error
   * @param message - The error message
   * @param failingContract - The address of the contract that failed.
   * @param failingSelector - The selector of the function that failed.
   * @param callStack - The noir call stack of the error.
   * @returns - The simulation error.
   */
  public static new(
    message: string,
    failingContract: AztecAddress,
    failingSelector: FunctionSelector,
    callStack?: NoirCallStack,
  ) {
    const failingFunction = { contractAddress: failingContract, functionSelector: failingSelector };
    return new SimulationError(message, message, [failingFunction], callStack);
  }

  /**
   * Creates a new simulation error from an error thrown during simulation.
   * @param failingContract - The address of the contract that failed.
   * @param failingSelector - The selector of the function that failed.
   * @param err - The error that was thrown.
   * @param callStack - The noir call stack of the error.
   * @returns - The simulation error.
   */
  public static fromError(
    failingContract: AztecAddress,
    failingSelector: FunctionSelector,
    err: Error,
    callStack?: NoirCallStack,
  ) {
    const failingFunction = { contractAddress: failingContract, functionSelector: failingSelector };
    if (err instanceof SimulationError) {
      return SimulationError.extendPreviousSimulationError(failingFunction, err);
    }
    return new SimulationError(err.message, err.message, [failingFunction], callStack, {
      cause: err,
    });
  }

  static extendPreviousSimulationError(failingFunction: FailingFunction, previousError: SimulationError) {
    previousError.addCaller(failingFunction);
    return previousError;
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
        failingFunction.functionSelector.equals(functionSelector)
      ) {
        failingFunction.functionName = functionName;
      }
    });
  }

  /**
   * Returns a string representation of the error.
   * @returns The string.
   */
  toString() {
    const functionCallStack = this.getCallStack();
    const noirCallStack = this.getNoirCallStack();

    // Try to resolve the contract and function names of the stack of failing functions.
    const stackLines: string[] = [
      ...functionCallStack.map(failingFunction => {
        return `  at ${failingFunction.contractName ?? failingFunction.contractAddress.toString()}.${
          failingFunction.functionName ?? failingFunction.functionSelector.toString()
        }`;
      }),
      ...noirCallStack.map(errorLocation =>
        typeof errorLocation === 'string'
          ? `  at opcode ${errorLocation}`
          : `  at ${errorLocation.filePath}:${errorLocation.line} '${errorLocation.locationText}'`,
      ),
    ];

    return [`Simulation error: ${this.message}`, ...stackLines.reverse()].join('\n');
  }

  private addSourceCodeSnippetToMessage() {
    if (this.noirErrorStack && !isNoirCallStackUnresolved(this.noirErrorStack) && this.noirErrorStack.length) {
      this.updateMessage(
        `${this.originalMessage} '${this.noirErrorStack[this.noirErrorStack.length - 1].locationText}'`,
      );
    }
  }

  /**
   * Updates the error message. This is needed because in some engines the stack also contains the message.
   * @param newMessage - The new message of this error.
   */
  private updateMessage(newMessage: string) {
    const oldMessage = this.message;
    this.message = newMessage;
    if (this.stack?.startsWith(`Error: ${oldMessage}`)) {
      this.stack = this.stack?.replace(`Error: ${oldMessage}`, `Error: ${newMessage}`);
    }
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
    this.addSourceCodeSnippetToMessage();
  }

  toJSON() {
    return {
      message: this.message,
      originalMessage: this.originalMessage,
      functionErrorStack: this.functionErrorStack,
      noirErrorStack: this.noirErrorStack,
    };
  }

  static fromJSON(obj: ReturnType<SimulationError['toJSON']>) {
    return new SimulationError(obj.message, obj.originalMessage, obj.functionErrorStack, obj.noirErrorStack);
  }
}
