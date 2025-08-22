import { type ContractInstanceWithAddress, Fr, Point } from '@aztec/aztec.js';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { packAsRetrievedNote } from '@aztec/pxe/simulator';
import { type ContractArtifact, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { TXE } from '../oracle/txe_oracle.js';
import {
  type ForeignCallArray,
  type ForeignCallSingle,
  addressFromSingle,
  arrayOfArraysToBoundedVecOfArrays,
  arrayToBoundedVec,
  bufferToU8Array,
  fromArray,
  fromSingle,
  fromUintArray,
  fromUintBoundedVec,
  toArray,
  toForeignCallResult,
  toSingle,
} from '../util/encoding.js';

enum TXEContext {
  TOP_LEVEL,
  PRIVATE,
  PUBLIC,
  UTILITY,
}

export class TXEService {
  context = TXEContext.TOP_LEVEL;
  contextChecksEnabled = false;

  constructor(private txe: TXE) {}

  static async init(protocolContracts: ProtocolContract[]) {
    const store = await openTmpStore('test');
    const txe = await TXE.create(store, protocolContracts);
    const service = new TXEService(txe);
    await service.txeAdvanceBlocksBy(toSingle(new Fr(1n)));
    return service;
  }

  // TXE Context manipulation

  // Temporary workaround - once all tests migrate to calling the new flow, in which this oracle is called at the
  // beginning of a txe test, we'll make the context check be mandatory
  txeEnableContextChecks() {
    this.contextChecksEnabled = true;
    return toForeignCallResult([]);
  }

  txeSetTopLevelTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context == TXEContext.TOP_LEVEL) {
        throw new Error(`Call to txeSetTopLevelTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.TOP_LEVEL;
    return toForeignCallResult([]);
  }

  txeSetPrivateTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to txeSetPrivateTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.PRIVATE;
    return toForeignCallResult([]);
  }

  txeSetPublicTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to txeSetPublicTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.PUBLIC;
    return toForeignCallResult([]);
  }

  txeSetUtilityTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to txeSetUtilityTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.UTILITY;
    return toForeignCallResult([]);
  }

  // Cheatcodes

  async txeGetPrivateContextInputs(
    foreignBlockNumberIsSome: ForeignCallSingle,
    foreignBlockNumberValue: ForeignCallSingle,
  ) {
    const blockNumber = fromSingle(foreignBlockNumberIsSome).toBool()
      ? fromSingle(foreignBlockNumberValue).toNumber()
      : null;

    const inputs = await this.txe.txeGetPrivateContextInputs(blockNumber);

    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  async txeAdvanceBlocksBy(foreignBlocks: ForeignCallSingle) {
    const blocks = fromSingle(foreignBlocks).toNumber();

    await this.txe.txeAdvanceBlocksBy(blocks);

    return toForeignCallResult([]);
  }

  txeAdvanceTimestampBy(foreignDuration: ForeignCallSingle) {
    const duration = fromSingle(foreignDuration).toBigInt();

    this.txe.txeAdvanceTimestampBy(duration);

    return toForeignCallResult([]);
  }

  txeSetContractAddress(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    this.txe.txeSetContractAddress(address);

    return toForeignCallResult([]);
  }

  async txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, foreignSecret: ForeignCallSingle) {
    const secret = fromSingle(foreignSecret);

    await this.txe.txeDeploy(artifact, instance, secret);

    return toForeignCallResult([
      toArray([
        instance.salt,
        instance.deployer.toField(),
        instance.currentContractClassId,
        instance.initializationHash,
        ...instance.publicKeys.toFields(),
      ]),
    ]);
  }

  async txeCreateAccount(foreignSecret: ForeignCallSingle) {
    const secret = fromSingle(foreignSecret);

    const completeAddress = await this.txe.txeCreateAccount(secret);

    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async txeAddAccount(
    artifact: ContractArtifact,
    instance: ContractInstanceWithAddress,
    foreignSecret: ForeignCallSingle,
  ) {
    const secret = fromSingle(foreignSecret);

    const completeAddress = await this.txe.txeAddAccount(artifact, instance, secret);

    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async txeAddAuthWitness(foreignAddress: ForeignCallSingle, foreignMessageHash: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);
    const messageHash = fromSingle(foreignMessageHash);

    await this.txe.txeAddAuthWitness(address, messageHash);

    return toForeignCallResult([]);
  }

  // PXE oracles

  utilityGetRandomField() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const randomField = this.txe.utilityGetRandomField();

    return toForeignCallResult([toSingle(randomField)]);
  }

  async utilityGetContractAddress() {
    if (
      this.contextChecksEnabled &&
      this.context != TXEContext.TOP_LEVEL &&
      this.context != TXEContext.UTILITY &&
      this.context != TXEContext.PRIVATE
    ) {
      throw new Error(`Attempted to call utilityGetContractAddress while in context ${TXEContext[this.context]}`);
    }

    const contractAddress = await this.txe.utilityGetContractAddress();

    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async utilityGetBlockNumber() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL && this.context != TXEContext.UTILITY) {
      throw new Error(`Attempted to call utilityGetBlockNumber while in context ${TXEContext[this.context]}`);
    }

    const blockNumber = await this.txe.utilityGetBlockNumber();

    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  // seems to be used to mean the timestamp of the last mined block in txe (but that's not what is done here)
  async utilityGetTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL && this.context != TXEContext.UTILITY) {
      throw new Error(`Attempted to call utilityGetTimestamp while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.utilityGetTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  async txeGetLastBlockTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL) {
      throw new Error(`Attempted to call txeGetLastBlockTimestamp while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.txeGetLastBlockTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  privateStoreInExecutionCache(
    _foreignLength: ForeignCallSingle,
    foreignValues: ForeignCallArray,
    foreignHash: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const values = fromArray(foreignValues);
    const hash = fromSingle(foreignHash);

    this.txe.privateStoreInExecutionCache(values, hash);

    return toForeignCallResult([]);
  }

  async privateLoadFromExecutionCache(foreignHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const hash = fromSingle(foreignHash);

    const returns = await this.txe.privateLoadFromExecutionCache(hash);

    return toForeignCallResult([toArray(returns)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  utilityDebugLog(
    foreignMessage: ForeignCallArray,
    _foreignLength: ForeignCallSingle,
    foreignFields: ForeignCallArray,
  ) {
    const message = fromArray(foreignMessage)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fields = fromArray(foreignFields);

    this.txe.utilityDebugLog(message, fields);

    return toForeignCallResult([]);
  }

  async utilityStorageRead(
    foreignContractAddress: ForeignCallSingle,
    foreignStartStorageSlot: ForeignCallSingle,
    foreignBlockNumber: ForeignCallSingle,
    foreignNumberOfElements: ForeignCallSingle,
  ) {
    const contractAddress = addressFromSingle(foreignContractAddress);
    const startStorageSlot = fromSingle(foreignStartStorageSlot);
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const numberOfElements = fromSingle(foreignNumberOfElements).toNumber();

    const values = await this.txe.utilityStorageRead(contractAddress, startStorageSlot, blockNumber, numberOfElements);

    return toForeignCallResult([toArray(values)]);
  }

  async utilityGetPublicDataWitness(foreignBlockNumber: ForeignCallSingle, foreignLeafSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const leafSlot = fromSingle(foreignLeafSlot);

    const witness = await this.txe.utilityGetPublicDataWitness(blockNumber, leafSlot);

    if (!witness) {
      throw new Error(`Public data witness not found for slot ${leafSlot} at block ${blockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetNotes(
    foreignStorageSlot: ForeignCallSingle,
    foreignNumSelects: ForeignCallSingle,
    foreignSelectByIndexes: ForeignCallArray,
    foreignSelectByOffsets: ForeignCallArray,
    foreignSelectByLengths: ForeignCallArray,
    foreignSelectValues: ForeignCallArray,
    foreignSelectComparators: ForeignCallArray,
    foreignSortByIndexes: ForeignCallArray,
    foreignSortByOffsets: ForeignCallArray,
    foreignSortByLengths: ForeignCallArray,
    foreignSortOrder: ForeignCallArray,
    foreignLimit: ForeignCallSingle,
    foreignOffset: ForeignCallSingle,
    foreignStatus: ForeignCallSingle,
    foreignMaxNotes: ForeignCallSingle,
    foreignPackedRetrievedNoteLength: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const storageSlot = fromSingle(foreignStorageSlot);
    const numSelects = fromSingle(foreignNumSelects).toNumber();
    const selectByIndexes = fromArray(foreignSelectByIndexes).map(fr => fr.toNumber());
    const selectByOffsets = fromArray(foreignSelectByOffsets).map(fr => fr.toNumber());
    const selectByLengths = fromArray(foreignSelectByLengths).map(fr => fr.toNumber());
    const selectValues = fromArray(foreignSelectValues);
    const selectComparators = fromArray(foreignSelectComparators).map(fr => fr.toNumber());
    const sortByIndexes = fromArray(foreignSortByIndexes).map(fr => fr.toNumber());
    const sortByOffsets = fromArray(foreignSortByOffsets).map(fr => fr.toNumber());
    const sortByLengths = fromArray(foreignSortByLengths).map(fr => fr.toNumber());
    const sortOrder = fromArray(foreignSortOrder).map(fr => fr.toNumber());
    const limit = fromSingle(foreignLimit).toNumber();
    const offset = fromSingle(foreignOffset).toNumber();
    const status = fromSingle(foreignStatus).toNumber();
    const maxNotes = fromSingle(foreignMaxNotes).toNumber();
    const packedRetrievedNoteLength = fromSingle(foreignPackedRetrievedNoteLength).toNumber();

    const noteDatas = await this.txe.utilityGetNotes(
      storageSlot,
      numSelects,
      selectByIndexes,
      selectByOffsets,
      selectByLengths,
      selectValues,
      selectComparators,
      sortByIndexes,
      sortByOffsets,
      sortByLengths,
      sortOrder,
      limit,
      offset,
      status,
    );

    const returnDataAsArrayOfArrays = noteDatas.map(packAsRetrievedNote);

    // Now we convert each sub-array to an array of ForeignCallSingles
    const returnDataAsArrayOfForeignCallSingleArrays = returnDataAsArrayOfArrays.map(subArray =>
      subArray.map(toSingle),
    );

    // At last we convert the array of arrays to a bounded vec of arrays
    return toForeignCallResult(
      arrayOfArraysToBoundedVecOfArrays(
        returnDataAsArrayOfForeignCallSingleArrays,
        maxNotes,
        packedRetrievedNoteLength,
      ),
    );
  }

  privateNotifyCreatedNote(
    foreignStorageSlot: ForeignCallSingle,
    foreignNoteTypeId: ForeignCallSingle,
    foreignNote: ForeignCallArray,
    foreignNoteHash: ForeignCallSingle,
    foreignCounter: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const storageSlot = fromSingle(foreignStorageSlot);
    const noteTypeId = NoteSelector.fromField(fromSingle(foreignNoteTypeId));
    const note = fromArray(foreignNote);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    this.txe.privateNotifyCreatedNote(storageSlot, noteTypeId, note, noteHash, counter);

    return toForeignCallResult([]);
  }

  async privateNotifyNullifiedNote(
    foreignInnerNullifier: ForeignCallSingle,
    foreignNoteHash: ForeignCallSingle,
    foreignCounter: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    await this.txe.privateNotifyNullifiedNote(innerNullifier, noteHash, counter);

    return toForeignCallResult([]);
  }

  async privateNotifyCreatedNullifier(foreignInnerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const innerNullifier = fromSingle(foreignInnerNullifier);

    await this.txe.privateNotifyCreatedNullifier(innerNullifier);

    return toForeignCallResult([]);
  }

  async utilityCheckNullifierExists(foreignInnerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const innerNullifier = fromSingle(foreignInnerNullifier);

    const exists = await this.txe.utilityCheckNullifierExists(innerNullifier);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async utilityGetContractInstance(foreignAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const address = addressFromSingle(foreignAddress);

    const instance = await this.txe.utilityGetContractInstance(address);

    return toForeignCallResult(
      [
        instance.salt,
        instance.deployer.toField(),
        instance.currentContractClassId,
        instance.initializationHash,
        ...instance.publicKeys.toFields(),
      ].map(toSingle),
    );
  }

  async utilityGetPublicKeysAndPartialAddress(foreignAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const address = addressFromSingle(foreignAddress);

    const { publicKeys, partialAddress } = await this.txe.utilityGetCompleteAddress(address);

    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async utilityGetKeyValidationRequest(foreignPkMHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const pkMHash = fromSingle(foreignPkMHash);

    const keyValidationRequest = await this.txe.utilityGetKeyValidationRequest(pkMHash);

    return toForeignCallResult(keyValidationRequest.toFields().map(toSingle));
  }

  privateCallPrivateFunction(
    _foreignTargetContractAddress: ForeignCallSingle,
    _foreignFunctionSelector: ForeignCallSingle,
    _foreignArgsHash: ForeignCallSingle,
    _foreignSideEffectCounter: ForeignCallSingle,
    _foreignIsStaticCall: ForeignCallSingle,
  ) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::private_context`, use `private_call` instead',
    );
  }

  async utilityGetNullifierMembershipWitness(
    foreignBlockNumber: ForeignCallSingle,
    foreignNullifier: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.txe.utilityGetNullifierMembershipWitness(blockNumber, nullifier);

    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${blockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetAuthWitness(foreignMessageHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const messageHash = fromSingle(foreignMessageHash);

    const authWitness = await this.txe.utilityGetAuthWitness(messageHash);

    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${messageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  public privateNotifyEnqueuedPublicFunctionCall(
    _foreignTargetContractAddress: ForeignCallSingle,
    _foreignCalldataHash: ForeignCallSingle,
    _foreignSideEffectCounter: ForeignCallSingle,
    _foreignIsStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public privateNotifySetPublicTeardownFunctionCall(
    _foreignTargetContractAddress: ForeignCallSingle,
    _foreignCalldataHash: ForeignCallSingle,
    _foreignSideEffectCounter: ForeignCallSingle,
    _foreignIsStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public privateNotifySetMinRevertibleSideEffectCounter(_foreignMinRevertibleSideEffectCounter: ForeignCallSingle) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  async utilityGetChainId() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const chainId = await this.txe.utilityGetChainId();

    return toForeignCallResult([toSingle(chainId)]);
  }

  async utilityGetVersion() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const version = await this.txe.utilityGetVersion();

    return toForeignCallResult([toSingle(version)]);
  }

  async utilityGetBlockHeader(foreignBlockNumber: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();

    const header = await this.txe.utilityGetBlockHeader(blockNumber);

    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult(header.toFields().map(toSingle));
  }

  async utilityGetMembershipWitness(
    foreignBlockNumber: ForeignCallSingle,
    foreignTreeId: ForeignCallSingle,
    foreignLeafValue: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const treeId = fromSingle(foreignTreeId).toNumber();
    const leafValue = fromSingle(foreignLeafValue);

    const witness = await this.txe.utilityGetMembershipWitness(blockNumber, treeId, leafValue);

    if (!witness) {
      throw new Error(
        `Membership witness in tree ${MerkleTreeId[treeId]} not found for value ${leafValue} at block ${blockNumber}.`,
      );
    }
    return toForeignCallResult([toSingle(witness[0]), toArray(witness.slice(1))]);
  }

  async utilityGetLowNullifierMembershipWitness(
    foreignBlockNumber: ForeignCallSingle,
    foreignNullifier: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.txe.utilityGetLowNullifierMembershipWitness(blockNumber, nullifier);

    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${blockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetIndexedTaggingSecretAsSender(foreignSender: ForeignCallSingle, foreignRecipient: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const sender = AztecAddress.fromField(fromSingle(foreignSender));
    const recipient = AztecAddress.fromField(fromSingle(foreignRecipient));

    const secret = await this.txe.utilityGetIndexedTaggingSecretAsSender(sender, recipient);

    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  async utilityFetchTaggedLogs(foreignPendingTaggedLogArrayBaseSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const pendingTaggedLogArrayBaseSlot = fromSingle(foreignPendingTaggedLogArrayBaseSlot);

    await this.txe.utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot);

    return toForeignCallResult([]);
  }

  public async utilityValidateEnqueuedNotesAndEvents(
    foreignContractAddress: ForeignCallSingle,
    foreignNoteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignEventValidationRequestsArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const noteValidationRequestsArrayBaseSlot = fromSingle(foreignNoteValidationRequestsArrayBaseSlot);
    const eventValidationRequestsArrayBaseSlot = fromSingle(foreignEventValidationRequestsArrayBaseSlot);

    await this.txe.utilityValidateEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
    );

    return toForeignCallResult([]);
  }

  public async utilityBulkRetrieveLogs(
    foreignContractAddress: ForeignCallSingle,
    foreignLogRetrievalRequestsArrayBaseSlot: ForeignCallSingle,
    foreignLogRetrievalResponsesArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const logRetrievalRequestsArrayBaseSlot = fromSingle(foreignLogRetrievalRequestsArrayBaseSlot);
    const logRetrievalResponsesArrayBaseSlot = fromSingle(foreignLogRetrievalResponsesArrayBaseSlot);

    await this.txe.utilityBulkRetrieveLogs(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      logRetrievalResponsesArrayBaseSlot,
    );

    return toForeignCallResult([]);
  }

  async utilityStoreCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignCapsule: ForeignCallArray,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const capsule = fromArray(foreignCapsule);

    await this.txe.utilityStoreCapsule(contractAddress, slot, capsule);

    return toForeignCallResult([]);
  }

  async utilityLoadCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignTSize: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const tSize = fromSingle(foreignTSize).toNumber();

    const values = await this.txe.utilityLoadCapsule(contractAddress, slot);

    // We are going to return a Noir Option struct to represent the possibility of null values. Options are a struct
    // with two fields: `some` (a boolean) and `value` (a field array in this case).
    if (values === null) {
      // No data was found so we set `some` to 0 and pad `value` with zeros get the correct return size.
      return toForeignCallResult([toSingle(new Fr(0)), toArray(Array(tSize).fill(new Fr(0)))]);
    } else {
      // Data was found so we set `some` to 1 and return it along with `value`.
      return toForeignCallResult([toSingle(new Fr(1)), toArray(values)]);
    }
  }

  async utilityDeleteCapsule(foreignContractAddress: ForeignCallSingle, foreignSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);

    await this.txe.utilityDeleteCapsule(contractAddress, slot);

    return toForeignCallResult([]);
  }

  async utilityCopyCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSrcSlot: ForeignCallSingle,
    foreignDstSlot: ForeignCallSingle,
    foreignNumEntries: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const srcSlot = fromSingle(foreignSrcSlot);
    const dstSlot = fromSingle(foreignDstSlot);
    const numEntries = fromSingle(foreignNumEntries).toNumber();

    await this.txe.utilityCopyCapsule(contractAddress, srcSlot, dstSlot, numEntries);

    return toForeignCallResult([]);
  }

  // TODO: I forgot to add a corresponding function here, when I introduced an oracle method to txe_oracle.ts.
  // The compiler didn't throw an error, so it took me a while to learn of the existence of this file, and that I need
  // to implement this function here. Isn't there a way to programmatically identify that this is missing, given the
  // existence of a txe_oracle method?
  async utilityAes128Decrypt(
    foreignCiphertextBVecStorage: ForeignCallArray,
    foreignCiphertextLength: ForeignCallSingle,
    foreignIv: ForeignCallArray,
    foreignSymKey: ForeignCallArray,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const ciphertext = fromUintBoundedVec(foreignCiphertextBVecStorage, foreignCiphertextLength, 8);
    const iv = fromUintArray(foreignIv, 8);
    const symKey = fromUintArray(foreignSymKey, 8);

    const plaintextBuffer = await this.txe.utilityAes128Decrypt(ciphertext, iv, symKey);

    return toForeignCallResult(
      arrayToBoundedVec(bufferToU8Array(plaintextBuffer), foreignCiphertextBVecStorage.length),
    );
  }

  async utilityGetSharedSecret(
    foreignAddress: ForeignCallSingle,
    foreignEphPKField0: ForeignCallSingle,
    foreignEphPKField1: ForeignCallSingle,
    foreignEphPKField2: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const address = AztecAddress.fromField(fromSingle(foreignAddress));
    const ephPK = Point.fromFields([
      fromSingle(foreignEphPKField0),
      fromSingle(foreignEphPKField1),
      fromSingle(foreignEphPKField2),
    ]);

    const secret = await this.txe.utilityGetSharedSecret(address, ephPK);

    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  emitOffchainEffect(_foreignData: ForeignCallArray) {
    throw new Error('Offchain effects are not yet supported in the TestEnvironment');
  }

  // AVM opcodes

  avmOpcodeEmitUnencryptedLog(_foreignMessage: ForeignCallArray) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitUnencryptedLog oracle while in context ${TXEContext[this.context]}`,
      );
    }

    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  async avmOpcodeStorageRead(foreignSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeStorageRead oracle while in context ${TXEContext[this.context]}`);
    }
    const slot = fromSingle(foreignSlot);

    const value = (await this.txe.avmOpcodeStorageRead(slot)).value;

    return toForeignCallResult([toSingle(new Fr(value))]);
  }

  async avmOpcodeStorageWrite(foreignSlot: ForeignCallSingle, foreignValue: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeStorageWrite oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const slot = fromSingle(foreignSlot);
    const value = fromSingle(foreignValue);

    await this.txe.storageWrite(slot, [value]);

    return toForeignCallResult([]);
  }

  async avmOpcodeGetContractInstanceDeployer(foreignAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceDeployer oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const address = addressFromSingle(foreignAddress);

    const instance = await this.txe.utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceClassId(foreignAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceClassId oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const address = addressFromSingle(foreignAddress);

    const instance = await this.txe.utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceInitializationHash(foreignAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceInitializationHash oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const address = addressFromSingle(foreignAddress);

    const instance = await this.txe.utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.initializationHash),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  avmOpcodeSender() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeSender oracle while in context ${TXEContext[this.context]}`);
    }

    const sender = this.txe.getMsgSender();

    return toForeignCallResult([toSingle(sender)]);
  }

  async avmOpcodeEmitNullifier(foreignNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitNullifier oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const nullifier = fromSingle(foreignNullifier);

    await this.txe.avmOpcodeEmitNullifier(nullifier);

    return toForeignCallResult([]);
  }

  async avmOpcodeEmitNoteHash(foreignNoteHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitNoteHash oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const noteHash = fromSingle(foreignNoteHash);

    await this.txe.avmOpcodeEmitNoteHash(noteHash);

    return toForeignCallResult([]);
  }

  async avmOpcodeNullifierExists(foreignInnerNullifier: ForeignCallSingle, foreignTargetAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeNullifierExists oracle while in context ${TXEContext[this.context]}`,
      );
    }
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const targetAddress = AztecAddress.fromField(fromSingle(foreignTargetAddress));

    const exists = await this.txe.avmOpcodeNullifierExists(innerNullifier, targetAddress);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async avmOpcodeAddress() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeAddress oracle while in context ${TXEContext[this.context]}`);
    }

    const contractAddress = await this.txe.utilityGetContractAddress();

    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async avmOpcodeBlockNumber() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeBlockNumber oracle while in context ${TXEContext[this.context]}`);
    }

    const blockNumber = await this.txe.utilityGetBlockNumber();

    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  async avmOpcodeTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeTimestamp oracle while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.utilityGetTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  avmOpcodeIsStaticCall() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeIsStaticCall oracle while in context ${TXEContext[this.context]}`,
      );
    }

    // TestEnvironment::public_context is always static
    const isStaticCall = true;

    return toForeignCallResult([toSingle(new Fr(isStaticCall ? 1 : 0))]);
  }

  async avmOpcodeChainId() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeChainId oracle while in context ${TXEContext[this.context]}`);
    }

    const chainId = await this.txe.utilityGetChainId();

    return toForeignCallResult([toSingle(chainId)]);
  }

  async avmOpcodeVersion() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeVersion oracle while in context ${TXEContext[this.context]}`);
    }

    const version = await this.txe.utilityGetVersion();

    return toForeignCallResult([toSingle(version)]);
  }

  avmOpcodeReturndataSize() {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeReturndataCopy(_foreignRdOffset: ForeignCallSingle, _foreignCopySize: ForeignCallSingle) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeCall(
    _foreignL2Gas: ForeignCallSingle,
    _foreignDaGas: ForeignCallSingle,
    _foreignAddress: ForeignCallSingle,
    _foreignLength: ForeignCallSingle,
    _foreignArgs: ForeignCallArray,
  ) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeStaticCall(
    _foreignL2Gas: ForeignCallSingle,
    _foreignDaGas: ForeignCallSingle,
    _foreignAddress: ForeignCallSingle,
    _foreignLength: ForeignCallSingle,
    _foreignArgs: ForeignCallArray,
  ) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeSuccessCopy() {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  async txePrivateCallNewFlow(
    foreignFrom: ForeignCallSingle,
    foreignTargetContractAddress: ForeignCallSingle,
    foreignFunctionSelector: ForeignCallSingle,
    _foreignArgsLength: ForeignCallSingle,
    foreignArgs: ForeignCallArray,
    foreignArgsHash: ForeignCallSingle,
    foreignIsStaticCall: ForeignCallSingle,
  ) {
    const from = addressFromSingle(foreignFrom);
    const targetContractAddress = addressFromSingle(foreignTargetContractAddress);
    const functionSelector = FunctionSelector.fromField(fromSingle(foreignFunctionSelector));
    const args = fromArray(foreignArgs);
    const argsHash = fromSingle(foreignArgsHash);
    const isStaticCall = fromSingle(foreignIsStaticCall).toBool();

    const result = await this.txe.txePrivateCallNewFlow(
      from,
      targetContractAddress,
      functionSelector,
      args,
      argsHash,
      isStaticCall,
    );

    return toForeignCallResult([toArray([result.endSideEffectCounter, result.returnsHash, result.txHash.hash])]);
  }

  async simulateUtilityFunction(
    foreignTargetContractAddress: ForeignCallSingle,
    foreignFunctionSelector: ForeignCallSingle,
    foreignArgsHash: ForeignCallSingle,
  ) {
    const targetContractAddress = addressFromSingle(foreignTargetContractAddress);
    const functionSelector = FunctionSelector.fromField(fromSingle(foreignFunctionSelector));
    const argsHash = fromSingle(foreignArgsHash);

    const result = await this.txe.simulateUtilityFunction(targetContractAddress, functionSelector, argsHash);

    return toForeignCallResult([toSingle(result)]);
  }

  async txePublicCallNewFlow(
    foreignFrom: ForeignCallSingle,
    foreignAddress: ForeignCallSingle,
    _foreignLength: ForeignCallSingle,
    foreignCalldata: ForeignCallArray,
    foreignIsStaticCall: ForeignCallSingle,
  ) {
    const from = addressFromSingle(foreignFrom);
    const address = addressFromSingle(foreignAddress);
    const calldata = fromArray(foreignCalldata);
    const isStaticCall = fromSingle(foreignIsStaticCall).toBool();

    const result = await this.txe.txePublicCallNewFlow(from, address, calldata, isStaticCall);

    return toForeignCallResult([toArray([result.returnsHash, result.txHash.hash])]);
  }

  async privateGetSenderForTags() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const sender = await this.txe.privateGetSenderForTags();

    // Return a Noir Option struct with `some` and `value` fields
    if (sender === undefined) {
      // No sender found, return Option with some=0 and value=0
      return toForeignCallResult([toSingle(0), toSingle(0)]);
    } else {
      // Sender found, return Option with some=1 and value=sender address
      return toForeignCallResult([toSingle(1), toSingle(sender)]);
    }
  }

  async privateSetSenderForTags(foreignSenderForTags: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }
    const senderForTags = AztecAddress.fromField(fromSingle(foreignSenderForTags));

    await this.txe.privateSetSenderForTags(senderForTags);

    return toForeignCallResult([]);
  }
}
