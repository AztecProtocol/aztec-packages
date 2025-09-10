/**
 * The `@aztec/accounts/single_key` export provides a testing account contract implementation that uses a single Grumpkin key for both authentication and encryption.
 * It is not recommended to use this account type in production.
 *
 * @packageDocumentation
 */
import type { GrumpkinScalar } from '@aztec/aztec.js';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';

import { SingleKeyBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the single key account contract
 */
export async function getSingleKeyAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  // Even if now supported by al major browsers, the MIME type is replaced with
  // "text/javascript"
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: schnorrAccountContractJson } = await import('../../artifacts/SchnorrAccount.json');
  return loadContractArtifact(schnorrAccountContractJson);
}

/**
 * Account contract that authenticates transactions using Schnorr signatures verified against
 * the note encryption key, relying on a single private key for both encryption and authentication.
 * Lazily loads the contract artifact
 */
export class SingleKeyAccountContract extends SingleKeyBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getSingleKeyAccountContractArtifact();
  }
}
