/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { SchnorrBaseAccountContract } from '../account_contract.js';

/**
 * Lazily loads the contract artifact
 * @returns The contract artifact for the schnorr account contract
 */
export async function getSchnorrInitializerlessAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  // Even if now supported by all major browsers, the MIME type is replaced with
  // "text/javascript"
  // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
  const { default: schnorrAccountContractJson } = await import('../../../artifacts/SchnorrInitializerlessAccount.json');
  return loadContractArtifact(schnorrAccountContractJson);
}

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * Lazily loads the contract artifact
 */
export class SchnorrInitializerlessAccountContract extends SchnorrBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getInitializationFunctionAndArgs() {
    return Promise.resolve(undefined);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return getSchnorrInitializerlessAccountContractArtifact();
  }
}

/**
 * Compute the address of a schnorr account contract.
 * @param secret - A seed for deriving the signing key and public keys.
 * @param salt - The contract address salt.
 * @param signingPrivateKey - A specific signing private key that's not derived from the secret.
 */
export async function getSchnorrInitializerlessAccountContractAddress(
  secret: Fr,
  salt: Fr,
  signingPrivateKey?: GrumpkinScalar,
): Promise<AztecAddress> {
  const signingKey = signingPrivateKey ?? deriveSigningKey(secret);
  const accountContract = new SchnorrInitializerlessAccountContract(signingKey);
  return await getAccountContractAddress(accountContract, secret, salt);
}
