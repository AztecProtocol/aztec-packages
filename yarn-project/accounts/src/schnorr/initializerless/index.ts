/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SchnorrInitializerlessAccountContractJson from '../../../artifacts/SchnorrInitializerlessAccount.json' with { type: 'json' };
import { SchnorrBaseAccountContract } from '../account_contract.js';

export const SchnorrInitializerlessAccountContractArtifact = loadContractArtifact(
  SchnorrInitializerlessAccountContractJson as NoirCompiledContract,
);

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * Eagerly loads the contract artifact
 */
export class SchnorrInitializerlessAccountContract extends SchnorrBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getInitializationFunctionAndArgs() {
    return Promise.resolve(undefined);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrInitializerlessAccountContractArtifact);
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
  const signingPublicKey = await new Schnorr().computePublicKey(signingKey);
  const immutablesHash = await poseidon2Hash([signingPublicKey.x, signingPublicKey.y]);
  return await getAccountContractAddress(accountContract, secret, salt, immutablesHash);
}
