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

/**
 * Pre-loaded contract artifact for the ECDSA K (secp256k1) account contract.
 *
 * @remarks
 * This artifact is eagerly loaded at import time and contains the compiled circuit
 * and ABI information needed to deploy and interact with ECDSA K account contracts.
 * Use this when you need immediate access to the artifact without async loading.
 */
export const EcdsaKAccountContractArtifact: ContractArtifact = loadContractArtifact(
  EcdsaKAccountContractJson as NoirCompiledContract,
);

/**
 * ECDSA K account contract implementation with eager artifact loading.
 *
 * @remarks
 * This account contract authenticates transactions using ECDSA signatures verified against
 * a secp256k1 public key. The "K" suffix indicates it uses the Koblitz curve (secp256k1),
 * which is the same elliptic curve used by Bitcoin and Ethereum.
 *
 * Key features:
 * - Uses secp256k1 curve for maximum compatibility with Ethereum ecosystem
 * - Public key stored in an encrypted note for privacy
 * - Deterministic signatures (RFC 6979) for security
 * - Eager artifact loading for immediate availability
 *
 * Use cases:
 * - Ethereum wallet integration (MetaMask, WalletConnect, Ledger, etc.)
 * - Cross-chain applications requiring secp256k1 signatures
 * - Scenarios where users already have Ethereum keys
 * - Applications that need synchronous artifact access
 *
 * @example
 * ```typescript
 * import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
 *
 * // Create account with existing secp256k1 private key
 * const privateKey = Buffer.from('...'); // 32 bytes
 * const account = new EcdsaKAccountContract(privateKey);
 *
 * // Deploy the account
 * const wallet = await deployAccount(pxe, account, secret, salt);
 * ```
 *
 * @see {@link EcdsaRAccountContract} for secp256r1 (P-256/NIST curve) alternative
 * @see {@link SchnorrAccountContract} for Grumpkin-based Schnorr signatures (recommended for Aztec-native use)
 */
export class EcdsaKAccountContract extends EcdsaKBaseAccountContract {
  /**
   * Creates a new ECDSA K account contract with eager artifact loading.
   *
   * @param signingPrivateKey - The secp256k1 private key (32 bytes) used for signing
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
   * @returns A promise resolving to the ECDSA K account contract artifact
   *
   * @remarks
   * This implementation returns the eagerly-loaded artifact. The method is async
   * to maintain interface compatibility with lazy-loading implementations.
   */
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaKAccountContractArtifact);
  }
}
