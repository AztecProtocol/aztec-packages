import { AztecAddress, Fr, FunctionData } from '@aztec/circuits.js';

export type ExecutionRequest = {
  from: AztecAddress;
  to: AztecAddress;
  functionData: FunctionData;
  args: Fr[];
};
