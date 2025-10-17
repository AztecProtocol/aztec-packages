/**
 * Cryptographic hashing utilities for the Aztec Protocol.
 *
 * This module provides specialized hash functions used throughout the Aztec ecosystem:
 *
 * - **Note hashing**: Creating unique, siloed commitments for private notes
 * - **Nullifier hashing**: Generating nullifiers to mark notes as spent
 * - **Storage slot derivation**: Computing deterministic storage locations
 * - **Message hashing**: Cross-layer (L1<>L2) message commitments
 * - **Argument hashing**: Function parameter and return value commitments
 *
 * All hash functions use cryptographically secure primitives:
 * - **Poseidon2**: Circuit-friendly hash for most protocol operations
 * - **SHA-256**: Used for L1 compatibility (e.g., L2 to L1 messages)
 *
 * Key concepts:
 * - **Siloing**: Namespacing hashes to specific contracts to prevent collisions
 * - **Domain separation**: Using different generator indices to prevent cross-context attacks
 * - **Uniqueness**: Ensuring hashes remain unique even with identical inputs across contexts
 *
 * @example
 * ```typescript
 * import {
 *   siloNoteHash,
 *   siloNullifier,
 *   deriveStorageSlotInMap,
 *   computeSecretHash
 * } from '@aztec/stdlib/hash';
 *
 * // Create a siloed note hash
 * const siloed = await siloNoteHash(contractAddress, noteHash);
 *
 * // Compute a storage slot for a map entry
 * const slot = await deriveStorageSlotInMap(mapSlot, key);
 * ```
 *
 * @module hash
 */
export * from './hash.js';
export * from './map_slot.js';
