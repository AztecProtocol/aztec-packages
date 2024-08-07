import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHashBuffer, poseidon2HashWithSeparator, sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { numToUInt8, numToUInt16BE, numToUInt32BE } from '@aztec/foundation/serialize';

import chunk from 'lodash.chunk';

import { ARGS_HASH_CHUNK_COUNT, ARGS_HASH_CHUNK_LENGTH, GeneratorIndex, MAX_ARGS_LENGTH } from '../constants.gen.js';
import { type ScopedL2ToL1Message, VerificationKey } from '../structs/index.js';

/**
 * Computes a hash of a given verification key.
 * @param vkBuf - The verification key.
 * @returns The hash of the verification key.
 */
export function hashVK(vkBuf: Buffer) {
  const vk = VerificationKey.fromBuffer(vkBuf);
  const toHash = Buffer.concat([
    numToUInt8(vk.circuitType),
    numToUInt16BE(5), // fr::coset_generator(0)?
    numToUInt32BE(vk.circuitSize),
    numToUInt32BE(vk.numPublicInputs),
    ...Object.values(vk.commitments)
      .map(e => [e.y.toBuffer(), e.x.toBuffer()])
      .flat(),
    // Montgomery form of fr::one()? Not sure. But if so, why?
    Buffer.from('1418144d5b080fcac24cdb7649bdadf246a6cb2426e324bedb94fb05118f023a', 'hex'),
  ]);
  return pedersenHashBuffer(toHash);
}

/**
 * Computes a note hash nonce, which will be used to create a unique note hash.
 * @param nullifierZero - The first nullifier in the tx.
 * @param noteHashIndex - The index of the note hash.
 * @returns A note hash nonce.
 */
export function computeNoteHashNonce(nullifierZero: Fr, noteHashIndex: number): Fr {
  return poseidon2HashWithSeparator([nullifierZero, noteHashIndex], GeneratorIndex.NOTE_HASH_NONCE);
}

/**
 * Computes a siloed note hash, given the contract address and the note hash itself.
 * A siloed note hash effectively namespaces a note hash to a specific contract.
 * @param contract - The contract address
 * @param uniqueNoteHash - The unique note hash to silo.
 * @returns A siloed note hash.
 */
export function siloNoteHash(contract: AztecAddress, uniqueNoteHash: Fr): Fr {
  return poseidon2HashWithSeparator([contract, uniqueNoteHash], GeneratorIndex.SILOED_NOTE_HASH);
}

/**
 * Computes a unique note hash.
 * @dev Includes a nonce which contains data that guarantees the resulting note hash will be unique.
 * @param nonce - A nonce (typically derived from tx hash and note hash index in the tx).
 * @param noteHash - A note hash.
 * @returns A unique note hash.
 */
export function computeUniqueNoteHash(nonce: Fr, noteHash: Fr): Fr {
  return poseidon2HashWithSeparator([nonce, noteHash], GeneratorIndex.UNIQUE_NOTE_HASH);
}

/**
 * Computes a siloed nullifier, given the contract address and the inner nullifier.
 * A siloed nullifier effectively namespaces a nullifier to a specific contract.
 * @param contract - The contract address.
 * @param innerNullifier - The nullifier to silo.
 * @returns A siloed nullifier.
 */
export function siloNullifier(contract: AztecAddress, innerNullifier: Fr): Fr {
  return poseidon2HashWithSeparator([contract, innerNullifier], GeneratorIndex.OUTER_NULLIFIER);
}

/**
 * Computes a public data tree value ready for insertion.
 * @param value - Raw public data tree value to hash into a tree-insertion-ready value.
 * @returns Value hash into a tree-insertion-ready value.

 */
export function computePublicDataTreeValue(value: Fr): Fr {
  return value;
}

/**
 * Computes a public data tree index from contract address and storage slot.
 * @param contractAddress - Contract where insertion is occurring.
 * @param storageSlot - Storage slot where insertion is occurring.
 * @returns Public data tree index computed from contract address and storage slot.

 */
export function computePublicDataTreeLeafSlot(contractAddress: AztecAddress, storageSlot: Fr): Fr {
  return poseidon2HashWithSeparator([contractAddress, storageSlot], GeneratorIndex.PUBLIC_LEAF_INDEX);
}

/**
 * Computes the hash of a list of arguments.
 * @param args - Arguments to hash.
 * @returns Pedersen hash of the arguments.
 */
export function computeVarArgsHash(args: Fr[]) {
  if (args.length === 0) {
    return Fr.ZERO;
  }
  if (args.length > MAX_ARGS_LENGTH) {
    throw new Error(`Hashing ${args.length} args exceeds max of ${MAX_ARGS_LENGTH}`);
  }

  let chunksHashes = chunk(args, ARGS_HASH_CHUNK_LENGTH).map((c: Fr[]) => {
    if (c.length < ARGS_HASH_CHUNK_LENGTH) {
      c = padArrayEnd(c, Fr.ZERO, ARGS_HASH_CHUNK_LENGTH);
    }
    return poseidon2HashWithSeparator(c, GeneratorIndex.FUNCTION_ARGS);
  });

  if (chunksHashes.length < ARGS_HASH_CHUNK_COUNT) {
    chunksHashes = padArrayEnd(chunksHashes, Fr.ZERO, ARGS_HASH_CHUNK_COUNT);
  }

  return poseidon2HashWithSeparator(chunksHashes, GeneratorIndex.FUNCTION_ARGS);
}

/**
 * Computes a hash of a secret.
 * @dev This function is used to generate secrets for the L1 to L2 message flow and for the TransparentNote.
 * @param secret - The secret to hash (could be generated however you want e.g. `Fr.random()`)
 * @returns The hash
 */
export function computeSecretHash(secret: Fr) {
  return poseidon2HashWithSeparator([secret], GeneratorIndex.SECRET_HASH);
}

export function computeL1ToL2MessageNullifier(
  contract: AztecAddress,
  messageHash: Fr,
  secret: Fr,
  messageIndex: bigint,
) {
  const innerMessageNullifier = poseidon2HashWithSeparator(
    [messageHash, secret, messageIndex],
    GeneratorIndex.MESSAGE_NULLIFIER,
  );
  return siloNullifier(contract, innerMessageNullifier);
}

/**
 * Calculates a siloed hash of a scoped l2 to l1 message.
 * @returns Fr containing 248 bits of information of sha256 hash.
 */
export function siloL2ToL1Message(l2ToL1Message: ScopedL2ToL1Message, version: Fr, chainId: Fr): Fr {
  if (l2ToL1Message.contractAddress.isZero()) {
    return Fr.ZERO;
  }
  // Left-pad recipient to 32 bytes to match what the circuit is doing
  // TODO: Only hash 20 bytes for l2l1 recipient everywhere.
  const paddedRecipient = Buffer.alloc(32);
  l2ToL1Message.message.recipient.toBuffer().copy(paddedRecipient, 12);

  const preimage = Buffer.concat([
    l2ToL1Message.contractAddress.toBuffer(),
    version.toBuffer(),
    paddedRecipient,
    chainId.toBuffer(),
    l2ToL1Message.message.content.toBuffer(),
  ]);
  return Fr.fromBuffer(sha256Trunc(preimage));
}
