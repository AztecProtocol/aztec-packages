/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import type { AztecAddress } from '@aztec/aztec.js';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SchnorrAccountContractJson from '../../artifacts/SchnorrAccount.json' with { type: 'json' };
import { SchnorrBaseAccountContract } from './account_contract.js';

export const SchnorrAccountContractArtifact = loadContractArtifact(SchnorrAccountContractJson as NoirCompiledContract);

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * Eagerly loads the contract artifact
 */
export class SchnorrAccountContract extends SchnorrBaseAccountContract {
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrAccountContractArtifact);
  }
}

/**
 * Compute the address of a schnorr account contract.
 * @param secret - A seed for deriving the signing key and public keys.
 * @param salt - The contract address salt.
 * @param signingPrivateKey - A specific signing private key that's not derived from the secret.
 */
export async function getSchnorrAccountContractAddress(
  secret: Fr,
  salt: Fr,
  signingPrivateKey?: GrumpkinScalar,
): Promise<AztecAddress> {
  const signingKey = signingPrivateKey ?? deriveSigningKey(secret);
  const accountContract = new SchnorrAccountContract(signingKey);
  return await getAccountContractAddress(accountContract, secret, salt);
}
