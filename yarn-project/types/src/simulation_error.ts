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
 * An error during the simulation of a function call.
 */
export class SimulationError extends Error {
  constructor(
    message: string,
    private failingFunction: FailingFunction,
    private previousErrorStack?: FailingFunction[],
  ) {
    super(message);
  }

  /**
   * The call stack of the failing simulation.
   */
  getCallStack(): FailingFunction[] {
    return [this.failingFunction].concat(this.previousErrorStack || []);
  }

  toJSON() {
    return {
      message: this.message,
      failingFunction: this.failingFunction,
      previousErrorStack: this.previousErrorStack,
    };
  }

  static fromJSON(obj: any) {
    return new SimulationError(obj.message, obj.failingFunction, obj.previousErrorStack);
  }
}
