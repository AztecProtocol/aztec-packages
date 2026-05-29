import type { ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import type { ContractClassLog, Tag } from '@aztec/stdlib/logs';
import type { Note, NoteStatus } from '@aztec/stdlib/note';
import { type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, TxEffect, TxHash } from '@aztec/stdlib/tx';

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

  getRandomField(): Fr;
  assertCompatibleOracleVersion(major: number, minor: number): void;
  log(level: number, message: string, fields: Fr[]): Promise<void>;
}

/**
 * Oracle methods associated with the execution of an Aztec #[external("utility")] function. Note that the IMiscOracles are also
 * expected to be available in these contexts.
 */
export interface IUtilityExecutionOracle {
  isUtility: true;

  getUtilityContext(): UtilityContext;
  getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest>;
  getContractInstance(address: AztecAddress): Promise<ContractInstance>;
  getNoteHashMembershipWitness(
    anchorBlockHash: BlockHash,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined>;
  getBlockHashMembershipWitness(
    anchorBlockHash: BlockHash,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined>;
  getNullifierMembershipWitness(
    anchorBlockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;
  getPublicDataWitness(anchorBlockHash: BlockHash, leafSlot: Fr): Promise<PublicDataWitness | undefined>;
  getLowNullifierMembershipWitness(
    anchorBlockHash: BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined>;
  getBlockHeader(blockNumber: BlockNumber): Promise<BlockHeader | undefined>;
  getPublicKeysAndPartialAddress(
    account: AztecAddress,
  ): Promise<{ publicKeys: PublicKeys; partialAddress: PartialAddress } | undefined>;
  getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined>;
  getNotes(
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
  doesNullifierExist(innerNullifier: Fr): Promise<boolean>;
  getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>>;
  getFromPublicStorage(
    anchorBlockHash: BlockHash,
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    numberOfElements: number,
  ): Promise<Fr[]>;
  getPendingTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr, scope: AztecAddress): Promise<void>;
  getPendingTaggedLogsV2(scope: AztecAddress): Promise<Fr>;
  validateAndStoreEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
    maxNotePackedLen: number,
    maxEventSerializedLen: number,
    scope: AztecAddress,
  ): Promise<void>;
  getLogsByTag(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
    scope: AztecAddress,
  ): Promise<void>;
  validateAndStoreEnqueuedNotesAndEventsV2(
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
    maxNotePackedLen: number,
    maxEventSerializedLen: number,
    scope: AztecAddress,
  ): Promise<void>;
  getLogsByTagV2(requestArrayBaseSlot: Fr): Promise<Fr>;
  getMessageContextsByTxHashV2(requestArrayBaseSlot: Fr): Promise<Fr>;
  getTxEffect(txHash: TxHash): Promise<TxEffect | null>;
  getMessageContextsByTxHash(
    contractAddress: AztecAddress,
    messageContextRequestsArrayBaseSlot: Fr,
    messageContextResponsesArrayBaseSlot: Fr,
    scope: AztecAddress,
  ): Promise<void>;
  recordFact(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    factType: Fr,
    correlationKey: Fr,
    payload: Fr[],
    origin: { blockNumber: number; blockHash: Fr } | null,
  ): Promise<void>;
  activeEntities(contractAddress: AztecAddress, scope: AztecAddress, entityType: Fr): Promise<Fr[]>;
  loadCanonicalFacts(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    correlationKey: Fr,
  ): Promise<{ factType: Fr; payload: Fr[] }[]>;
  terminateEntity(
    contractAddress: AztecAddress,
    scope: AztecAddress,
    entityType: Fr,
    correlationKey: Fr,
  ): Promise<void>;
  setCapsule(contractAddress: AztecAddress, key: Fr, capsule: Fr[], scope: AztecAddress): void;
  getCapsule(contractAddress: AztecAddress, key: Fr, scope: AztecAddress): Promise<Fr[] | null>;
  deleteCapsule(contractAddress: AztecAddress, key: Fr, scope: AztecAddress): void;
  copyCapsule(
    contractAddress: AztecAddress,
    srcKey: Fr,
    dstKey: Fr,
    numEntries: number,
    scope: AztecAddress,
  ): Promise<void>;
  decryptAes128(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer>;
  getSharedSecret(address: AztecAddress, ephPk: Point, contractAddress: AztecAddress): Promise<Fr>;
  setContractSyncCacheInvalid(contractAddress: AztecAddress, scopes: AztecAddress[]): void;
  emitOffchainEffect(data: Fr[]): Promise<void>;
  callUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
  ): Promise<Fr[]>;

  // Ephemeral array methods
  pushEphemeral(slot: Fr, elements: Fr[]): number;
  popEphemeral(slot: Fr): Fr[];
  getEphemeral(slot: Fr, index: number): Fr[];
  setEphemeral(slot: Fr, index: number, elements: Fr[]): void;
  getEphemeralLen(slot: Fr): number;
  removeEphemeral(slot: Fr, index: number): void;
  clearEphemeral(slot: Fr): void;
}

/**
 * Oracle methods associated with the execution of an Aztec #[external("private")] function. Note that both the IMiscOracles and
 * IUtilityExecutionOracle are also expected to be available in these contexts.
 */
export interface IPrivateExecutionOracle {
  isPrivate: true;

  setHashPreimage(values: Fr[], hash: Fr): void;
  getHashPreimage(hash: Fr): Promise<Fr[]>;
  notifyCreatedNote(
    owner: AztecAddress,
    storageSlot: Fr,
    randomness: Fr,
    noteTypeId: NoteSelector,
    note: Fr[],
    noteHash: Fr,
    counter: number,
  ): void;
  notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number): Promise<void>;
  notifyCreatedNullifier(innerNullifier: Fr): Promise<void>;
  isNullifierPending(innerNullifier: Fr, contractAddress: AztecAddress): Promise<boolean>;
  notifyCreatedContractClassLog(log: ContractClassLog, counter: number): void;
  callPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }>;
  callUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
  ): Promise<Fr[]>;
  assertValidPublicCalldata(calldataHash: Fr): Promise<void>;
  notifyRevertiblePhaseStart(minRevertibleSideEffectCounter: number): Promise<void>;
  isExecutionInRevertiblePhase(sideEffectCounter: number): Promise<boolean>;
  getSenderForTags(): Promise<AztecAddress | undefined>;
  setSenderForTags(senderForTags: AztecAddress): Promise<void>;
  getNextAppTagAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<Tag>;
}
