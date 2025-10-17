/**
 * ECDSA account contract implementations for Aztec.
 *
 * @remarks
 * This module exports three ECDSA-based account contract variants:
 *
 * 1. **ECDSA K (secp256k1)** - {@link EcdsaKAccountContract}
 *    - Uses the Koblitz curve (secp256k1), same as Bitcoin and Ethereum
 *    - Ideal for Ethereum wallet integration (MetaMask, WalletConnect, Ledger)
 *    - Maximum compatibility with existing Ethereum tooling
 *    - ~128 bits of security
 *
 * 2. **ECDSA R (secp256r1/P-256)** - {@link EcdsaRAccountContract}
 *    - Uses the NIST P-256 curve (secp256r1)
 *    - NIST-standardized and FIPS 186-4 compliant
 *    - Supported by hardware security modules and secure enclaves
 *    - Compatible with WebAuthn/FIDO2 (passkeys, YubiKey, biometrics)
 *    - ~128 bits of security
 *
 * 3. **SSH ECDSA R** - {@link EcdsaRSSHAccountContract}
 *    - Delegates signing to an SSH agent
 *    - Hardware security key integration without custom code
 *    - Private key never exposed to the application
 *    - Requires SSH agent with loaded secp256r1 key
 *
 * ## ECDSA vs Schnorr
 *
 * ### When to use ECDSA:
 * - Ethereum wallet integration required
 * - Hardware security module support needed
 * - WebAuthn/FIDO2 authentication desired
 * - NIST compliance required
 * - Users already have ECDSA keys
 *
 * ### When to use Schnorr:
 * - Aztec-native applications (recommended default)
 * - No external wallet integration needed
 * - Smaller proof sizes desired
 * - Native Grumpkin curve support preferred
 * - Simpler key derivation needed
 *
 * ### Key Differences:
 *
 * | Feature | ECDSA | Schnorr |
 * |---------|-------|---------|
 * | Curve | secp256k1/secp256r1 | Grumpkin |
 * | Ethereum Compatible | Yes (K variant) | No |
 * | Proof Size | Larger | Smaller |
 * | Signature Size | 64 bytes | 64 bytes |
 * | Verification Cost | Higher | Lower |
 * | Key Derivation | Complex | Native |
 * | Hardware Wallet Support | Excellent | Limited |
 *
 * @example Using ECDSA K for Ethereum compatibility
 * ```typescript
 * import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
 *
 * // Use existing Ethereum private key
 * const ethereumPrivateKey = Buffer.from('...', 'hex');
 * const account = new EcdsaKAccountContract(ethereumPrivateKey);
 * ```
 *
 * @example Using ECDSA R with SSH agent
 * ```typescript
 * import { EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
 * import { getIdentities } from '@aztec/accounts/utils';
 *
 * // Use hardware key via SSH agent
 * const identities = await getIdentities();
 * const p256Key = identities.find(k => k.type === 'ecdsa-sha2-nistp256');
 * const publicKey = Buffer.from(p256Key.publicKey, 'base64');
 * const account = new EcdsaRSSHAccountContract(publicKey);
 * ```
 *
 * @packageDocumentation
 * @see {@link SchnorrAccountContract} for the recommended Aztec-native alternative
 */

export * from './ecdsa_k/index.js';
export * from './ecdsa_r/index.js';
export * from './ssh_ecdsa_r/index.js';
