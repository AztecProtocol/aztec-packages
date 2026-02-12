import type { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { ContractClassLog, Tag } from '@aztec/stdlib/logs';
import type { Note, NoteStatus } from '@aztec/stdlib/note';
import { type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { UtilityContext } from '../noir-structs/utility_context.js';
import type { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

/**
 * Information about a note needed during execution.
 */
export interface NoteData {
  /** The actual note content (the fields of the Noir #[note] struct). */
  note: Note;
  /** The address of the contract that owns the note. */
  contractAddress: AztecAddress;
  /** The owner of the note. */
  owner: AztecAddress;
  /** The storage slot of the note. */
  storageSlot: Fr;
  /** The randomness injected to the note */
  randomness: Fr;
  /** The nonce injected into the note hash preimage by kernels. */
  noteNonce: Fr;
  /** A hash of the note as it gets stored in the note hash tree. */
  noteHash: Fr;
  /** True if the note is pending, false if settled. */
  isPending: boolean;
  /** The corresponding nullifier of the note. Undefined for pending notes. */
  siloedNullifier?: Fr;
}

// These interfaces contain the list of oracles required by aztec-nr in order to simulate and execute transactions, i.e.
// in order to call #[external("utility")] and #[external("private")] contract functions.
// The full list of aztec-nr oracles is larger and includes the oracles also required to run Noir tests - these reside
// in the TXE package.

/**
 * Miscellaneous oracle methods, not very Aztec-specific and expected to be available all scenarios in which aztec-nr
 * code runs, except #[external("public")] functions (since those are transpiled to AVM bytecode, where there are no oracles).
 */
export interface IMiscOracle {
  isMisc: true;

  utilityGetRandomField(): Fr;
  utilityAssertCompatibleOracleVersion(version: number): void;
  utilityLog(level: number, message: string, fields: Fr[]): Promise<void>;
}

/**
 * Oracle methods associated with the execution of an Aztec #[external("utility")] function. Note that the IMiscOracles are also
 * expected to be available in these contexts.
 */
export interface IUtilityExecutionOracle {
  isUtility: true;

  utilityGetUtilityContext(): UtilityContext;
  utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest>;
  utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance>;
  utilityGetNoteHashMembershipWitness(
    anchorBlockHash: BlockHash,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined>;
  utilityGetBlockHashMembershipWitness(
    anchorBlockHash: BlockHash,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined>;
  utilityGetNullifierMembershipWitness(
    anchorBlockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;
  utilityGetPublicDataWitness(anchorBlockHash: BlockHash, leafSlot: Fr): Promise<PublicDataWitness | undefined>;
  utilityGetLowNullifierMembershipWitness(
    anchorBlockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;
  utilityGetBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader | undefined>;
  utilityTryGetPublicKeysAndPartialAddress(account: AztecAddress): Promise<CompleteAddress | undefined>;
  utilityGetAuthWitness(messageHash: Fr): Promise<Fr[] | undefined>;
  utilityGetNotes(
    owner: AztecAddress | undefined,
    storageSlot: Fr,
    numSelects: number,
    selectByIndexes: number[],
    selectByOffsets: number[],
    selectByLengths: number[],
    selectValues: Fr[],
    selectComparators: number[],
    sortByIndexes: number[],
    sortByOffsets: number[],
    sortByLengths: number[],
    sortOrder: number[],
    limit: number,
    offset: number,
    status: NoteStatus,
  ): Promise<NoteData[]>;
  utilityCheckNullifierExists(innerNullifier: Fr): Promise<boolean>;
  utilityGetL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>>;
  utilityStorageRead(
    anchorBlockHash: BlockHash,
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    numberOfElements: number,
  ): Promise<Fr[]>;
  utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr): Promise<void>;
  utilityValidateAndStoreEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void>;
  utilityBulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void>;
  utilityStoreCapsule(contractAddress: AztecAddress, key: Fr, capsule: Fr[]): Promise<void>;
  utilityLoadCapsule(contractAddress: AztecAddress, key: Fr): Promise<Fr[] | null>;
  utilityDeleteCapsule(contractAddress: AztecAddress, key: Fr): Promise<void>;
  utilityCopyCapsule(contractAddress: AztecAddress, srcKey: Fr, dstKey: Fr, numEntries: number): Promise<void>;
  utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer>;
  utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point>;
}

/**
 * Oracle methods associated with the execution of an Aztec #[external("private")] function. Note that both the IMiscOracles and
 * IUtilityExecutionOracle are also expected to be available in these contexts.
 */
export interface IPrivateExecutionOracle {
  isPrivate: true;

  privateStoreInExecutionCache(values: Fr[], hash: Fr): void;
  privateLoadFromExecutionCache(hash: Fr): Promise<Fr[]>;
  privateNotifyCreatedNote(
    owner: AztecAddress,
    storageSlot: Fr,
    randomness: Fr,
    noteTypeId: NoteSelector,
    note: Fr[],
    noteHash: Fr,
    counter: number,
  ): void;
  privateNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number): Promise<void>;
  privateNotifyCreatedNullifier(innerNullifier: Fr): Promise<void>;
  privateIsNullifierPending(innerNullifier: Fr, contractAddress: AztecAddress): Promise<boolean>;
  privateNotifyCreatedContractClassLog(log: ContractClassLog, counter: number): void;
  privateCallPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }>;
  privateNotifyEnqueuedPublicFunctionCall(
    targetContractAddress: AztecAddress,
    calldataHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<void>;
  privateNotifySetPublicTeardownFunctionCall(
    targetContractAddress: AztecAddress,
    calldataHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<void>;
  privateNotifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): Promise<void>;
  privateIsSideEffectCounterRevertible(sideEffectCounter: number): Promise<boolean>;
  privateGetSenderForTags(): Promise<AztecAddress | undefined>;
  privateSetSenderForTags(senderForTags: AztecAddress): Promise<void>;
  privateGetNextAppTagAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<Tag>;
  utilityEmitOffchainEffect(data: Fr[]): Promise<void>;
}
