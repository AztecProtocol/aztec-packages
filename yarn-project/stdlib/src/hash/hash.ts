import { GeneratorIndex } from '@aztec/constants';
import { poseidon2Hash, poseidon2HashWithSeparator, sha256ToField } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

/**
 * Computes a hash of a verification key for circuit verification.
 *
 * This function hashes a verification key represented as an array of field elements
 * using the Poseidon2 hash function. The implementation must match the verification
 * key hashing in the Barretenberg proving system.
 *
 * @param keyAsFields - The verification key serialized as an array of field elements
 * @returns A promise that resolves to the hash of the verification key
 *
 * @remarks
 * This implementation must match barretenberg/cpp/src/barretenberg/flavor/flavor.hpp > hash()
 * to ensure consistency between TypeScript and C++ verification key handling.
 *
 * @example
 * ```typescript
 * const vkFields = [...]; // Verification key as field elements
 * const vkHash = await hashVK(vkFields);
 * ```
 */
export async function hashVK(keyAsFields: Fr[]): Promise<Fr> {
  // Should match the implementation in barretenberg/cpp/src/barretenberg/flavor/flavor.hpp > hash()
  return await poseidon2Hash(keyAsFields);
}

/**
 * Computes a note hash nonce for creating unique note identifiers.
 *
 * The nonce is derived from the first nullifier in a transaction and the note's index,
 * ensuring that each note hash is unique even if the same note data is used multiple times.
 *
 * @param nullifierZero - The first nullifier in the transaction (used as entropy)
 * @param noteHashIndex - The index of the note hash within the transaction
 * @returns A promise that resolves to a unique note hash nonce
 *
 * @remarks
 * This nonce is a critical component of Aztec's note uniqueness mechanism. It prevents
 * duplicate note hashes when the same note data appears in multiple transactions.
 *
 * @example
 * ```typescript
 * const nonce = await computeNoteHashNonce(firstNullifier, 0);
 * const uniqueHash = await computeUniqueNoteHash(nonce, siloedNoteHash);
 * ```
 */
export function computeNoteHashNonce(nullifierZero: Fr, noteHashIndex: number): Promise<Fr> {
  return poseidon2HashWithSeparator([nullifierZero, noteHashIndex], GeneratorIndex.NOTE_HASH_NONCE);
}

/**
 * Computes a siloed note hash by namespacing it to a specific contract.
 *
 * Siloing prevents note hash collisions between different contracts and ensures
 * that note hashes are unique to their originating contract.
 *
 * @param contract - The contract address that created the note
 * @param noteHash - The raw note hash to be siloed
 * @returns A promise that resolves to the siloed note hash
 *
 * @remarks
 * Siloing is essential for:
 * - Preventing cross-contract note hash collisions
 * - Ensuring notes can only be consumed by the correct contract
 * - Maintaining contract isolation in the note tree
 *
 * @example
 * ```typescript
 * const rawNoteHash = await computeNoteHash(noteData);
 * const siloed = await siloNoteHash(contractAddress, rawNoteHash);
 * ```
 */
export function siloNoteHash(contract: AztecAddress, noteHash: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contract, noteHash], GeneratorIndex.SILOED_NOTE_HASH);
}

/**
 * Computes a globally unique note hash from a nonce and siloed note hash.
 *
 * This is the final step in creating a note hash that will be inserted into the note tree.
 * The unique note hash ensures that even identical notes in different transactions have
 * different commitments.
 *
 * @param noteNonce - The nonce computed for this note (from nullifierZero and index)
 * @param siloedNoteHash - The note hash already siloed to its contract
 * @returns A promise that resolves to the globally unique note hash
 *
 * @remarks
 * The uniqueness guarantee is crucial for:
 * - Preventing replay attacks
 * - Ensuring each note has a unique identifier in the tree
 * - Maintaining the integrity of the note commitment scheme
 *
 * @example
 * ```typescript
 * const nonce = await computeNoteHashNonce(firstNullifier, noteIndex);
 * const siloed = await siloNoteHash(contract, noteHash);
 * const unique = await computeUniqueNoteHash(nonce, siloed);
 * // unique can now be safely inserted into the note tree
 * ```
 */
export function computeUniqueNoteHash(noteNonce: Fr, siloedNoteHash: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([noteNonce, siloedNoteHash], GeneratorIndex.UNIQUE_NOTE_HASH);
}

/**
 * Computes a siloed nullifier by namespacing it to a specific contract.
 *
 * Siloing nullifiers to their originating contract prevents cross-contract interference
 * and ensures that nullifiers are unique to their contract context.
 *
 * @param contract - The contract address that created the nullifier
 * @param innerNullifier - The raw (inner) nullifier to be siloed
 * @returns A promise that resolves to the siloed (outer) nullifier
 *
 * @remarks
 * Nullifier siloing is critical for:
 * - Preventing one contract from nullifying another contract's notes
 * - Maintaining contract-level isolation of spent note tracking
 * - Avoiding nullifier collisions between contracts
 *
 * The siloed nullifier is what gets inserted into the global nullifier tree.
 *
 * @example
 * ```typescript
 * const innerNullifier = await computeInnerNullifier(note, secret);
 * const outerNullifier = await siloNullifier(contractAddress, innerNullifier);
 * // outerNullifier can now be emitted and inserted into the nullifier tree
 * ```
 */
export function siloNullifier(contract: AztecAddress, innerNullifier: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contract, innerNullifier], GeneratorIndex.OUTER_NULLIFIER);
}

/**
 * Computes a siloed private log tag by namespacing it to a specific contract.
 *
 * Siloing log tags ensures that logs are properly attributed to their originating
 * contract and prevents cross-contract log confusion.
 *
 * @param contract - The contract address that emitted the log
 * @param unsiloedTag - The raw log tag before siloing
 * @returns A promise that resolves to the siloed log tag
 *
 * @remarks
 * Log tag siloing helps with:
 * - Identifying which contract emitted a log
 * - Filtering logs by contract
 * - Preventing log tag collisions between contracts
 *
 * @example
 * ```typescript
 * const rawTag = Fr.fromString('my_event');
 * const siloedTag = await siloPrivateLog(contractAddress, rawTag);
 * ```
 */
export function siloPrivateLog(contract: AztecAddress, unsiloedTag: Fr): Promise<Fr> {
  return poseidon2Hash([contract, unsiloedTag]);
}

/**
 * Prepares a public data tree value for insertion.
 *
 * Currently this is an identity function, but it exists as a placeholder for potential
 * future transformations of public state values before tree insertion.
 *
 * @param value - Raw public data tree value
 * @returns The tree-insertion-ready value (currently unchanged)
 *
 * @remarks
 * This function is kept for API consistency and future extensibility. If the protocol
 * later requires transformation of public values before insertion, this function
 * will be updated accordingly.
 */
export function computePublicDataTreeValue(value: Fr): Fr {
  return value;
}

/**
 * Computes the storage slot index in the public data tree.
 *
 * This function combines a contract address and storage slot into a single field element
 * that serves as the key in the public data tree. This ensures that public storage
 * slots are namespaced to their contract.
 *
 * @param contractAddress - The contract that owns the storage slot
 * @param storageSlot - The storage slot number within the contract
 * @returns A promise that resolves to the public data tree leaf slot
 *
 * @remarks
 * The leaf slot is computed as: `poseidon2([contractAddress, storageSlot], PUBLIC_LEAF_INDEX)`
 * This ensures:
 * - Storage slots are scoped to their contract
 * - Different contracts can use the same slot number without collision
 * - The public data tree maintains a global view of all public state
 *
 * @example
 * ```typescript
 * const slot = await computePublicDataTreeLeafSlot(contractAddr, Fr.fromNumber(5));
 * // Use slot to read/write public data in the tree
 * ```
 */
export function computePublicDataTreeLeafSlot(contractAddress: AztecAddress, storageSlot: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contractAddress, storageSlot], GeneratorIndex.PUBLIC_LEAF_INDEX);
}

/**
 * Computes a hash of function arguments or return values.
 *
 * This function is used in multiple contexts:
 * - Hashing private function input arguments
 * - Hashing private function return values
 * - Creating authentication witnesses (authwit)
 *
 * @param args - Array of field elements representing the arguments
 * @returns A promise that resolves to the arguments hash (or Fr.ZERO for empty arrays)
 *
 * @remarks
 * Empty argument lists hash to zero for efficiency. Non-empty lists use Poseidon2
 * with a domain separator to ensure the hash cannot collide with other protocol hashes.
 *
 * @example
 * ```typescript
 * // Hash function arguments
 * const argsHash = await computeVarArgsHash([Fr.fromNumber(1), Fr.fromNumber(2)]);
 *
 * // Empty args hash to zero
 * const emptyHash = await computeVarArgsHash([]); // Fr.ZERO
 * ```
 */
export function computeVarArgsHash(args: Fr[]): Promise<Fr> {
  if (args.length === 0) {
    return Promise.resolve(Fr.ZERO);
  }

  return poseidon2HashWithSeparator(args, GeneratorIndex.FUNCTION_ARGS);
}

/**
 * Computes a hash of public function calldata.
 *
 * This hash is used to commit to the calldata in public function calls,
 * allowing the data to be passed without revealing it immediately.
 *
 * @param calldata - Array of field elements representing the calldata
 * @returns A promise that resolves to the calldata hash
 *
 * @remarks
 * The calldata hash uses a different generator index than regular function arguments
 * to maintain domain separation between private and public function contexts.
 *
 * @example
 * ```typescript
 * const calldata = [Fr.fromNumber(100), Fr.fromNumber(200)];
 * const calldataHash = await computeCalldataHash(calldata);
 * ```
 */
export function computeCalldataHash(calldata: Fr[]): Promise<Fr> {
  return poseidon2HashWithSeparator(calldata, GeneratorIndex.PUBLIC_CALLDATA);
}

/**
 * Computes a hash of a secret value for hiding sensitive information.
 *
 * This function is used in several protocol features:
 * - L1 to L2 message secrets (for consuming messages privately)
 * - TransparentNote secret hashing
 * - Other privacy-preserving mechanisms requiring secret commitments
 *
 * @param secret - The secret to hash (e.g., from Fr.random() or user input)
 * @returns A promise that resolves to the secret hash
 *
 * @remarks
 * The secret hash is one-way and computationally infeasible to reverse.
 * Users must remember or store their secrets separately to later prove knowledge.
 *
 * @security
 * Secrets should be generated with sufficient entropy (at least 128 bits).
 * Never reuse secrets across different contexts.
 *
 * @example
 * ```typescript
 * // Generate and hash a random secret
 * const secret = Fr.random();
 * const secretHash = await computeSecretHash(secret);
 *
 * // Later, prove knowledge of the secret by providing both
 * // the secret and its hash
 * ```
 */
export function computeSecretHash(secret: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([secret], GeneratorIndex.SECRET_HASH);
}

/**
 * Computes the nullifier for consuming an L1 to L2 message.
 *
 * This nullifier prevents double-spending of L1 to L2 messages by creating a unique
 * commitment that gets added to the nullifier tree when the message is consumed.
 *
 * @param contract - The contract address consuming the message
 * @param messageHash - The hash of the L1 to L2 message content
 * @param secret - The secret required to consume the message
 * @returns A promise that resolves to the message nullifier
 *
 * @remarks
 * The nullifier is computed as:
 * 1. innerNullifier = poseidon2([messageHash, secret])
 * 2. outerNullifier = siloNullifier(contract, innerNullifier)
 *
 * This ensures:
 * - Only someone with the secret can compute the nullifier
 * - The nullifier is unique to the contract consuming it
 * - Once emitted, the message cannot be consumed again
 *
 * @example
 * ```typescript
 * const nullifier = await computeL1ToL2MessageNullifier(
 *   contractAddress,
 *   messageHash,
 *   secret
 * );
 * // Emit nullifier to mark message as consumed
 * ```
 */
export async function computeL1ToL2MessageNullifier(contract: AztecAddress, messageHash: Fr, secret: Fr) {
  const innerMessageNullifier = await poseidon2HashWithSeparator(
    [messageHash, secret],
    GeneratorIndex.MESSAGE_NULLIFIER,
  );
  return siloNullifier(contract, innerMessageNullifier);
}

/**
 * Computes the hash of an L2 to L1 message for cross-chain communication.
 *
 * This hash represents a message sent from an L2 contract to an L1 address.
 * The hash includes all necessary context to uniquely identify and validate
 * the message on L1.
 *
 * @param params - Message parameters
 * @param params.l2Sender - The Aztec address sending the message
 * @param params.l1Recipient - The Ethereum address receiving the message
 * @param params.content - The message content as a field element
 * @param params.rollupVersion - The rollup version for replay protection
 * @param params.chainId - The chain ID for additional replay protection
 * @returns The SHA-256 hash of the message (truncated to fit in a field element)
 *
 * @remarks
 * - Uses SHA-256 (not Poseidon) for L1 compatibility
 * - The hash is truncated to 248 bits to fit in a field element
 * - All message components are included to prevent replay attacks
 *
 * @example
 * ```typescript
 * const messageHash = computeL2ToL1MessageHash({
 *   l2Sender: contractAddress,
 *   l1Recipient: ethAddress,
 *   content: Fr.fromNumber(42),
 *   rollupVersion: Fr.fromNumber(1),
 *   chainId: Fr.fromNumber(31337),
 * });
 * ```
 */
export function computeL2ToL1MessageHash({
  l2Sender,
  l1Recipient,
  content,
  rollupVersion,
  chainId,
}: {
  l2Sender: AztecAddress;
  l1Recipient: EthAddress;
  content: Fr;
  rollupVersion: Fr;
  chainId: Fr;
}) {
  return sha256ToField([l2Sender, rollupVersion, l1Recipient, chainId, content]);
}
