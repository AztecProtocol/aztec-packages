import { DomainSeparator, NULL_MSG_SENDER_CONTRACT_ADDRESS } from '@aztec/constants';
import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';

import { AztecAddress } from '../aztec-address/index.js';

/**
 * Computes a hash of a given verification key.
 * @param keyAsFields - The verification key as fields.
 * @returns The hash of the verification key.
 */
export async function hashVK(keyAsFields: Fr[]): Promise<Fr> {
  // Should match the implementation in barretenberg/cpp/src/barretenberg/flavor/flavor.hpp > hash()
  return await poseidon2Hash(keyAsFields);
}

/**
 * Computes a note hash nonce, which will be used to create a unique note hash.
 * @param nullifierZero - The first nullifier in the tx.
 * @param noteHashIndex - The index of the note hash.
 * @returns A note hash nonce.
 */
export function computeNoteHashNonce(nullifierZero: Fr, noteHashIndex: number): Promise<Fr> {
  return poseidon2HashWithSeparator([nullifierZero, noteHashIndex], DomainSeparator.NOTE_HASH_NONCE);
}

/**
 * Computes a siloed note hash, given the contract address and the note hash itself.
 * A siloed note hash effectively namespaces a note hash to a specific contract.
 * @param contract - The contract address
 * @param noteHash - The note hash to silo.
 * @returns A siloed note hash.
 */
export function siloNoteHash(contract: AztecAddress, noteHash: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contract, noteHash], DomainSeparator.SILOED_NOTE_HASH);
}

/**
 * Computes a unique note hash.
 * @param noteNonce - The nonce that was injected into the note hash preimage in order to guarantee uniqueness.
 * @param siloedNoteHash - A siloed note hash.
 * @returns A unique note hash.
 */
export function computeUniqueNoteHash(noteNonce: Fr, siloedNoteHash: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([noteNonce, siloedNoteHash], DomainSeparator.UNIQUE_NOTE_HASH);
}

/**
 * Computes a siloed nullifier, given the contract address and the inner nullifier.
 * A siloed nullifier effectively namespaces a nullifier to a specific contract.
 * @param contract - The contract address.
 * @param innerNullifier - The nullifier to silo.
 * @returns A siloed nullifier.
 */
export function siloNullifier(contract: AztecAddress, innerNullifier: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contract, innerNullifier], DomainSeparator.SILOED_NULLIFIER);
}

/**
 * Computes the protocol nullifier, which is the hash of the initial tx request siloed with the null msg sender address.
 * @param txRequestHash - The hash of the initial tx request.
 * @returns The siloed value of the protocol nullifier.
 *
 * @dev Must match the implementation in noir-protocol-circuits/crates/types/src/hash.nr > compute_protocol_nullifier
 */
export function computeProtocolNullifier(txRequestHash: Fr): Promise<Fr> {
  return siloNullifier(AztecAddress.fromBigInt(NULL_MSG_SENDER_CONTRACT_ADDRESS), txRequestHash);
}

export function computeSiloedPrivateLogFirstField(contract: AztecAddress, field: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contract, field], DomainSeparator.PRIVATE_LOG_FIRST_FIELD);
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
export function computePublicDataTreeLeafSlot(contractAddress: AztecAddress, storageSlot: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([contractAddress, storageSlot], DomainSeparator.PUBLIC_LEAF_SLOT);
}

/**
 * Computes the hash of a list of arguments.
 * Used for input arguments or return values for private functions, or for authwit creation.
 * @param args - Arguments to hash.
 * @returns Hash of the arguments.
 */
export function computeVarArgsHash(args: Fr[]): Promise<Fr> {
  if (args.length === 0) {
    return Promise.resolve(Fr.ZERO);
  }

  return poseidon2HashWithSeparator(args, DomainSeparator.FUNCTION_ARGS);
}

/**
 * Computes the hash of a public function's calldata.
 * @param calldata - Calldata to hash.
 * @returns Hash of the calldata.
 */
export function computeCalldataHash(calldata: Fr[]): Promise<Fr> {
  return poseidon2HashWithSeparator(calldata, DomainSeparator.PUBLIC_CALLDATA);
}

/**
 * Computes a hash of a secret.
 * @dev This function is used to generate secrets for the L1 to L2 message flow and for the TransparentNote.
 * @param secret - The secret to hash (could be generated however you want e.g. `Fr.random()`)
 * @returns The hash
 */
export function computeSecretHash(secret: Fr): Promise<Fr> {
  return poseidon2HashWithSeparator([secret], DomainSeparator.SECRET_HASH);
}

export async function computeL1ToL2MessageNullifier(contract: AztecAddress, messageHash: Fr, secret: Fr) {
  const innerMessageNullifier = await poseidon2HashWithSeparator(
    [messageHash, secret],
    DomainSeparator.MESSAGE_NULLIFIER,
  );
  return siloNullifier(contract, innerMessageNullifier);
}

/**
 * Calculates a siloed hash of a scoped l2 to l1 message.
 * @returns Fr containing 248 bits of information of sha256 hash.
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
