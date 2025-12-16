import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';

import type { ContractDataProvider } from '../../storage/index.js';

// TODO: this might not be the final home for these functions,
// it's just a way of starting to dissolve PXEOracleInterface
export async function getContractInstance(
  address: AztecAddress,
  contractDataProvider: ContractDataProvider,
): Promise<ContractInstance> {
  const instance = await contractDataProvider.getContractInstance(address);
  if (!instance) {
    throw new Error(`No contract instance found for address ${address.toString()}`);
  }
  return instance;
}
