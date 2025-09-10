/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import { getAccountContractAddress } from '@aztec/aztec.js';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { SchnorrBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the schnorr account contract
 */
export async function getSchnorrAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  // Even if now supported by al major browsers, the MIME type is replaced with
  // "text/javascript"
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: schnorrAccountContractJson } = await import('../../artifacts/SchnorrAccount.json');
  return loadContractArtifact(schnorrAccountContractJson);
}

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * Lazily loads the contract artifact
 */
export class SchnorrAccountContract extends SchnorrBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getSchnorrAccountContractArtifact();
  }
}

/**
 * Compute the address of a schnorr account contract.
 * @param secret - A seed for deriving the signing key and public keys.
 * @param salt - The contract address salt.
 * @param signingPrivateKey - A specific signing private key that's not derived from the secret.
 */
export async function getSchnorrAccountContractAddress(secret: Fr, salt: Fr, signingPrivateKey?: GrumpkinScalar) {
  const signingKey = signingPrivateKey ?? deriveSigningKey(secret);
  const accountContract = new SchnorrAccountContract(signingKey);
  return await getAccountContractAddress(accountContract, secret, salt);
}
