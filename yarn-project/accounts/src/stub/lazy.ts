import { BaseAccount, type ChainInfo, type CompleteAddress } from '@aztec/aztec.js';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';

import { DefaultAccountInterface } from '../defaults/account_interface.js';
import { StubBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the Stub account contract
 */
export async function getStubAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  // Even if now supported by al major browsers, the MIME type is replaced with
  // "text/javascript"
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: StubAccountContractJson } = await import('../../artifacts/SimulatedAccount.json');
  return loadContractArtifact(StubAccountContractJson);
}

/**
 * Account contract that authenticates transactions using Stub signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * Lazily loads the contract artifact
 */
export class StubAccountContract extends StubBaseAccountContract {
  constructor() {
    super();
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getStubAccountContractArtifact();
  }
}

/**
 *
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
