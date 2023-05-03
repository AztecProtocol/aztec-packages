import { ABIParameter, ABIType } from '@aztec/foundation/abi';

type NoirFunctionType = 'Open' | 'Secret' | 'Unconstrained';

interface NoirFunctionAbi {
  parameters: ABIParameter[];
  param_witnesses: Record<string, number[]>;
  return_type: ABIType;
  return_witnesses: number[];
}

interface NoirFunctionEntry {
  name: string;
  function_type: NoirFunctionType;
  abi: NoirFunctionAbi;
  bytecode: Uint8Array;
}

export interface NoirCompiledContract {
  name: string;
  functions: NoirFunctionEntry[];
}
