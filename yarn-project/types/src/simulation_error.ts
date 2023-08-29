import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';

/**
 * Address and selector of a function that failed during simulation.
 */
export interface FailingFunction {
  /**
   * The address of the contract that failed.
   */
  contractAddress: AztecAddress;
  /**
   * The selector of the function that failed.
   */
  functionSelector: FunctionSelector;
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
export type NoirCallStack = SourceCodeLocation[];

/**
 * An error during the simulation of a function call.
 */
export class SimulationError extends Error {
  private constructor(
    message: string,
    private failingFunction: FailingFunction,
    private noirErrorStack?: NoirCallStack,
    private functionErrorStack?: FailingFunction[],
  ) {
    super(message);
  }

  static new(message: string, failingFunction: FailingFunction, noirErrorStack?: NoirCallStack) {
    return new SimulationError(message, failingFunction, noirErrorStack);
  }

  static fromPreviousSimulationError(failingFunction: FailingFunction, previousError: SimulationError) {
    return new SimulationError(
      previousError.message,
      failingFunction,
      previousError.noirErrorStack,
      previousError.getCallStack(),
    );
  }

  /**
   * The aztec function stack that failed during simulation.
   */
  getCallStack(): FailingFunction[] {
    return [this.failingFunction].concat(this.functionErrorStack || []);
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

  toJSON() {
    return {
      message: this.message,
      failingFunction: this.failingFunction,
      noirErrorStack: this.noirErrorStack,
      previousErrorStack: this.functionErrorStack,
    };
  }

  static fromJSON(obj: any) {
    return new SimulationError(obj.message, obj.failingFunction, obj.noirErrorStack, obj.previousErrorStack);
  }
}
