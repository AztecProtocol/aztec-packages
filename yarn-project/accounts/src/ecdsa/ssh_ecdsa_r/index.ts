/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import type { ContractArtifact } from '@aztec/stdlib/abi';

import { EcdsaRAccountContractArtifact } from '../ecdsa_r/index.js';
import { EcdsaRSSHBaseAccountContract } from './account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to an SSH agent, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 * Eagerly loads the contract artifact
 */
export class EcdsaRSSHAccountContract extends EcdsaRSSHBaseAccountContract {
  constructor(signingPublicKey: Buffer) {
    super(signingPublicKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaRAccountContractArtifact);
  }
}
