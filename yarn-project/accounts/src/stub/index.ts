import { BaseAccount } from '@aztec/aztec.js/account';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SimulatedAccountContract from '../../artifacts/SimulatedAccount.json' with { type: 'json' };
import { StubBaseAccountContract } from './account_contract.js';

export const StubAccountContractArtifact = loadContractArtifact(SimulatedAccountContract as NoirCompiledContract);

/**
 * Stub account contract
 * Eagerly loads the contract artifact
 */
export class StubAccountContract extends StubBaseAccountContract {
  constructor() {
    super();
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(StubAccountContractArtifact);
  }
}

/**
 * Creates a stub account that impersonates the one with the provided originalAddress.
 * @param originalAddress - The address of the account to stub
 * @returns A stub account that can be used for kernelless simulations
 */
export function createStubAccount(originalAddress: CompleteAddress) {
  const accountContract = new StubAccountContract();
  const authWitnessProvider = accountContract.getAuthWitnessProvider(originalAddress);
  return new BaseAccount(
    new DefaultAccountEntrypoint(originalAddress.address, authWitnessProvider),
    authWitnessProvider,
    originalAddress,
  );
}
