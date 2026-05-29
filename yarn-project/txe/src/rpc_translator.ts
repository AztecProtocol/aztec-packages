import type { ContractInstanceWithAddress } from '@aztec/aztec.js/contracts';
import { Fr, Point } from '@aztec/aztec.js/fields';
import {
  ARCHIVE_HEIGHT,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_LOG_CIPHERTEXT_LEN,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { MembershipWitness } from '@aztec/foundation/trees';
import {
  type IMiscOracle,
  type IPrivateExecutionOracle,
  type IUtilityExecutionOracle,
  packAsHintedNote,
} from '@aztec/pxe/simulator';
import { type ContractArtifact, EventSelector, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { GasSettings } from '@aztec/stdlib/gas';

import type { IAvmExecutionOracle, ITxeExecutionOracle } from './oracle/interfaces.js';
import { TXE_ORACLE_VERSION_MAJOR } from './txe_oracle_version.js';
import type { TXESessionStateHandler } from './txe_session.js';
import {
  type ForeignCallArray,
  type ForeignCallSingle,
  addressFromSingle,
  arrayOfArraysToBoundedVecOfArrays,
  arrayToBoundedVec,
  blockHashFromSingle,
  bufferToU8Array,
  fromArray,
  fromSingle,
  fromUintArray,
  fromUintBoundedVec,
  toArray,
  toForeignCallResult,
  toSingle,
} from './util/encoding.js';

const MAX_EVENT_LEN = 10; // This is MAX_MESSAGE_CONTENT_LEN - PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN
const MAX_PRIVATE_EVENTS_PER_TXE_QUERY = 5;

// These must match the FACT_MAX_* globals in aztec-nr's `oracle/fact_store.nr`.
const FACT_MAX_PAYLOAD = 20;
const FACT_MAX_FACTS = 8;
const FACT_MAX_ACTIVE_ENTITIES = 64;

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

  // eslint-disable-next-line camelcase
  aztec_txe_assertCompatibleOracleVersion(foreignMajor: ForeignCallSingle, foreignMinor: ForeignCallSingle) {
    const major = fromSingle(foreignMajor).toNumber();
    const minor = fromSingle(foreignMinor).toNumber();

    if (major !== TXE_ORACLE_VERSION_MAJOR) {
      const hint =
        major > TXE_ORACLE_VERSION_MAJOR
          ? 'The test was compiled with a newer version of Aztec.nr than your test environment supports. Upgrade your test environment to a compatible version.'
          : 'The test was compiled with an older version of Aztec.nr than your test environment supports. Recompile the test with a compatible version of Aztec.nr.';
      throw new Error(
        `Incompatible test environment version: ${hint} See https://docs.aztec.network/errors/12 (expected test oracle major version ${TXE_ORACLE_VERSION_MAJOR}, got ${major})`,
      );
    }

    this.stateHandler.setTxeOracleVersion({ major, minor });

    return toForeignCallResult([]);
  }

  // TXE session state transition functions - these get handled by the state handler

  // eslint-disable-next-line camelcase
  async aztec_txe_setTopLevelTXEContext() {
    await this.stateHandler.enterTopLevelState();

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_setPrivateTXEContext(
    foreignContractAddressIsSome: ForeignCallSingle,
    foreignContractAddressValue: ForeignCallSingle,
    foreignAnchorBlockNumberIsSome: ForeignCallSingle,
    foreignAnchorBlockNumberValue: ForeignCallSingle,
    foreignGasSettings: ForeignCallArray,
  ) {
    const contractAddress = fromSingle(foreignContractAddressIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignContractAddressValue))
      : undefined;

    const anchorBlockNumber = fromSingle(foreignAnchorBlockNumberIsSome).toBool()
      ? BlockNumber(fromSingle(foreignAnchorBlockNumberValue).toNumber())
      : undefined;

    const gasSettings = GasSettings.fromFields(fromArray(foreignGasSettings));

    const privateContextInputs = await this.stateHandler.enterPrivateState(
      contractAddress,
      anchorBlockNumber,
      gasSettings,
    );

    return toForeignCallResult(privateContextInputs.toFields().map(toSingle));
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_setPublicTXEContext(
    foreignContractAddressIsSome: ForeignCallSingle,
    foreignContractAddressValue: ForeignCallSingle,
  ) {
    const contractAddress = fromSingle(foreignContractAddressIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignContractAddressValue))
      : undefined;

    await this.stateHandler.enterPublicState(contractAddress);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_setUtilityTXEContext(
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

  // eslint-disable-next-line camelcase
  aztec_txe_getDefaultAddress() {
    const defaultAddress = this.handlerAsTxe().getDefaultAddress();

    return toForeignCallResult([toSingle(defaultAddress)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_getNextBlockNumber() {
    const nextBlockNumber = await this.handlerAsTxe().getNextBlockNumber();

    return toForeignCallResult([toSingle(nextBlockNumber)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_getNextBlockTimestamp() {
    const nextBlockTimestamp = await this.handlerAsTxe().getNextBlockTimestamp();

    return toForeignCallResult([toSingle(nextBlockTimestamp)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_advanceBlocksBy(foreignBlocks: ForeignCallSingle) {
    const blocks = fromSingle(foreignBlocks).toNumber();

    await this.handlerAsTxe().advanceBlocksBy(blocks);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  aztec_txe_advanceTimestampBy(foreignDuration: ForeignCallSingle) {
    const duration = fromSingle(foreignDuration).toBigInt();

    this.handlerAsTxe().advanceTimestampBy(duration);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_deploy(
    artifact: ContractArtifact,
    instance: ContractInstanceWithAddress,
    foreignSecret: ForeignCallSingle,
  ) {
    const secret = fromSingle(foreignSecret);

    await this.handlerAsTxe().deploy(artifact, instance, secret);

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

  // eslint-disable-next-line camelcase
  async aztec_txe_createAccount(foreignSecret: ForeignCallSingle) {
    const secret = fromSingle(foreignSecret);

    const completeAddress = await this.handlerAsTxe().createAccount(secret);

    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_addAccount(
    artifact: ContractArtifact,
    instance: ContractInstanceWithAddress,
    foreignSecret: ForeignCallSingle,
  ) {
    const secret = fromSingle(foreignSecret);

    const completeAddress = await this.handlerAsTxe().addAccount(artifact, instance, secret);

    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_addAuthWitness(foreignAddress: ForeignCallSingle, foreignMessageHash: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);
    const messageHash = fromSingle(foreignMessageHash);

    await this.handlerAsTxe().addAuthWitness(address, messageHash);

    return toForeignCallResult([]);
  }

  // PXE oracles

  // eslint-disable-next-line camelcase
  aztec_utl_assertCompatibleOracleVersionV2(foreignMajor: ForeignCallSingle, foreignMinor: ForeignCallSingle) {
    const major = fromSingle(foreignMajor).toNumber();
    const minor = fromSingle(foreignMinor).toNumber();

    this.handlerAsMisc().assertCompatibleOracleVersion(major, minor);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getRandomField() {
    const randomField = this.handlerAsMisc().getRandomField();

    return toForeignCallResult([toSingle(randomField)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_getLastBlockTimestamp() {
    const timestamp = await this.handlerAsTxe().getLastBlockTimestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_getLastTxEffects() {
    const { txHash, noteHashes, nullifiers, privateLogs } = await this.handlerAsTxe().getLastTxEffects();

    if (privateLogs.length > MAX_PRIVATE_LOGS_PER_TX) {
      throw new Error(`${privateLogs.length} private logs exceed max ${MAX_PRIVATE_LOGS_PER_TX}`);
    }

    // Same workaround as `aztec_txe_getPrivateEvents`: Noir cannot yet return nested structs with arrays, so we return
    // a flat multidimensional array plus per-log lengths and the total count, and reassemble into a
    // `BoundedVec<BoundedVec<T>>` on the Noir side. Each log contributes only its emitted fields. The rest
    // is zero-padded to `PRIVATE_LOG_SIZE_IN_FIELDS`.
    const emittedLogs = privateLogs.map(log => log.getEmittedFields());

    const rawLogStorage = emittedLogs
      .map(fields => fields.concat(Array(PRIVATE_LOG_SIZE_IN_FIELDS - fields.length).fill(new Fr(0))))
      .concat(
        Array(MAX_PRIVATE_LOGS_PER_TX - emittedLogs.length).fill(Array(PRIVATE_LOG_SIZE_IN_FIELDS).fill(new Fr(0))),
      )
      .flat();

    const logLengths = emittedLogs
      .map(fields => new Fr(fields.length))
      .concat(Array(MAX_PRIVATE_LOGS_PER_TX - emittedLogs.length).fill(new Fr(0)));

    const logCount = new Fr(emittedLogs.length);

    return toForeignCallResult([
      toSingle(txHash.hash),
      ...arrayToBoundedVec(toArray(noteHashes), MAX_NOTE_HASHES_PER_TX),
      ...arrayToBoundedVec(toArray(nullifiers), MAX_NULLIFIERS_PER_TX),
      toArray(rawLogStorage),
      toArray(logLengths),
      toSingle(logCount),
    ]);
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastCallOffchainEffects() {
    // This oracle returns all offchain effect payloads (messages, authwit requests, etc.) emitted by the last top-level call,
    // MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY is arbitrarily set at 64 because we need a bound. Nothing inherent about it.
    const MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY = 64;
    // Must match MAX_OFFCHAIN_EFFECT_LEN in txe_oracles.nr.
    const MAX_OFFCHAIN_EFFECT_LEN = 2 + PRIVATE_LOG_CIPHERTEXT_LEN;

    const { effects } = this.stateHandler.getLastCallOffchainEffects();

    if (effects.length > MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY) {
      throw new Error(`${effects.length} offchain effects exceed max ${MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY}`);
    }
    if (effects.some(e => e.length > MAX_OFFCHAIN_EFFECT_LEN)) {
      throw new Error(`Some offchain effect has length larger than max ${MAX_OFFCHAIN_EFFECT_LEN}`);
    }

    const rawArrayStorage = effects
      .map(e => e.concat(Array(MAX_OFFCHAIN_EFFECT_LEN - e.length).fill(new Fr(0))))
      .concat(
        Array(MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY - effects.length).fill(Array(MAX_OFFCHAIN_EFFECT_LEN).fill(new Fr(0))),
      )
      .flat();

    const effectLengths = effects
      .map(e => new Fr(e.length))
      .concat(Array(MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY - effects.length).fill(new Fr(0)));

    const count = new Fr(effects.length);

    return toForeignCallResult([toArray(rawArrayStorage), toArray(effectLengths), toSingle(count)]);
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastCallContext() {
    const { txHash, anchorBlockTimestamp } = this.stateHandler.getLastCallContext();
    const isSome = txHash.isZero() ? 0 : 1;
    return toForeignCallResult([toSingle(isSome), toSingle(txHash), toSingle(new Fr(anchorBlockTimestamp))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_getPrivateEvents(
    foreignSelector: ForeignCallSingle,
    foreignContractAddress: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const selector = EventSelector.fromField(fromSingle(foreignSelector));
    const contractAddress = addressFromSingle(foreignContractAddress);
    const scope = addressFromSingle(foreignScope);

    // TODO(F-335): Avoid doing the following 2 calls here.
    {
      await this.handlerAsTxe().syncContractNonOracleMethod(contractAddress, scope, this.stateHandler.getCurrentJob());
      // We cycle job to commit the stores after the contract sync.
      await this.stateHandler.cycleJob();
    }

    const events = await this.handlerAsTxe().getPrivateEvents(selector, contractAddress, scope);

    if (events.length > MAX_PRIVATE_EVENTS_PER_TXE_QUERY) {
      throw new Error(`Array of length ${events.length} larger than maxLen ${MAX_PRIVATE_EVENTS_PER_TXE_QUERY}`);
    }

    if (events.some(e => e.length > MAX_EVENT_LEN)) {
      throw new Error(`Some private event has length larger than maxLen ${MAX_EVENT_LEN}`);
    }

    // This is a workaround as Noir does not currently let us return nested structs with arrays. We instead return a raw
    // multidimensional array in get_private_events_oracle and create the BoundedVecs here.
    const rawArrayStorage = events
      .map(e => e.concat(Array(MAX_EVENT_LEN - e.length).fill(new Fr(0))))
      .concat(Array(MAX_PRIVATE_EVENTS_PER_TXE_QUERY - events.length).fill(Array(MAX_EVENT_LEN).fill(new Fr(0))))
      .flat();
    const eventLengths = events
      .map(e => new Fr(e.length))
      .concat(Array(MAX_PRIVATE_EVENTS_PER_TXE_QUERY - events.length).fill(new Fr(0)));
    const queryLength = new Fr(events.length);

    return toForeignCallResult([toArray(rawArrayStorage), toArray(eventLengths), toSingle(queryLength)]);
  }

  // eslint-disable-next-line camelcase
  aztec_prv_setHashPreimage(foreignValues: ForeignCallArray, foreignHash: ForeignCallSingle) {
    const values = fromArray(foreignValues);
    const hash = fromSingle(foreignHash);

    this.handlerAsPrivate().setHashPreimage(values, hash);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getHashPreimage(foreignHash: ForeignCallSingle) {
    const hash = fromSingle(foreignHash);

    const returns = await this.handlerAsPrivate().getHashPreimage(hash);

    return toForeignCallResult([toArray(returns)]);
  }

  // When the argument is a slice, noir automatically adds a length field to oracle call.
  // When the argument is an array, we add the field length manually to the signature.
  // eslint-disable-next-line camelcase
  async aztec_utl_log(
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

    await this.handlerAsMisc().log(level, message, fields);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getFromPublicStorage(
    foreignBlockHash: ForeignCallSingle,
    foreignContractAddress: ForeignCallSingle,
    foreignStartStorageSlot: ForeignCallSingle,
    foreignNumberOfElements: ForeignCallSingle,
  ) {
    const blockHash = blockHashFromSingle(foreignBlockHash);
    const contractAddress = addressFromSingle(foreignContractAddress);
    const startStorageSlot = fromSingle(foreignStartStorageSlot);
    const numberOfElements = fromSingle(foreignNumberOfElements).toNumber();

    const values = await this.handlerAsUtility().getFromPublicStorage(
      blockHash,
      contractAddress,
      startStorageSlot,
      numberOfElements,
    );

    return toForeignCallResult([toArray(values)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getPublicDataWitness(foreignBlockHash: ForeignCallSingle, foreignLeafSlot: ForeignCallSingle) {
    const blockHash = blockHashFromSingle(foreignBlockHash);
    const leafSlot = fromSingle(foreignLeafSlot);

    const witness = await this.handlerAsUtility().getPublicDataWitness(blockHash, leafSlot);

    if (!witness) {
      throw new Error(`Public data witness not found for slot ${leafSlot} at block ${blockHash.toString()}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getNotes(
    foreignOwnerIsSome: ForeignCallSingle,
    foreignOwnerValue: ForeignCallSingle,
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
    foreignPackedHintedNoteLength: ForeignCallSingle,
  ) {
    // Parse Option<AztecAddress>: ownerIsSome is 0 for None, 1 for Some
    const owner = fromSingle(foreignOwnerIsSome).toBool()
      ? AztecAddress.fromField(fromSingle(foreignOwnerValue))
      : undefined;
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
    const packedHintedNoteLength = fromSingle(foreignPackedHintedNoteLength).toNumber();

    const noteDatas = await this.handlerAsUtility().getNotes(
      owner,
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

    const returnDataAsArrayOfArrays = noteDatas.map(noteData =>
      packAsHintedNote({
        contractAddress: noteData.contractAddress,
        owner: noteData.owner,
        randomness: noteData.randomness,
        storageSlot: noteData.storageSlot,
        noteNonce: noteData.noteNonce,
        isPending: noteData.isPending,
        note: noteData.note,
      }),
    );

    // Now we convert each sub-array to an array of ForeignCallSingles
    const returnDataAsArrayOfForeignCallSingleArrays = returnDataAsArrayOfArrays.map(subArray =>
      subArray.map(toSingle),
    );

    // At last we convert the array of arrays to a bounded vec of arrays
    return toForeignCallResult(
      arrayOfArraysToBoundedVecOfArrays(returnDataAsArrayOfForeignCallSingleArrays, maxNotes, packedHintedNoteLength),
    );
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedNote(
    foreignOwner: ForeignCallSingle,
    foreignStorageSlot: ForeignCallSingle,
    foreignRandomness: ForeignCallSingle,
    foreignNoteTypeId: ForeignCallSingle,
    foreignNote: ForeignCallArray,
    foreignNoteHash: ForeignCallSingle,
    foreignCounter: ForeignCallSingle,
  ) {
    const owner = addressFromSingle(foreignOwner);
    const storageSlot = fromSingle(foreignStorageSlot);
    const randomness = fromSingle(foreignRandomness);
    const noteTypeId = NoteSelector.fromField(fromSingle(foreignNoteTypeId));
    const note = fromArray(foreignNote);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    this.handlerAsPrivate().notifyCreatedNote(owner, storageSlot, randomness, noteTypeId, note, noteHash, counter);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyNullifiedNote(
    foreignInnerNullifier: ForeignCallSingle,
    foreignNoteHash: ForeignCallSingle,
    foreignCounter: ForeignCallSingle,
  ) {
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const noteHash = fromSingle(foreignNoteHash);
    const counter = fromSingle(foreignCounter).toNumber();

    await this.handlerAsPrivate().notifyNullifiedNote(innerNullifier, noteHash, counter);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyCreatedNullifier(foreignInnerNullifier: ForeignCallSingle) {
    const innerNullifier = fromSingle(foreignInnerNullifier);

    await this.handlerAsPrivate().notifyCreatedNullifier(innerNullifier);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_isNullifierPending(
    foreignInnerNullifier: ForeignCallSingle,
    foreignContractAddress: ForeignCallSingle,
  ) {
    const innerNullifier = fromSingle(foreignInnerNullifier);
    const contractAddress = addressFromSingle(foreignContractAddress);

    const isPending = await this.handlerAsPrivate().isNullifierPending(innerNullifier, contractAddress);

    return toForeignCallResult([toSingle(new Fr(isPending))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_doesNullifierExist(foreignInnerNullifier: ForeignCallSingle) {
    const innerNullifier = fromSingle(foreignInnerNullifier);

    const exists = await this.handlerAsUtility().doesNullifierExist(innerNullifier);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getContractInstance(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().getContractInstance(address);

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

  // eslint-disable-next-line camelcase
  async aztec_utl_getPublicKeysAndPartialAddress(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const result = await this.handlerAsUtility().getPublicKeysAndPartialAddress(address);

    // We are going to return a Noir Option struct to represent the possibility of null values. Options are a struct
    // with two fields: `some` (a boolean) and `value` (a field array in this case).
    if (result === undefined) {
      // No data was found so we set `some` to 0 and pad `value` with zeros get the correct return size.
      return toForeignCallResult([toSingle(new Fr(0)), toArray(Array(13).fill(new Fr(0)))]);
    } else {
      // Data was found so we set `some` to 1 and return it along with `value`.
      return toForeignCallResult([
        toSingle(new Fr(1)),
        toArray([...result.publicKeys.toFields(), result.partialAddress]),
      ]);
    }
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getKeyValidationRequest(foreignPkMHash: ForeignCallSingle) {
    const pkMHash = fromSingle(foreignPkMHash);

    const keyValidationRequest = await this.handlerAsUtility().getKeyValidationRequest(pkMHash);

    return toForeignCallResult(keyValidationRequest.toFields().map(toSingle));
  }

  // eslint-disable-next-line camelcase
  aztec_prv_callPrivateFunction(
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

  // eslint-disable-next-line camelcase
  async aztec_utl_getNullifierMembershipWitness(
    foreignBlockHash: ForeignCallSingle,
    foreignNullifier: ForeignCallSingle,
  ) {
    const blockHash = blockHashFromSingle(foreignBlockHash);
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.handlerAsUtility().getNullifierMembershipWitness(blockHash, nullifier);

    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${blockHash}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getAuthWitness(foreignMessageHash: ForeignCallSingle) {
    const messageHash = fromSingle(foreignMessageHash);

    const authWitness = await this.handlerAsUtility().getAuthWitness(messageHash);

    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${messageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  // eslint-disable-next-line camelcase
  public aztec_prv_assertValidPublicCalldata(_foreignCalldataHash: ForeignCallSingle) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  // eslint-disable-next-line camelcase
  public aztec_prv_notifyRevertiblePhaseStart(_foreignMinRevertibleSideEffectCounter: ForeignCallSingle) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  // eslint-disable-next-line camelcase
  public async aztec_prv_isExecutionInRevertiblePhase(foreignSideEffectCounter: ForeignCallSingle) {
    const sideEffectCounter = fromSingle(foreignSideEffectCounter).toNumber();
    const isRevertible = await this.handlerAsPrivate().isExecutionInRevertiblePhase(sideEffectCounter);
    return toForeignCallResult([toSingle(new Fr(isRevertible))]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getUtilityContext() {
    const context = this.handlerAsUtility().getUtilityContext();

    return toForeignCallResult(context.toNoirRepresentation());
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHeader(foreignBlockNumber: ForeignCallSingle) {
    const blockNumber = BlockNumber(fromSingle(foreignBlockNumber).toNumber());

    const header = await this.handlerAsUtility().getBlockHeader(blockNumber);

    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult(header.toFields().map(toSingle));
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getNoteHashMembershipWitness(
    foreignAnchorBlockHash: ForeignCallSingle,
    foreignNoteHash: ForeignCallSingle,
  ) {
    const blockHash = blockHashFromSingle(foreignAnchorBlockHash);
    const noteHash = fromSingle(foreignNoteHash);

    const witness = await this.handlerAsUtility().getNoteHashMembershipWitness(blockHash, noteHash);

    if (!witness) {
      throw new Error(`Note hash ${noteHash} not found in the note hash tree at block ${blockHash.toString()}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  // TODO(https://linear.app/aztec-labs/issue/F-651): drop this
  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHashMembershipWitness(
    foreignAnchorBlockHash: ForeignCallSingle,
    foreignBlockHash: ForeignCallSingle,
  ) {
    const anchorBlockHash = blockHashFromSingle(foreignAnchorBlockHash);
    const blockHash = blockHashFromSingle(foreignBlockHash);

    const witness = await this.handlerAsUtility().getBlockHashMembershipWitness(anchorBlockHash, blockHash);

    if (!witness) {
      throw new Error(
        `Block hash ${blockHash.toString()} not found in the archive tree at anchor block ${anchorBlockHash.toString()}.`,
      );
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  // TODO(https://linear.app/aztec-labs/issue/F-651): rename to aztec_utl_getBlockHashMembershipWitness
  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHashMembershipWitnessV2(
    foreignAnchorBlockHash: ForeignCallSingle,
    foreignBlockHash: ForeignCallSingle,
  ) {
    const anchorBlockHash = new BlockHash(fromSingle(foreignAnchorBlockHash));
    const blockHash = new BlockHash(fromSingle(foreignBlockHash));

    const witness = await this.handlerAsUtility().getBlockHashMembershipWitness(anchorBlockHash, blockHash);
    const effective = witness ?? MembershipWitness.empty(ARCHIVE_HEIGHT);
    return toForeignCallResult([toSingle(new Fr(witness !== undefined ? 1 : 0)), ...effective.toNoirRepresentation()]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getLowNullifierMembershipWitness(
    foreignBlockHash: ForeignCallSingle,
    foreignNullifier: ForeignCallSingle,
  ) {
    const blockHash = blockHashFromSingle(foreignBlockHash);
    const nullifier = fromSingle(foreignNullifier);

    const witness = await this.handlerAsUtility().getLowNullifierMembershipWitness(blockHash, nullifier);

    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${blockHash}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getPendingTaggedLogs(
    foreignPendingTaggedLogArrayBaseSlot: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const pendingTaggedLogArrayBaseSlot = fromSingle(foreignPendingTaggedLogArrayBaseSlot);
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().getPendingTaggedLogs(pendingTaggedLogArrayBaseSlot, scope);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getPendingTaggedLogs_v2(foreignScope: ForeignCallSingle) {
    const scope = AztecAddress.fromField(fromSingle(foreignScope));
    const slot = await this.handlerAsUtility().getPendingTaggedLogsV2(scope);
    return toForeignCallResult([toSingle(slot)]);
  }

  // eslint-disable-next-line camelcase
  public async aztec_utl_validateAndStoreEnqueuedNotesAndEvents(
    foreignContractAddress: ForeignCallSingle,
    foreignNoteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignEventValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignMaxNotePackedLen: ForeignCallSingle,
    foreignMaxEventSerializedLen: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const noteValidationRequestsArrayBaseSlot = fromSingle(foreignNoteValidationRequestsArrayBaseSlot);
    const eventValidationRequestsArrayBaseSlot = fromSingle(foreignEventValidationRequestsArrayBaseSlot);
    const maxNotePackedLen = fromSingle(foreignMaxNotePackedLen).toNumber();
    const maxEventSerializedLen = fromSingle(foreignMaxEventSerializedLen).toNumber();
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
      maxNotePackedLen,
      maxEventSerializedLen,
      scope,
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  public async aztec_utl_validateAndStoreEnqueuedNotesAndEvents_v2(
    foreignNoteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignEventValidationRequestsArrayBaseSlot: ForeignCallSingle,
    foreignMaxNotePackedLen: ForeignCallSingle,
    foreignMaxEventSerializedLen: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const noteValidationRequestsArrayBaseSlot = fromSingle(foreignNoteValidationRequestsArrayBaseSlot);
    const eventValidationRequestsArrayBaseSlot = fromSingle(foreignEventValidationRequestsArrayBaseSlot);
    const maxNotePackedLen = fromSingle(foreignMaxNotePackedLen).toNumber();
    const maxEventSerializedLen = fromSingle(foreignMaxEventSerializedLen).toNumber();
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEventsV2(
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
      maxNotePackedLen,
      maxEventSerializedLen,
      scope,
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  public async aztec_utl_getLogsByTag(
    foreignContractAddress: ForeignCallSingle,
    foreignLogRetrievalRequestsArrayBaseSlot: ForeignCallSingle,
    foreignLogRetrievalResponsesArrayBaseSlot: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const logRetrievalRequestsArrayBaseSlot = fromSingle(foreignLogRetrievalRequestsArrayBaseSlot);
    const logRetrievalResponsesArrayBaseSlot = fromSingle(foreignLogRetrievalResponsesArrayBaseSlot);
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().getLogsByTag(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      logRetrievalResponsesArrayBaseSlot,
      scope,
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  public async aztec_utl_getMessageContextsByTxHash(
    foreignContractAddress: ForeignCallSingle,
    foreignMessageContextRequestsArrayBaseSlot: ForeignCallSingle,
    foreignMessageContextResponsesArrayBaseSlot: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const messageContextRequestsArrayBaseSlot = fromSingle(foreignMessageContextRequestsArrayBaseSlot);
    const messageContextResponsesArrayBaseSlot = fromSingle(foreignMessageContextResponsesArrayBaseSlot);
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().getMessageContextsByTxHash(
      contractAddress,
      messageContextRequestsArrayBaseSlot,
      messageContextResponsesArrayBaseSlot,
      scope,
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getLogsByTag_v2(foreignRequestArrayBaseSlot: ForeignCallSingle) {
    const requestArrayBaseSlot = fromSingle(foreignRequestArrayBaseSlot);
    const responseSlot = await this.handlerAsUtility().getLogsByTagV2(requestArrayBaseSlot);
    return toForeignCallResult([toSingle(responseSlot)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getMessageContextsByTxHash_v2(foreignRequestArrayBaseSlot: ForeignCallSingle) {
    const requestArrayBaseSlot = fromSingle(foreignRequestArrayBaseSlot);
    const responseSlot = await this.handlerAsUtility().getMessageContextsByTxHashV2(requestArrayBaseSlot);
    return toForeignCallResult([toSingle(responseSlot)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignCapsule: ForeignCallArray,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const capsule = fromArray(foreignCapsule);
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    this.handlerAsUtility().setCapsule(contractAddress, slot, capsule, scope);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignTSize: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const tSize = fromSingle(foreignTSize).toNumber();
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    const values = await this.handlerAsUtility().getCapsule(contractAddress, slot, scope);

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

  // eslint-disable-next-line camelcase
  aztec_utl_deleteCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSlot: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const slot = fromSingle(foreignSlot);
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    this.handlerAsUtility().deleteCapsule(contractAddress, slot, scope);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_copyCapsule(
    foreignContractAddress: ForeignCallSingle,
    foreignSrcSlot: ForeignCallSingle,
    foreignDstSlot: ForeignCallSingle,
    foreignNumEntries: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
  ) {
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));
    const srcSlot = fromSingle(foreignSrcSlot);
    const dstSlot = fromSingle(foreignDstSlot);
    const numEntries = fromSingle(foreignNumEntries).toNumber();
    const scope = AztecAddress.fromField(fromSingle(foreignScope));

    await this.handlerAsUtility().copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, scope);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_recordFact(
    foreignContractAddress: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
    foreignEntityType: ForeignCallSingle,
    foreignFactType: ForeignCallSingle,
    foreignCorrelationKey: ForeignCallSingle,
    foreignPayload: ForeignCallArray,
    foreignHasOrigin: ForeignCallSingle,
    foreignOriginBlockNumber: ForeignCallSingle,
    foreignOriginBlockHash: ForeignCallSingle,
  ) {
    const origin = fromSingle(foreignHasOrigin).toBool()
      ? {
          blockNumber: fromSingle(foreignOriginBlockNumber).toNumber(),
          blockHash: fromSingle(foreignOriginBlockHash),
        }
      : null;

    await this.handlerAsUtility().recordFact(
      AztecAddress.fromField(fromSingle(foreignContractAddress)),
      AztecAddress.fromField(fromSingle(foreignScope)),
      fromSingle(foreignEntityType),
      fromSingle(foreignFactType),
      fromSingle(foreignCorrelationKey),
      fromArray(foreignPayload),
      origin,
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_activeEntities(
    foreignContractAddress: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
    foreignEntityType: ForeignCallSingle,
  ) {
    const keys = await this.handlerAsUtility().activeEntities(
      AztecAddress.fromField(fromSingle(foreignContractAddress)),
      AztecAddress.fromField(fromSingle(foreignScope)),
      fromSingle(foreignEntityType),
    );

    if (keys.length > FACT_MAX_ACTIVE_ENTITIES) {
      throw new Error(`Active entities count ${keys.length} exceeds max ${FACT_MAX_ACTIVE_ENTITIES}`);
    }

    // The Noir oracle returns the tuple `([Field; FACT_MAX_ACTIVE_ENTITIES], u32)`: storage array first, then length.
    return toForeignCallResult(arrayToBoundedVec(toArray(keys), FACT_MAX_ACTIVE_ENTITIES));
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_loadCanonicalFacts(
    foreignContractAddress: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
    foreignEntityType: ForeignCallSingle,
    foreignCorrelationKey: ForeignCallSingle,
  ) {
    const facts = await this.handlerAsUtility().loadCanonicalFacts(
      AztecAddress.fromField(fromSingle(foreignContractAddress)),
      AztecAddress.fromField(fromSingle(foreignScope)),
      fromSingle(foreignEntityType),
      fromSingle(foreignCorrelationKey),
    );

    if (facts.length > FACT_MAX_FACTS) {
      throw new Error(`Canonical fact count ${facts.length} exceeds max ${FACT_MAX_FACTS}`);
    }

    // The Noir oracle returns `[PackedFact; FACT_MAX_FACTS]`, where each `PackedFact` flattens to its `fact_type_id`
    // followed by `FACT_MAX_PAYLOAD` payload fields. We flatten all slots into a single field stream, padding each
    // payload to `FACT_MAX_PAYLOAD` and the missing facts with all-zero `PackedFact`s.
    const flat: Fr[] = [];
    for (let i = 0; i < FACT_MAX_FACTS; i++) {
      const fact = facts[i];
      if (fact) {
        if (fact.payload.length > FACT_MAX_PAYLOAD) {
          throw new Error(`Fact payload length ${fact.payload.length} exceeds max ${FACT_MAX_PAYLOAD}`);
        }
        flat.push(fact.factType);
        flat.push(...fact.payload, ...Array(FACT_MAX_PAYLOAD - fact.payload.length).fill(new Fr(0)));
      } else {
        flat.push(new Fr(0));
        flat.push(...Array<Fr>(FACT_MAX_PAYLOAD).fill(new Fr(0)));
      }
    }

    return toForeignCallResult([toArray(flat)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_terminateEntity(
    foreignContractAddress: ForeignCallSingle,
    foreignScope: ForeignCallSingle,
    foreignEntityType: ForeignCallSingle,
    foreignCorrelationKey: ForeignCallSingle,
  ) {
    await this.handlerAsUtility().terminateEntity(
      AztecAddress.fromField(fromSingle(foreignContractAddress)),
      AztecAddress.fromField(fromSingle(foreignScope)),
      fromSingle(foreignEntityType),
      fromSingle(foreignCorrelationKey),
    );

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_pushEphemeral(foreignSlot: ForeignCallSingle, foreignElements: ForeignCallArray) {
    const slot = fromSingle(foreignSlot);
    const elements = fromArray(foreignElements);
    const newLen = this.handlerAsUtility().pushEphemeral(slot, elements);
    return toForeignCallResult([toSingle(new Fr(newLen))]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_popEphemeral(foreignSlot: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const element = this.handlerAsUtility().popEphemeral(slot);
    return toForeignCallResult([toArray(element)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeral(foreignSlot: ForeignCallSingle, foreignIndex: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const index = fromSingle(foreignIndex).toNumber();
    const element = this.handlerAsUtility().getEphemeral(slot, index);
    return toForeignCallResult([toArray(element)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setEphemeral(
    foreignSlot: ForeignCallSingle,
    foreignIndex: ForeignCallSingle,
    foreignElements: ForeignCallArray,
  ) {
    const slot = fromSingle(foreignSlot);
    const index = fromSingle(foreignIndex).toNumber();
    const elements = fromArray(foreignElements);
    this.handlerAsUtility().setEphemeral(slot, index, elements);
    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeralLen(foreignSlot: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const len = this.handlerAsUtility().getEphemeralLen(slot);
    return toForeignCallResult([toSingle(new Fr(len))]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_removeEphemeral(foreignSlot: ForeignCallSingle, foreignIndex: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const index = fromSingle(foreignIndex).toNumber();
    this.handlerAsUtility().removeEphemeral(slot, index);
    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_clearEphemeral(foreignSlot: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    this.handlerAsUtility().clearEphemeral(slot);
    return toForeignCallResult([]);
  }

  // TODO: I forgot to add a corresponding function here, when I introduced an oracle method to txe_oracle.ts.
  // The compiler didn't throw an error, so it took me a while to learn of the existence of this file, and that I need
  // to implement this function here. Isn't there a way to programmatically identify that this is missing, given the
  // existence of a txe_oracle method?
  // eslint-disable-next-line camelcase
  async aztec_utl_decryptAes128(
    foreignCiphertextBVecStorage: ForeignCallArray,
    foreignCiphertextLength: ForeignCallSingle,
    foreignIv: ForeignCallArray,
    foreignSymKey: ForeignCallArray,
  ) {
    const ciphertext = fromUintBoundedVec(foreignCiphertextBVecStorage, foreignCiphertextLength, 8);
    const iv = fromUintArray(foreignIv, 8);
    const symKey = fromUintArray(foreignSymKey, 8);

    // Noir Option<BoundedVec> is encoded as [is_some: Field, storage: Field[], length: Field].
    try {
      const plaintextBuffer = await this.handlerAsUtility().decryptAes128(ciphertext, iv, symKey);
      const [storage, length] = arrayToBoundedVec(
        bufferToU8Array(plaintextBuffer),
        foreignCiphertextBVecStorage.length,
      );
      return toForeignCallResult([toSingle(new Fr(1)), storage, length]);
    } catch {
      const zeroStorage = toArray(Array(foreignCiphertextBVecStorage.length).fill(new Fr(0)));
      return toForeignCallResult([toSingle(new Fr(0)), zeroStorage, toSingle(new Fr(0))]);
    }
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getSharedSecret(
    foreignAddress: ForeignCallSingle,
    foreignEphPKField0: ForeignCallSingle,
    foreignEphPKField1: ForeignCallSingle,
    foreignEphPKField2: ForeignCallSingle,
    foreignContractAddress: ForeignCallSingle,
  ) {
    const address = AztecAddress.fromField(fromSingle(foreignAddress));
    const ephPK = Point.fromFields([
      fromSingle(foreignEphPKField0),
      fromSingle(foreignEphPKField1),
      fromSingle(foreignEphPKField2),
    ]);
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));

    const secret = await this.handlerAsUtility().getSharedSecret(address, ephPK, contractAddress);

    return toForeignCallResult([toSingle(secret)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setContractSyncCacheInvalid(
    foreignContractAddress: ForeignCallSingle,
    foreignScopes: ForeignCallArray,
    foreignScopeCount: ForeignCallSingle,
  ) {
    const contractAddress = addressFromSingle(foreignContractAddress);
    const count = fromSingle(foreignScopeCount).toNumber();
    const scopes = fromArray(foreignScopes)
      .slice(0, count)
      .map(f => new AztecAddress(f));

    this.handlerAsUtility().setContractSyncCacheInvalid(contractAddress, scopes);

    return Promise.resolve(toForeignCallResult([]));
  }

  // eslint-disable-next-line camelcase
  aztec_utl_emitOffchainEffect(foreignData: ForeignCallArray) {
    // Record the raw payload against the currently-executing top-level call. The Noir side
    // (via `env.offchain_messages()`) is responsible for decoding the protocol-reserved prefix
    // (`OFFCHAIN_MESSAGE_IDENTIFIER`, recipient) and turning each payload into an `OffchainMessage` struct suitable
    // for `offchain_receive`.
    this.stateHandler.recordOffchainEffect(fromArray(foreignData));
    return Promise.resolve(toForeignCallResult([]));
  }

  // AVM opcodes

  // eslint-disable-next-line camelcase
  aztec_avm_emitPublicLog(_foreignMessage: ForeignCallArray) {
    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_storageRead(foreignSlot: ForeignCallSingle, foreignContractAddress: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const contractAddress = AztecAddress.fromField(fromSingle(foreignContractAddress));

    const value = (await this.handlerAsAvm().storageRead(slot, contractAddress)).value;

    return toForeignCallResult([toSingle(new Fr(value))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_storageWrite(foreignSlot: ForeignCallSingle, foreignValue: ForeignCallSingle) {
    const slot = fromSingle(foreignSlot);
    const value = fromSingle(foreignValue);

    await this.handlerAsAvm().storageWrite(slot, value);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_getContractInstanceDeployer(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().getContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_getContractInstanceClassId(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().getContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_getContractInstanceInitializationHash(foreignAddress: ForeignCallSingle) {
    const address = addressFromSingle(foreignAddress);

    const instance = await this.handlerAsUtility().getContractInstance(address);

    return toForeignCallResult([
      toSingle(instance.initializationHash),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_sender() {
    const sender = await this.handlerAsAvm().sender();

    return toForeignCallResult([toSingle(sender)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_emitNullifier(foreignNullifier: ForeignCallSingle) {
    const nullifier = fromSingle(foreignNullifier);

    await this.handlerAsAvm().emitNullifier(nullifier);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_emitNoteHash(foreignNoteHash: ForeignCallSingle) {
    const noteHash = fromSingle(foreignNoteHash);

    await this.handlerAsAvm().emitNoteHash(noteHash);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_nullifierExists(foreignSiloedNullifier: ForeignCallSingle) {
    const siloedNullifier = fromSingle(foreignSiloedNullifier);

    const exists = await this.handlerAsAvm().nullifierExists(siloedNullifier);

    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_address() {
    const contractAddress = await this.handlerAsAvm().address();

    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_blockNumber() {
    const blockNumber = await this.handlerAsAvm().blockNumber();

    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_timestamp() {
    const timestamp = await this.handlerAsAvm().timestamp();

    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_isStaticCall() {
    const isStaticCall = await this.handlerAsAvm().isStaticCall();

    return toForeignCallResult([toSingle(new Fr(isStaticCall ? 1 : 0))]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_chainId() {
    const chainId = await this.handlerAsAvm().chainId();

    return toForeignCallResult([toSingle(chainId)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_avm_version() {
    const version = await this.handlerAsAvm().version();

    return toForeignCallResult([toSingle(version)]);
  }

  // eslint-disable-next-line camelcase
  aztec_avm_returndataSize() {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  // eslint-disable-next-line camelcase
  aztec_avm_returndataCopy(_foreignRdOffset: ForeignCallSingle, _foreignCopySize: ForeignCallSingle) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  // eslint-disable-next-line camelcase
  aztec_avm_call(
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

  // eslint-disable-next-line camelcase
  aztec_avm_staticCall(
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

  // eslint-disable-next-line camelcase
  aztec_avm_successCopy() {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_privateCallNewFlow(
    foreignFromIsSome: ForeignCallSingle,
    foreignFromValue: ForeignCallSingle,
    foreignTargetContractAddress: ForeignCallSingle,
    foreignFunctionSelector: ForeignCallSingle,
    foreignArgs: ForeignCallArray,
    foreignArgsHash: ForeignCallSingle,
    foreignIsStaticCall: ForeignCallSingle,
    foreignAdditionalScopes: ForeignCallArray,
    foreignAuthorizedUtilityCallTargets: ForeignCallArray,
    foreignGasSettings: ForeignCallArray,
  ) {
    const from = fromSingle(foreignFromIsSome).toBool() ? addressFromSingle(foreignFromValue) : undefined;
    const targetContractAddress = addressFromSingle(foreignTargetContractAddress);
    const functionSelector = FunctionSelector.fromField(fromSingle(foreignFunctionSelector));
    const args = fromArray(foreignArgs);
    const argsHash = fromSingle(foreignArgsHash);
    const isStaticCall = fromSingle(foreignIsStaticCall).toBool();
    const additionalScopes = fromArray(foreignAdditionalScopes).map(field => AztecAddress.fromField(field));
    const authorizedUtilityCallTargets = fromArray(foreignAuthorizedUtilityCallTargets).map(field =>
      AztecAddress.fromField(field),
    );
    const gasSettings = GasSettings.fromFields(fromArray(foreignGasSettings));

    const returnValues = await this.stateHandler.withTopLevelCallTracking(async () => {
      const { returnValues, offchainEffects } = await this.handlerAsTxe().privateCallNewFlow(
        from,
        targetContractAddress,
        functionSelector,
        args,
        argsHash,
        isStaticCall,
        additionalScopes,
        this.stateHandler.getCurrentJob(),
        authorizedUtilityCallTargets,
        gasSettings,
      );

      // Private execution collects offchain effects inside PXE's PrivateExecutionOracle rather than
      // round-tripping them through `aztec_utl_emitOffchainEffect`, so the session buffer is empty
      // at this point. Drain the effects from the execution tree into the session buffer so the
      // next `env.offchain_messages()` call in the test sees them.
      for (const data of offchainEffects) {
        this.stateHandler.recordOffchainEffect(data);
      }

      // TODO(F-335): Avoid doing the following call here.
      await this.stateHandler.cycleJob();

      if (isStaticCall) {
        // Static calls revert their checkpoint and mine no block, so there is no tx hash to tag
        // offchain effects with. Querying `getLastTxEffects()` here would return an unrelated
        // predecessor tx.
        return { result: returnValues };
      }
      const { txHash } = await this.handlerAsTxe().getLastTxEffects();
      return { result: returnValues, txHash: txHash.hash };
    });

    return toForeignCallResult([toArray(returnValues)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_executeUtilityFunction(
    foreignTargetContractAddress: ForeignCallSingle,
    foreignFunctionSelector: ForeignCallSingle,
    foreignArgs: ForeignCallArray,
    foreignAuthorizedUtilityCallTargets: ForeignCallArray,
  ) {
    const targetContractAddress = addressFromSingle(foreignTargetContractAddress);
    const functionSelector = FunctionSelector.fromField(fromSingle(foreignFunctionSelector));
    const args = fromArray(foreignArgs);
    const authorizedUtilityCallTargets = fromArray(foreignAuthorizedUtilityCallTargets).map(field =>
      AztecAddress.fromField(field),
    );

    const returnValues = await this.stateHandler.withTopLevelCallTracking(async () => {
      const returnValues = await this.handlerAsTxe().executeUtilityFunction(
        targetContractAddress,
        functionSelector,
        args,
        this.stateHandler.getCurrentJob(),
        authorizedUtilityCallTargets,
      );

      // TODO(F-335): Avoid doing the following call here.
      await this.stateHandler.cycleJob();

      return { result: returnValues };
    });

    return toForeignCallResult([toArray(returnValues)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_txe_publicCallNewFlow(
    foreignFromIsSome: ForeignCallSingle,
    foreignFromValue: ForeignCallSingle,
    foreignAddress: ForeignCallSingle,
    foreignCalldata: ForeignCallArray,
    foreignIsStaticCall: ForeignCallSingle,
    foreignGasSettings: ForeignCallArray,
  ) {
    const from = fromSingle(foreignFromIsSome).toBool() ? addressFromSingle(foreignFromValue) : undefined;
    const address = addressFromSingle(foreignAddress);
    const calldata = fromArray(foreignCalldata);
    const isStaticCall = fromSingle(foreignIsStaticCall).toBool();
    const gasSettings = GasSettings.fromFields(fromArray(foreignGasSettings));

    const returnValues = await this.stateHandler.withTopLevelCallTracking(async () => {
      const returnValues = await this.handlerAsTxe().publicCallNewFlow(
        from,
        address,
        calldata,
        isStaticCall,
        gasSettings,
      );

      // TODO(F-335): Avoid doing the following call here.
      await this.stateHandler.cycleJob();

      if (isStaticCall) {
        // See equivalent branch in `aztec_txe_privateCallNewFlow`.
        return { result: returnValues };
      }
      const { txHash } = await this.handlerAsTxe().getLastTxEffects();
      return { result: returnValues, txHash: txHash.hash };
    });

    return toForeignCallResult([toArray(returnValues)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getSenderForTags() {
    const sender = await this.handlerAsPrivate().getSenderForTags();

    // Return a Noir Option struct with `some` and `value` fields
    if (sender === undefined) {
      // No sender found, return Option with some=0 and value=0
      return toForeignCallResult([toSingle(0), toSingle(0)]);
    } else {
      // Sender found, return Option with some=1 and value=sender address
      return toForeignCallResult([toSingle(1), toSingle(sender)]);
    }
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_setSenderForTags(foreignSenderForTags: ForeignCallSingle) {
    const senderForTags = AztecAddress.fromField(fromSingle(foreignSenderForTags));

    await this.handlerAsPrivate().setSenderForTags(senderForTags);

    return toForeignCallResult([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getNextAppTagAsSender(foreignSender: ForeignCallSingle, foreignRecipient: ForeignCallSingle) {
    const sender = AztecAddress.fromField(fromSingle(foreignSender));
    const recipient = AztecAddress.fromField(fromSingle(foreignRecipient));

    const nextAppTag = await this.handlerAsPrivate().getNextAppTagAsSender(sender, recipient);

    return toForeignCallResult([toSingle(nextAppTag.value)]);
  }
}
