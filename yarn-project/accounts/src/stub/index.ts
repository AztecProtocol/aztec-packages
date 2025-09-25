import { BaseAccount, type ChainInfo, type CompleteAddress } from '@aztec/aztec.js';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SimulatedAccountContract from '../../artifacts/SimulatedAccount.json' with { type: 'json' };
import { DefaultAccountInterface } from '../defaults/account_interface.js';
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
 * @param chainInfo - The chain info that the account is connected to
 * @returns A stub account that can be used for kernelless simulations
 */
export function createStubAccount(originalAddress: CompleteAddress, chainInfo: ChainInfo) {
  const accountContract = new StubAccountContract();
  const accountInterface = new DefaultAccountInterface(
    accountContract.getAuthWitnessProvider(originalAddress),
    originalAddress,
    chainInfo,
  );
  return new BaseAccount(accountInterface);
}
