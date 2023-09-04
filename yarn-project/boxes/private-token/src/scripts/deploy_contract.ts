import { AztecAddress, Fr } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';

// REMOVE THIS
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function deployContract(
  contractAbi: ContractAbi,
  args: any, // key: value object where parameter name is the key.  make function generic to pass in
  salt: Fr,
  client: AztecRPC,
): Promise<AztecAddress> {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return AztecAddress.random();
}
