import { type ContractInstanceWithAddress, Fr, Point } from '@aztec/aztec.js';
import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX } from '@aztec/constants';
import {
  type IMiscOracle,
  type IPrivateExecutionOracle,
  type IUtilityExecutionOracle,
  packAsRetrievedNote,
} from '@aztec/pxe/simulator';
import { type ContractArtifact, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { IAvmExecutionOracle, ITxeExecutionOracle } from './oracle/interfaces.js';
import type { TXESessionStateHandler } from './txe_session.js';
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
} from './util/encoding.js';

export class UnavailableOracleError extends Error {
  constructor(oracleName: string) {
    super(`${oracleName} oracles not available with the current handler`);
  }
}

export class RPCTranslator {
  /**
   * Create a new instance of `RPCTranslator` that will translate all TXE RPC calls to and from the foreign
   * (`ForeignCallSingle`, `ForeignCallResult`, etc.) and native TS types, delegating actual execution of the oracles
   * to the different handlers.
   * @param stateHandler The handler that will process TXE session state transitions, such as entering a private or
   * public context.
   * @param oracleHandler The handler that will process all other oracle calls that are not directly related to session
   * state.
   */
  constructor(
    private stateHandler: TXESessionStateHandler,
    private oracleHandler:
      | IMiscOracle
      | IUtilityExecutionOracle
      | IPrivateExecutionOracle
      | IAvmExecutionOracle
      | ITxeExecutionOracle,
  ) {}

  // Note: If you rename the following functions to not start with "handlerAs", you must also update the validation
  // check in `TXESession.processFunction`.

  private handlerAsMisc(): IMiscOracle {
    if (!('isMisc' in this.oracleHandler)) {
      throw new UnavailableOracleError('Misc');
    }

    return this.oracleHandler;
  }

  private handlerAsUtility(): IUtilityExecutionOracle {
    if (!('isUtility' in this.oracleHandler)) {
      throw new UnavailableOracleError('Utility');
    }

    return this.oracleHandler;
  }

  private handlerAsPrivate(): IPrivateExecutionOracle {
    if (!('isPrivate' in this.oracleHandler)) {
      throw new UnavailableOracleError('Private');
    }

    return this.oracleHandler;
  }

  private handlerAsAvm(): IAvmExecutionOracle {
    if (!('isAvm' in this.oracleHandler)) {
      throw new UnavailableOracleError('Avm');
    }

    return this.oracleHandler;
  }

  private handlerAsTxe(): ITxeExecutionOracle {
    if (!('isTxe' in this.oracleHandler)) {
      throw new UnavailableOracleError('Txe');
    }

    return this.oracleHandler;
  }

  // TXE session state transition functions - these get handled by the state handler

  async txeSetTopLevelTXEContext() {
    await this.stateHandler.enterTopLevelState();

    return toForeignCallResult([]);
  }

  async txeSetPrivateTXEContext(
    foreignContractAddressIsSome: ForeignCallSingle,
    foreignContractAddressValue: ForeignCallSingle,
    foreignAnchorBlockNumberIsSome: ForeignCallSingle,
    foreignAnchorBlockNumberValue: ForeignCallSingle,
  ) {
    const contractAddress = fromSingle(foreignContractAddressIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignContractAddressValue))
      : undefined;

    const anchorBlockNumber = fromSingle(foreignAnchorBlockNumberIsSome).toBool()
      ? fromSingle(foreignAnchorBlockNumberValue).toNumber()
      : undefined;

    const privateContextInputs = await this.stateHandler.enterPrivateState(contractAddress, anchorBlockNumber);

    return toForeignCallResult(privateContextInputs.toFields().map(toSingle));
  }

  async txeSetPublicTXEContext(
    foreignContractAddressIsSome: ForeignCallSingle,
    foreignContractAddressValue: ForeignCallSingle,
  ) {
    const contractAddress = fromSingle(foreignContractAddressIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignContractAddressValue))
      : undefined;

    await this.stateHandler.enterPublicState(contractAddress);

    return toForeignCallResult([]);
  }

  async txeSetUtilityTXEContext(
    foreignContractAddressIsSome: ForeignCallSingle,
    foreignContractAddressValue: ForeignCallSingle,
  ) {
    const contractAddress = fromSingle(foreignContractAddressIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignContractAddressValue))
      : undefined;

    await this.stateHandler.enterUtilityState(contractAddress);

    return toForeignCallResult([]);
  }

  // Other oracles - these get handled by the oracle handler

  // TXE-specific oracles

  async txeGetNextBlockNumber() {
    const nextBlockNumber = await this.handlerAsTxe().txeGetNextBlockNumber();

    return toForeignCallResult([toSingle(nextBlockNumber)]);
  }

  async txeGetNextBlockTimestamp() {
    const nextBlockTimestamp = await this.handlerAsTxe().txeGetNextBlockTimestamp();

    return toForeignCallResult([toSingle(nextBlockTimestamp)]);
  }

  async txeAdvanceBlocksBy(foreignBlocks: ForeignCallSingle) {
    const blocks = fromSingle(foreignBlocks).toNumber();

    await this.handlerAsTxe().txeAdvanceBlocksBy(blocks);

    return toForeignCallResult([]);
  }

  txeAdvanceTimestampBy(foreignDuration: ForeignCallSingle) {
    const duration = fromSingle(foreignDuration).toBigInt();

    this.handlerAsTxe().txeAdvanceTimestampBy(duration);

    return toForeignCallResult([]);
  }

  async txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, foreignSecret: ForeignCallSingle) {
    const secret = fromSingle(foreignSecret);

    await this.handlerAsTxe().txeDeploy(artifact, instance, secret);

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

    const completeAddress = await this.handlerAsTxe().txeCreateAccount(secret);

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

    const completeAddress = await this.handlerAsTxe().txeAddAccount(artifact, instance, secret);

    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async txeAddAuthWitness(foreignAddress: ForeignCallSingle, foreignMessageHash: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);
    const messageHash = fromSingle(foreignMessageHash);

    await this.handlerAsTxe().txeAddAuthWitness(address, messageHash);

    return toForeignCallResult([]);
  }

  // PXE oracles

  utilityAssertCompatibleOracleVersion(foreignVersion: ForeignCallSingle) {
    const version = fromSingle(foreignVersion).toNumber();

    this.handlerAsMisc().utilityAssertCompatibleOracleVersion(version);

    return toForeignCallResult([]);
  }

  utilityGetRandomField() {
    const randomField = this.handlerAsMisc().utilityGetRandomField();

    return toForeignCallResult([toSingle(randomField)]);
  }

  async txeGetLastBlockTimestamp() {
    const timestamp = await this.handlerAsTxe().txeGetLastBlockTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  async txeGetLastTxEffects() {
    const { txHash, noteHashes, nullifiers } = await this.handlerAsTxe().txeGetLastTxEffects();

    return toForeignCallResult([
      toSingle(txHash.hash),
      ...arrayToBoundedVec(toArray(noteHashes), MAX_NOTE_HASHES_PER_TX),
      ...arrayToBoundedVec(toArray(nullifiers), MAX_NULLIFIERS_PER_TX),
    ]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  privateStoreInExecutionCache(
    _foreignLength: ForeignCallSingle,
    foreignValues: ForeignCallArray,
    foreignHash: ForeignCallSingle,
  ) {
    const values = fromArray(foreignValues);
    const hash = fromSingle(foreignHash);

    this.handlerAsPrivate().privateStoreInExecutionCache(values, hash);

    return toForeignCallResult([]);
  }

  async privateLoadFromExecutionCache(foreignHash: ForeignCallSingle) {
    const hash = fromSingle(foreignHash);

    const returns = await this.handlerAsPrivate().privateLoadFromExecutionCache(hash);

    return toForeignCallResult([toArray(returns)]);
  }

  // When the argument is a slice, noir automatically adds a length field to oracle call.
  // When the argument is an array, we add the field length manually to the signature.
  utilityDebugLog(
    foreignLevel: ForeignCallSingle,
    foreignMessage: ForeignCallArray,
    _foreignLength: ForeignCallSingle,
    foreignFields: ForeignCallArray,
  ) {
    const level = fromSingle(foreignLevel).toNumber();
    const message = fromArray(foreignMessage)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fields = fromArray(foreignFields);

    this.handlerAsMisc().utilityDebugLog(level, message, fields);

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

    const values = await this.handlerAsUtility().utilityStorageRead(
      contractAddress,
      startStorageSlot,
      blockNumber,
      numberOfElements,
    );

    return toForeignCallResult([toArray(values)]);
  }

  async utilityGetPublicDataWitness(foreignBlockNumber: ForeignCallSingle, foreignLeafSlot: ForeignCallSingle) {
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const leafSlot = fromSingle(foreignLeafSlot);

    const witness = await this.handlerAsUtility().utilityGetPublicDataWitness(blockNumber, leafSlot);

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

    const noteDatas = await this.handlerAsUtility().utilityGetNotes(
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
    const storageSlot = fromSingle(foreignStorageSlot);
    const noteTypeId = NoteSelector.fromField(fromSingle(foreignNoteTypeId));
    const note = fromArray(foreignNote);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    this.handlerAsPrivate().privateNotifyCreatedNote(storageSlot, noteTypeId, note, noteHash, counter);

    return toForeignCallResult([]);
  }

  async privateNotifyNullifiedNote(
    foreignInnerNullifier: ForeignCallSingle,
    foreignNoteHash: ForeignCallSingle,
    foreignCounter: ForeignCallSingle,
  ) {
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    await this.handlerAsPrivate().privateNotifyNullifiedNote(innerNullifier, noteHash, counter);

    return toForeignCallResult([]);
  }

  async privateNotifyCreatedNullifier(foreignInnerNullifier: ForeignCallSingle) {
    const innerNullifier = fromSingle(foreignInnerNullifier);

    await this.handlerAsPrivate().privateNotifyCreatedNullifier(innerNullifier);

    return toForeignCallResult([]);
  }

  async utilityCheckNullifierExists(foreignInnerNullifier: ForeignCallSingle) {
    const innerNullifier = fromSingle(foreignInnerNullifier);

    const exists = await this.handlerAsUtility().utilityCheckNullifierExists(innerNullifier);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async utilityGetContractInstance(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().utilityGetContractInstance(address);

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
    const address = addressFromSingle(foreignAddress);

    const { publicKeys, partialAddress } = await this.handlerAsUtility().utilityGetPublicKeysAndPartialAddress(address);

    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async utilityGetKeyValidationRequest(foreignPkMHash: ForeignCallSingle) {
    const pkMHash = fromSingle(foreignPkMHash);

    const keyValidationRequest = await this.handlerAsUtility().utilityGetKeyValidationRequest(pkMHash);

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
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.handlerAsUtility().utilityGetNullifierMembershipWitness(blockNumber, nullifier);

    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${blockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetAuthWitness(foreignMessageHash: ForeignCallSingle) {
    const messageHash = fromSingle(foreignMessageHash);

    const authWitness = await this.handlerAsUtility().utilityGetAuthWitness(messageHash);

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

  async utilityGetUtilityContext() {
    const context = await this.handlerAsUtility().utilityGetUtilityContext();

    return toForeignCallResult(context.toNoirRepresentation());
  }

  async utilityGetBlockHeader(foreignBlockNumber: ForeignCallSingle) {
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();

    const header = await this.handlerAsUtility().utilityGetBlockHeader(blockNumber);

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
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const treeId = fromSingle(foreignTreeId).toNumber();
    const leafValue = fromSingle(foreignLeafValue);

    const witness = await this.handlerAsUtility().utilityGetMembershipWitness(blockNumber, treeId, leafValue);

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
    const blockNumber = fromSingle(foreignBlockNumber).toNumber();
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.handlerAsUtility().utilityGetLowNullifierMembershipWitness(blockNumber, nullifier);

    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${blockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityFetchTaggedLogs(foreignPendingTaggedLogArrayBaseSlot: ForeignCallSingle) {
    const pendingTaggedLogArrayBaseSlot = fromSingle(foreignPendingTaggedLogArrayBaseSlot);

    await this.handlerAsUtility().utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot);

    return toForeignCallResult([]);
  }

  public async utilityValidateEnqueuedNotesAndEvents(
    foreignContractAddress: ForeignCallSingle,
    foreignNoteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignEventValidationRequestsArrayBaseSlot: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const noteValidationRequestsArrayBaseSlot = fromSingle(foreignNoteValidationRequestsArrayBaseSlot);
    const eventValidationRequestsArrayBaseSlot = fromSingle(foreignEventValidationRequestsArrayBaseSlot);

    await this.handlerAsUtility().utilityValidateEnqueuedNotesAndEvents(
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
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const logRetrievalRequestsArrayBaseSlot = fromSingle(foreignLogRetrievalRequestsArrayBaseSlot);
    const logRetrievalResponsesArrayBaseSlot = fromSingle(foreignLogRetrievalResponsesArrayBaseSlot);

    await this.handlerAsUtility().utilityBulkRetrieveLogs(
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
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const capsule = fromArray(foreignCapsule);

    await this.handlerAsUtility().utilityStoreCapsule(contractAddress, slot, capsule);

    return toForeignCallResult([]);
  }

  async utilityLoadCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignTSize: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const tSize = fromSingle(foreignTSize).toNumber();

    const values = await this.handlerAsUtility().utilityLoadCapsule(contractAddress, slot);

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
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);

    await this.handlerAsUtility().utilityDeleteCapsule(contractAddress, slot);

    return toForeignCallResult([]);
  }

  async utilityCopyCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSrcSlot: ForeignCallSingle,
    foreignDstSlot: ForeignCallSingle,
    foreignNumEntries: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const srcSlot = fromSingle(foreignSrcSlot);
    const dstSlot = fromSingle(foreignDstSlot);
    const numEntries = fromSingle(foreignNumEntries).toNumber();

    await this.handlerAsUtility().utilityCopyCapsule(contractAddress, srcSlot, dstSlot, numEntries);

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
    const ciphertext = fromUintBoundedVec(foreignCiphertextBVecStorage, foreignCiphertextLength, 8);
    const iv = fromUintArray(foreignIv, 8);
    const symKey = fromUintArray(foreignSymKey, 8);

    const plaintextBuffer = await this.handlerAsUtility().utilityAes128Decrypt(ciphertext, iv, symKey);

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
    const address = AztecAddress.fromField(fromSingle(foreignAddress));
    const ephPK = Point.fromFields([
      fromSingle(foreignEphPKField0),
      fromSingle(foreignEphPKField1),
      fromSingle(foreignEphPKField2),
    ]);

    const secret = await this.handlerAsUtility().utilityGetSharedSecret(address, ephPK);

    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  emitOffchainEffect(_foreignData: ForeignCallArray) {
    throw new Error('Offchain effects are not yet supported in the TestEnvironment');
  }

  // AVM opcodes

  avmOpcodeEmitUnencryptedLog(_foreignMessage: ForeignCallArray) {
    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  async avmOpcodeStorageRead(foreignSlot: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);

    const value = (await this.handlerAsAvm().avmOpcodeStorageRead(slot)).value;

    return toForeignCallResult([toSingle(new Fr(value))]);
  }

  async avmOpcodeStorageWrite(foreignSlot: ForeignCallSingle, foreignValue: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const value = fromSingle(foreignValue);

    await this.handlerAsAvm().avmOpcodeStorageWrite(slot, value);

    return toForeignCallResult([]);
  }

  async avmOpcodeGetContractInstanceDeployer(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceClassId(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceInitializationHash(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().utilityGetContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.initializationHash),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeSender() {
    const sender = await this.handlerAsAvm().avmOpcodeSender();

    return toForeignCallResult([toSingle(sender)]);
  }

  async avmOpcodeEmitNullifier(foreignNullifier: ForeignCallSingle) {
    const nullifier = fromSingle(foreignNullifier);

    await this.handlerAsAvm().avmOpcodeEmitNullifier(nullifier);

    return toForeignCallResult([]);
  }

  async avmOpcodeEmitNoteHash(foreignNoteHash: ForeignCallSingle) {
    const noteHash = fromSingle(foreignNoteHash);

    await this.handlerAsAvm().avmOpcodeEmitNoteHash(noteHash);

    return toForeignCallResult([]);
  }

  async avmOpcodeNullifierExists(foreignInnerNullifier: ForeignCallSingle, foreignTargetAddress: ForeignCallSingle) {
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const targetAddress = AztecAddress.fromField(fromSingle(foreignTargetAddress));

    const exists = await this.handlerAsAvm().avmOpcodeNullifierExists(innerNullifier, targetAddress);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async avmOpcodeAddress() {
    const contractAddress = await this.handlerAsAvm().avmOpcodeAddress();

    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async avmOpcodeBlockNumber() {
    const blockNumber = await this.handlerAsAvm().avmOpcodeBlockNumber();

    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  async avmOpcodeTimestamp() {
    const timestamp = await this.handlerAsAvm().avmOpcodeTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  async avmOpcodeIsStaticCall() {
    const isStaticCall = await this.handlerAsAvm().avmOpcodeIsStaticCall();

    return toForeignCallResult([toSingle(new Fr(isStaticCall ? 1 : 0))]);
  }

  async avmOpcodeChainId() {
    const chainId = await this.handlerAsAvm().avmOpcodeChainId();

    return toForeignCallResult([toSingle(chainId)]);
  }

  async avmOpcodeVersion() {
    const version = await this.handlerAsAvm().avmOpcodeVersion();

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

    const returnValues = await this.handlerAsTxe().txePrivateCallNewFlow(
      from,
      targetContractAddress,
      functionSelector,
      args,
      argsHash,
      isStaticCall,
    );

    return toForeignCallResult([toArray(returnValues)]);
  }

  async txeSimulateUtilityFunction(
    foreignTargetContractAddress: ForeignCallSingle,
    foreignFunctionSelector: ForeignCallSingle,
    _foreignArgsLength: ForeignCallSingle,
    foreignArgs: ForeignCallArray,
  ) {
    const targetContractAddress = addressFromSingle(foreignTargetContractAddress);
    const functionSelector = FunctionSelector.fromField(fromSingle(foreignFunctionSelector));
    const args = fromArray(foreignArgs);

    const returnValues = await this.handlerAsTxe().txeSimulateUtilityFunction(
      targetContractAddress,
      functionSelector,
      args,
    );

    return toForeignCallResult([toArray(returnValues)]);
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

    const returnValues = await this.handlerAsTxe().txePublicCallNewFlow(from, address, calldata, isStaticCall);

    return toForeignCallResult([toArray(returnValues)]);
  }

  async privateGetSenderForTags() {
    const sender = await this.handlerAsPrivate().privateGetSenderForTags();

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
    const senderForTags = AztecAddress.fromField(fromSingle(foreignSenderForTags));

    await this.handlerAsPrivate().privateSetSenderForTags(senderForTags);

    return toForeignCallResult([]);
  }

  async privateGetNextAppTagAsSender(foreignSender: ForeignCallSingle, foreignRecipient: ForeignCallSingle) {
    const sender = AztecAddress.fromField(fromSingle(foreignSender));
    const recipient = AztecAddress.fromField(fromSingle(foreignRecipient));

    const nextAppTag = await this.handlerAsPrivate().privateGetNextAppTagAsSender(sender, recipient);

    return toForeignCallResult([toSingle(nextAppTag)]);
  }
}
