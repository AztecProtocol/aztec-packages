/**
 * Cryptographic key management for Aztec accounts.
 *
 * This module provides the complete key derivation hierarchy used in Aztec for account
 * management, privacy, and security. The key system is designed to enable:
 *
 * - **Privacy**: Separate keys for different operations prevent linking transactions
 * - **Security**: Hierarchical derivation from a single root secret
 * - **Flexibility**: Application-specific key derivation for contract isolation
 * - **Auditability**: Separate viewing keys for transaction history
 *
 * ## Key Types
 *
 * Aztec accounts use four primary master key pairs:
 *
 * 1. **Nullifier Keys (NSK/NPK)**: Used to generate nullifiers that mark notes as spent
 * 2. **Incoming Viewing Keys (IVSK/IVPK)**: Used to decrypt and identify incoming notes
 * 3. **Outgoing Viewing Keys (OVSK/OVPK)**: Used to decrypt outgoing transaction data
 * 4. **Tagging Keys (TSK/TPK)**: Used for efficient note discovery and tagging
 *
 * ## Key Hierarchy
 *
 * ```
 * Root Secret Key
 *     ├─ Master Nullifier Secret Key (NSK_M)
 *     │   └─ App Nullifier Keys (per contract)
 *     ├─ Master Incoming Viewing Secret Key (IVSK_M)
 *     │   └─ App Incoming Viewing Keys (per contract)
 *     ├─ Master Outgoing Viewing Secret Key (OVSK_M)
 *     │   └─ App Outgoing Viewing Keys (per contract)
 *     └─ Master Tagging Secret Key (TSK_M)
 *         └─ App Tagging Keys (per contract)
 * ```
 *
 * ## Address Derivation
 *
 * Addresses are deterministically derived from public keys and a partial address:
 *
 * ```
 * 1. Public Keys Hash = hash(NPK_M, IVPK_M, OVPK_M, TPK_M)
 * 2. Preaddress = hash(Public Keys Hash, Partial Address)
 * 3. Address Point = (Preaddress * G) + IVPK_M
 * 4. Address = Address Point.x
 * ```
 *
 * @example
 * ```typescript
 * import { deriveKeys, computeAddress } from '@aztec/stdlib/keys';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // Derive all keys from root secret
 * const rootSecret = Fr.random(); // In practice, from mnemonic
 * const {
 *   masterNullifierSecretKey,
 *   masterIncomingViewingSecretKey,
 *   publicKeys
 * } = await deriveKeys(rootSecret);
 *
 * // Compute address
 * const partialAddress = Fr.random();
 * const address = await computeAddress(publicKeys, partialAddress);
 *
 * // Derive app-specific keys
 * import { computeAppNullifierSecretKey } from '@aztec/stdlib/keys';
 * const appNsk = await computeAppNullifierSecretKey(
 *   masterNullifierSecretKey,
 *   contractAddress
 * );
 * ```
 *
 * @module keys
 * @see {@link https://docs.aztec.network/concepts/accounts/keys | Aztec Keys Documentation}
 */
export * from './derivation.js';
export * from './key_types.js';
export * from './utils.js';
export * from './public_key.js';
export * from './public_keys.js';
