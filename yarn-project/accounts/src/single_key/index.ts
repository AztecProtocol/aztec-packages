/**
 * The `@aztec/accounts/single_key` export provides a testing account contract implementation that uses a single Grumpkin key for both authentication and encryption.
 * It is not recommended to use this account type in production.
 *
 * @packageDocumentation
 */
import type { GrumpkinScalar } from '@aztec/aztec.js';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SchnorrSingleKeyAccountContractJson from '../../artifacts/SchnorrSingleKeyAccount.json' with { type: 'json' };
import { SingleKeyBaseAccountContract } from './account_contract.js';

export const SchnorrSingleKeyAccountContractArtifact = loadContractArtifact(
  SchnorrSingleKeyAccountContractJson as NoirCompiledContract,
);

/**
 * Account contract that authenticates transactions using Schnorr signatures verified against
 * the note encryption key, relying on a single private key for both encryption and authentication.
 * Eagerly loads the contract artifact
 */
export class SingleKeyAccountContract extends SingleKeyBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrSingleKeyAccountContractArtifact);
  }
}
