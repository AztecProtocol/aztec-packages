/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import EcdsaRAccountContractJson from '../../../artifacts/EcdsaRAccount.json' with { type: 'json' };
import { EcdsaRBaseAccountContract } from './account_contract.js';

export const EcdsaRAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaRAccountContractJson as NoirCompiledContract,
);

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 * Eagerly loads the contract artifact
 */
export class EcdsaRAccountContract extends EcdsaRBaseAccountContract {
  constructor(signingPrivateKey: Buffer) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaRAccountContractArtifact);
  }
}
