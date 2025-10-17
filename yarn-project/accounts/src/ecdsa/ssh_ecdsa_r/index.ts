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
 * SSH-delegated ECDSA R account contract with eager artifact loading.
 *
 * @remarks
 * This account contract delegates all signing operations to an SSH agent, enabling secure
 * integration with hardware security keys and hardware-backed keystores without exposing
 * private keys to the application.
 *
 * Key features:
 * - Delegates signing to SSH agent (private key never exposed)
 * - Compatible with hardware keys (YubiKey, Nitrokey, etc.)
 * - Uses secp256r1/P-256 curve (same as standard ECDSA R)
 * - Public key stored in an encrypted note for privacy
 * - Eager artifact loading for immediate availability
 * - Signature normalization for Aztec compatibility
 *
 * Use cases:
 * - Hardware security key integration (YubiKey 5 with FIDO2)
 * - SSH-based signing infrastructure
 * - Hardware-backed key storage via SSH
 * - Applications requiring hardware attestation
 * - Zero-knowledge private key management
 *
 * Requirements:
 * - SSH agent must be running (SSH_AUTH_SOCK environment variable set)
 * - secp256r1 key must be loaded in the SSH agent
 * - Key type must be 'ecdsa-sha2-nistp256'
 *
 * @example
 * ```typescript
 * import { EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
 * import { getIdentities } from '@aztec/accounts/utils';
 *
 * // List available keys in SSH agent
 * const identities = await getIdentities();
 * const p256Key = identities.find(k => k.type === 'ecdsa-sha2-nistp256');
 *
 * // Extract public key from SSH agent response
 * const publicKey = Buffer.from(p256Key.publicKey, 'base64');
 *
 * // Create account (private key stays in SSH agent)
 * const account = new EcdsaRSSHAccountContract(publicKey);
 *
 * // Deploy the account (will prompt for hardware key interaction)
 * const wallet = await deployAccount(pxe, account, secret, salt);
 * ```
 *
 * @see {@link EcdsaRAccountContract} for standard secp256r1 signing with private keys
 * @see {@link getIdentities} for listing SSH agent keys
 * @see {@link signWithAgent} for SSH agent signing details
 */
export class EcdsaRSSHAccountContract extends EcdsaRSSHBaseAccountContract {
  /**
   * Creates a new SSH-delegated ECDSA R account contract.
   *
   * @param signingPublicKey - The secp256r1 public key (64 bytes) identifying the SSH agent key
   *
   * @remarks
   * The public key must match a key loaded in the SSH agent. Use {@link getIdentities}
   * to discover available keys. The contract artifact is loaded synchronously at import time.
   */
  constructor(signingPublicKey: Buffer) {
    super(signingPublicKey);
  }

  /**
   * Returns the pre-loaded contract artifact.
   *
   * @returns A promise resolving to the ECDSA R account contract artifact
   *
   * @remarks
   * This implementation reuses the standard ECDSA R artifact since the on-chain
   * verification logic is identical. Only the signing mechanism differs (SSH agent vs. local).
   */
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(EcdsaRAccountContractArtifact);
  }
}
