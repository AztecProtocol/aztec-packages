import { AztecAddress } from '@aztec/circuits.js';

/**
 * Avm-specific errors should derive from this
 */
export abstract class AvmExecutionError extends Error {
  constructor(message: string, ...rest: any[]) {
    super(message, ...rest);
    this.name = 'AvmInterpreterError';
  }
}

export class NoBytecodeFoundInterpreterError extends AvmExecutionError {
  constructor(contractAddress: AztecAddress) {
    super(`No bytecode found at: ${contractAddress}`);
    this.name = 'NoBytecodeFoundInterpreterError';
  }
}

/**
 * Error is thrown when the program counter goes to an invalid location.
 * There is no instruction at the provided pc
 */
export class InvalidProgramCounterError extends AvmExecutionError {
  constructor(pc: number, max: number) {
    super(`Invalid program counter ${pc}, max is ${max}`);
    this.name = 'InvalidProgramCounterError';
  }
}
