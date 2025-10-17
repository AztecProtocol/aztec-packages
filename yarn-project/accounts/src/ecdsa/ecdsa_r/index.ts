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

/**
 * Pre-loaded contract artifact for the ECDSA R (secp256r1/P-256) account contract.
 *
 * @remarks
 * This artifact is eagerly loaded at import time and contains the compiled circuit
 * and ABI information needed to deploy and interact with ECDSA R account contracts.
 * Use this when you need immediate access to the artifact without async loading.
 */
export const EcdsaRAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaRAccountContractJson as NoirCompiledContract,
);

/**
 * ECDSA R account contract implementation with eager artifact loading.
 *
 * @remarks
 * This account contract authenticates transactions using ECDSA signatures verified against
 * a secp256r1 public key. The "R" suffix indicates it uses the secp256r1 curve (also known
 * as P-256 or NIST P-256), which is the NIST-standardized elliptic curve.
 *
 * Key features:
 * - Uses secp256r1/P-256 curve (NIST-standardized, FIPS 186-4 compliant)
 * - Public key stored in an encrypted note for privacy
 * - Deterministic signatures (RFC 6979) for security
 * - Eager artifact loading for immediate availability
 * - Compatible with WebAuthn/FIDO2 and hardware security modules
 *
 * Use cases:
 * - WebAuthn/FIDO2 integration (passkeys, YubiKey, Touch ID, Face ID)
 * - Hardware security modules (HSMs) and secure enclaves
 * - Government and enterprise applications requiring NIST compliance
 * - iOS Secure Enclave and Android StrongBox integration
 * - Applications that need synchronous artifact access
 *
 * @example
 * ```typescript
 * import { EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
 *
 * // Create account with existing secp256r1 private key
 * const privateKey = Buffer.from('...'); // 32 bytes
 * const account = new EcdsaRAccountContract(privateKey);
 *
 * // Deploy the account
 * const wallet = await deployAccount(pxe, account, secret, salt);
 * ```
 *
 * @see {@link EcdsaKAccountContract} for secp256k1 (Ethereum-compatible) alternative
 * @see {@link EcdsaRSSHAccountContract} for SSH agent delegation with secp256r1 keys
 * @see {@link SchnorrAccountContract} for Grumpkin-based Schnorr signatures (recommended for Aztec-native use)
 */
export class EcdsaRAccountContract extends EcdsaRBaseAccountContract {
  /**
   * Creates a new ECDSA R account contract with eager artifact loading.
   *
   * @param signingPrivateKey - The secp256r1 private key (32 bytes) used for signing
   *
   * @remarks
   * The contract artifact is loaded synchronously at import time, making it immediately
   * available for deployment. For lazy loading (useful in browsers or when minimizing
   * initial bundle size), use the lazy variant from `@aztec/accounts/ecdsa/lazy`.
   */
  constructor(signingPrivateKey: Buffer) {
    super(signingPrivateKey);
  }

  /**
   * Returns the pre-loaded contract artifact.
   *
   * @returns A promise resolving to the ECDSA R account contract artifact
   *
   * @remarks
   * This implementation returns the eagerly-loaded artifact. The method is async
   * to maintain interface compatibility with lazy-loading implementations.
   */
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaRAccountContractArtifact);
  }
}
