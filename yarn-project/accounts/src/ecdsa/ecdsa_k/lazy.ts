/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';

import { EcdsaKBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the ecdsa K account contract
 */
export async function getEcdsaKAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with browsers
  // https://caniuse.com/mdn-javascript_statements_import_import_assertions_type_json
  // Use the new "with" syntax once supported by firefox
  // https://caniuse.com/mdn-javascript_statements_import_import_attributes_type_json
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: ecdsaKAccountContractJson } = await import('../../../artifacts/EcdsaKAccount.json');
  return loadContractArtifact(ecdsaKAccountContractJson);
}

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 * Lazily loads the contract artifact
 */
export class EcdsaKAccountContract extends EcdsaKBaseAccountContract {
  constructor(signingPrivateKey: Buffer) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getEcdsaKAccountContractArtifact();
  }
}
