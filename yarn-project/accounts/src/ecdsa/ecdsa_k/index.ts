/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import EcdsaKAccountContractJson from '../../../artifacts/EcdsaKAccount.json' with { type: 'json' };
import { EcdsaKBaseAccountContract } from './account_contract.js';

export const EcdsaKAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaKAccountContractJson as NoirCompiledContract,
);

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 * Eagerly loads the contract artifact
 */
export class EcdsaKAccountContract extends EcdsaKBaseAccountContract {
  constructor(signingPrivateKey: Buffer) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaKAccountContractArtifact);
  }
}
