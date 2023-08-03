import { AztecAddress, Fr, FunctionData } from '@aztec/circuits.js';

/** A request to call a function on a contract from a given address. */
export type ExecutionRequest = {
  /** The recipient contract */
  to: AztecAddress;
  /** The function being called */
  functionData: FunctionData;
  /** The encoded args */
  args: Fr[];
};

/**
 * Creates an empty execution request.
 * @returns an empty execution request.
 */
export function emptyExecutionRequest() {
  return {
    to: AztecAddress.ZERO,
    functionData: FunctionData.empty(),
    args: [],
  };
}
