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

/**
 * Pre-loaded contract artifact for the Schnorr account contract.
 *
 * @remarks
 * This artifact is eagerly loaded at import time and contains the compiled circuit
 * and ABI information needed to deploy and interact with Schnorr account contracts.
 * Use this when you need immediate access to the artifact without async loading.
 */
export const SchnorrAccountContractArtifact = loadContractArtifact(SchnorrAccountContractJson as NoirCompiledContract);

/**
 * Schnorr account contract implementation with eager artifact loading.
 *
 * @remarks
 * This is the recommended account contract for Aztec-native applications. It uses
 * Schnorr signatures over the Grumpkin curve, which is optimized for Aztec's
 * zero-knowledge proof system.
 *
 * Key features:
 * - Uses Grumpkin curve optimized for Aztec's circuits
 * - Smaller proof sizes compared to ECDSA accounts
 * - Lower verification costs in zero-knowledge proofs
 * - Native key derivation support
 * - Deterministic signatures for security
 * - Eager artifact loading for immediate availability
 *
 * Use cases:
 * - Aztec-native applications (recommended default)
 * - Applications not requiring Ethereum wallet integration
 * - Scenarios prioritizing proof efficiency over hardware wallet support
 * - Projects using Aztec's native key derivation scheme
 * - Applications where users don't have existing ECDSA keys
 *
 * Comparison with ECDSA:
 * - Choose Schnorr for: Aztec-native apps, smaller proofs, simpler keys
 * - Choose ECDSA for: Ethereum integration, hardware wallets, existing keys
 *
 * @example Basic usage with derived keys
 * ```typescript
 * import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
 * import { deriveSigningKey } from '@aztec/stdlib/keys';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // Derive signing key from secret
 * const secret = Fr.random();
 * const signingKey = deriveSigningKey(secret);
 *
 * // Create account
 * const account = new SchnorrAccountContract(signingKey);
 *
 * // Deploy the account
 * const salt = Fr.random();
 * const wallet = await deployAccount(pxe, account, secret, salt);
 * ```
 *
 * @example Computing account address before deployment
 * ```typescript
 * import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * const secret = Fr.random();
 * const salt = Fr.random();
 *
 * // Compute address deterministically
 * const address = await getSchnorrAccountContractAddress(secret, salt);
 * console.log('Account will be deployed at:', address.toString());
 * ```
 *
 * @see {@link EcdsaKAccountContract} for Ethereum-compatible alternative
 * @see {@link EcdsaRAccountContract} for NIST-compliant alternative
 * @see {@link getSchnorrAccountContractAddress} for computing addresses
 */
export class SchnorrAccountContract extends SchnorrBaseAccountContract {
  /**
   * Creates a new Schnorr account contract with eager artifact loading.
   *
   * @param signingPrivateKey - The Grumpkin scalar private key used for signing
   *
   * @remarks
   * The signing key should typically be derived from a secret using {@link deriveSigningKey}.
   * The contract artifact is loaded synchronously at import time, making it immediately
   * available for deployment. For lazy loading, use the lazy variant.
   */
  constructor(signingPrivateKey: GrumpkinScalar) {
    super(signingPrivateKey);
  }

  /**
   * Returns the pre-loaded contract artifact.
   *
   * @returns A promise resolving to the Schnorr account contract artifact
   *
   * @remarks
   * This implementation returns the eagerly-loaded artifact. The method is async
   * to maintain interface compatibility with lazy-loading implementations.
   */
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrAccountContractArtifact);
  }
}

/**
 * Computes the address of a Schnorr account contract before deployment.
 *
 * @param secret - The secret seed for deriving the signing key and encryption keys
 * @param salt - A random salt for the contract deployment address
 * @param signingPrivateKey - Optional specific signing key (overrides derived key)
 * @returns A promise resolving to the computed Aztec address
 *
 * @remarks
 * This function deterministically computes the address where a Schnorr account contract
 * will be deployed given a secret and salt. This is useful for:
 * - Pre-computing addresses before deployment
 * - Verifying that a deployment will result in the expected address
 * - Sending funds to an address before the account is deployed
 *
 * The address depends on:
 * - The contract artifact (code hash)
 * - The constructor arguments (derived public key)
 * - The deployer (usually zero for account contracts)
 * - The salt parameter
 *
 * By default, the signing key is derived from the secret using Aztec's standard
 * key derivation. You can optionally provide a specific signing key if you want
 * to use a custom key that's not derived from the secret.
 *
 * @example Pre-computing account address
 * ```typescript
 * import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // Generate secret and salt
 * const secret = Fr.random();
 * const salt = Fr.random();
 *
 * // Compute address before deployment
 * const expectedAddress = await getSchnorrAccountContractAddress(secret, salt);
 *
 * // Now you can send funds to this address before deploying
 * // The account can be deployed later with the same secret and salt
 * ```
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
