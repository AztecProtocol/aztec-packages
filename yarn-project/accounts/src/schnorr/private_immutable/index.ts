/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
<<<<<<< HEAD
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SchnorrAccountContractJson from '../../../artifacts/SchnorrAccount.json' with { type: 'json' };
=======
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SchnorrAccountContractJson from '../../../artifacts/SchnorrAccount.json' with { type: 'json' };
import { deriveSecretKeyFromSigningKey } from '../../utils/key_derivation.js';
>>>>>>> origin/v5-next
import { SchnorrBaseAccountContract } from '../account_contract.js';

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
<<<<<<< HEAD
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
=======
 * @param signingPrivateKey - The account's signing private key.
 * @param salt - The contract address salt.
 * @param secretKey - Seed for the account's privacy keys. Derived from the signing key when omitted.
 */
export async function getSchnorrAccountContractAddress(
  signingPrivateKey: GrumpkinScalar,
  salt: Fr,
  secretKey?: Fr,
): Promise<AztecAddress> {
  const resolvedSecretKey = secretKey ?? (await deriveSecretKeyFromSigningKey(signingPrivateKey));
  const accountContract = new SchnorrAccountContract(signingPrivateKey);
  return await getAccountContractAddress(accountContract, resolvedSecretKey, salt);
>>>>>>> origin/v5-next
}
