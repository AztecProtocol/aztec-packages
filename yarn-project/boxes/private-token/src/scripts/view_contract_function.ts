import { AztecAddress, AztecRPC, Fr } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';

// REMOVE THIS
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function viewContractFunction(
  address: AztecAddress,
  abi: ContractAbi,
  functionName: string,
  args: any,
  rpc: AztecRPC,
) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return [Fr.random()];
}
