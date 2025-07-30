import { type ContractInstanceWithAddress, Fr, Point } from '@aztec/aztec.js';
import { CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePartialAddress } from '@aztec/stdlib/contract';
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

  constructor(
    private logger: Logger,
    private txe: TXE,
  ) {}

  static async init(logger: Logger, protocolContracts: ProtocolContract[]) {
    logger.debug(`TXE service initialized`);
    const store = await openTmpStore('test');
    const txe = await TXE.create(logger, store, protocolContracts);
    const service = new TXEService(logger, txe);
    await service.advanceBlocksBy(toSingle(new Fr(1n)));
    return service;
  }

  // TXE Context manipulation

  // Temporary workaround - once all tests migrate to calling the new flow, in which this oracle is called at the
  // beginning of a txe test, we'll make the context check be mandatory
  enableContextChecks() {
    this.contextChecksEnabled = true;
    return toForeignCallResult([]);
  }

  setTopLevelTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context == TXEContext.TOP_LEVEL) {
        throw new Error(`Call to setTopLevelTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.TOP_LEVEL;
    return toForeignCallResult([]);
  }

  setPrivateTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to setPrivateTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.PRIVATE;
    return toForeignCallResult([]);
  }

  setPublicTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to setPublicTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.PUBLIC;
    return toForeignCallResult([]);
  }

  setUtilityTXEContext() {
    if (this.contextChecksEnabled) {
      if (this.context != TXEContext.TOP_LEVEL) {
        throw new Error(`Call to setUtilityTXEContext while in context ${TXEContext[this.context]}`);
      }
    }

    this.context = TXEContext.UTILITY;
    return toForeignCallResult([]);
  }

  // Cheatcodes

  async getPrivateContextInputs(blockNumberIsSome: ForeignCallSingle, blockNumberValue: ForeignCallSingle) {
    const blockNumber = fromSingle(blockNumberIsSome).toBool() ? fromSingle(blockNumberValue).toNumber() : null;

    const inputs = await this.txe.getPrivateContextInputs(blockNumber);

    this.logger.info(
      `Created private context for block ${inputs.historicalHeader.globalVariables.blockNumber} (requested ${blockNumber})`,
    );

    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  async advanceBlocksBy(blocks: ForeignCallSingle) {
    const nBlocks = fromSingle(blocks).toNumber();
    this.logger.debug(`time traveling ${nBlocks} blocks`);

    for (let i = 0; i < nBlocks; i++) {
      const blockNumber = await this.txe.getBlockNumber();
      await this.txe.commitState();
      this.txe.setBlockNumber(blockNumber + 1);
    }
    return toForeignCallResult([]);
  }

  advanceTimestampBy(duration: ForeignCallSingle) {
    const durationBigInt = fromSingle(duration).toBigInt();
    this.logger.debug(`time traveling ${durationBigInt} seconds`);
    this.txe.advanceTimestampBy(durationBigInt);
    return toForeignCallResult([]);
  }

  setContractAddress(address: ForeignCallSingle) {
    const typedAddress = addressFromSingle(address);
    this.txe.setContractAddress(typedAddress);
    return toForeignCallResult([]);
  }

  async deploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
    // Emit deployment nullifier
    await this.txe.noteCache.nullifierCreated(
      AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
      instance.address.toField(),
    );

    // Make sure the deployment nullifier gets included in a tx in a block
    const blockNumber = await this.txe.getBlockNumber();
    await this.txe.commitState();
    this.txe.setBlockNumber(blockNumber + 1);

    if (!fromSingle(secret).equals(Fr.ZERO)) {
      await this.addAccount(artifact, instance, secret);
    } else {
      await this.txe.addContractInstance(instance);
      await this.txe.addContractArtifact(instance.currentContractClassId, artifact);
      this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    }

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

  async createAccount(secret: ForeignCallSingle) {
    const keyStore = this.txe.getKeyStore();
    const secretFr = fromSingle(secret);
    // This is a footgun !
    const completeAddress = await keyStore.addAccount(secretFr, secretFr);
    const accountDataProvider = this.txe.getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = this.txe.getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);
    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async addAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
    this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    await this.txe.addContractInstance(instance);
    await this.txe.addContractArtifact(instance.currentContractClassId, artifact);

    const keyStore = this.txe.getKeyStore();
    const completeAddress = await keyStore.addAccount(fromSingle(secret), await computePartialAddress(instance));
    const accountDataProvider = this.txe.getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = this.txe.getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);
    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async addAuthWitness(address: ForeignCallSingle, messageHash: ForeignCallSingle) {
    await this.txe.addAuthWitness(addressFromSingle(address), fromSingle(messageHash));
    return toForeignCallResult([]);
  }

  // PXE oracles

  getRandomField() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(this.txe.getRandomField())]);
  }

  async getContractAddress() {
    if (
      this.contextChecksEnabled &&
      this.context != TXEContext.TOP_LEVEL &&
      this.context != TXEContext.UTILITY &&
      this.context != TXEContext.PRIVATE
    ) {
      throw new Error(`Attempted to call getContractAddress while in context ${TXEContext[this.context]}`);
    }

    const contractAddress = await this.txe.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async getBlockNumber() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL && this.context != TXEContext.UTILITY) {
      throw new Error(`Attempted to call getBlockNumber while in context ${TXEContext[this.context]}`);
    }

    const blockNumber = await this.txe.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  // seems to be used to mean the timestamp of the last mined block in txe (but that's not what is done here)
  async getTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL && this.context != TXEContext.UTILITY) {
      throw new Error(`Attempted to call getTimestamp while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.getTimestamp();
    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  async getLastBlockTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.TOP_LEVEL) {
      throw new Error(`Attempted to call getTimestamp while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.getLastBlockTimestamp();
    return toForeignCallResult([toSingle(new Fr(timestamp))]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  storeInExecutionCache(_length: ForeignCallSingle, values: ForeignCallArray, hash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    this.txe.storeInExecutionCache(fromArray(values), fromSingle(hash));
    return toForeignCallResult([]);
  }

  async loadFromExecutionCache(hash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const returns = await this.txe.loadFromExecutionCache(fromSingle(hash));
    return toForeignCallResult([toArray(returns)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  debugLog(message: ForeignCallArray, _length: ForeignCallSingle, fields: ForeignCallArray) {
    const messageStr = fromArray(message)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fieldsFr = fromArray(fields);
    this.txe.debugLog(messageStr, fieldsFr);
    return toForeignCallResult([]);
  }

  async storageRead(
    contractAddress: ForeignCallSingle,
    startStorageSlot: ForeignCallSingle,
    blockNumber: ForeignCallSingle,
    numberOfElements: ForeignCallSingle,
  ) {
    const values = await this.txe.storageRead(
      addressFromSingle(contractAddress),
      fromSingle(startStorageSlot),
      fromSingle(blockNumber).toNumber(),
      fromSingle(numberOfElements).toNumber(),
    );
    return toForeignCallResult([toArray(values)]);
  }

  async storageWrite(startStorageSlot: ForeignCallSingle, values: ForeignCallArray) {
    const newValues = await this.txe.storageWrite(fromSingle(startStorageSlot), fromArray(values));
    return toForeignCallResult([toArray(newValues)]);
  }

  async getPublicDataWitness(blockNumber: ForeignCallSingle, leafSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedLeafSlot = fromSingle(leafSlot);

    const witness = await this.txe.getPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async getNotes(
    storageSlot: ForeignCallSingle,
    numSelects: ForeignCallSingle,
    selectByIndexes: ForeignCallArray,
    selectByOffsets: ForeignCallArray,
    selectByLengths: ForeignCallArray,
    selectValues: ForeignCallArray,
    selectComparators: ForeignCallArray,
    sortByIndexes: ForeignCallArray,
    sortByOffsets: ForeignCallArray,
    sortByLengths: ForeignCallArray,
    sortOrder: ForeignCallArray,
    limit: ForeignCallSingle,
    offset: ForeignCallSingle,
    status: ForeignCallSingle,
    maxNotes: ForeignCallSingle,
    packedRetrievedNoteLength: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const noteDatas = await this.txe.getNotes(
      fromSingle(storageSlot),
      fromSingle(numSelects).toNumber(),
      fromArray(selectByIndexes).map(fr => fr.toNumber()),
      fromArray(selectByOffsets).map(fr => fr.toNumber()),
      fromArray(selectByLengths).map(fr => fr.toNumber()),
      fromArray(selectValues),
      fromArray(selectComparators).map(fr => fr.toNumber()),
      fromArray(sortByIndexes).map(fr => fr.toNumber()),
      fromArray(sortByOffsets).map(fr => fr.toNumber()),
      fromArray(sortByLengths).map(fr => fr.toNumber()),
      fromArray(sortOrder).map(fr => fr.toNumber()),
      fromSingle(limit).toNumber(),
      fromSingle(offset).toNumber(),
      fromSingle(status).toNumber(),
    );

    if (noteDatas.length > 0) {
      const noteLength = noteDatas[0].note.items.length;
      if (!noteDatas.every(({ note }) => noteLength === note.items.length)) {
        throw new Error('Notes should all be the same length.');
      }
    }

    // The expected return type is a BoundedVec<[Field; packedRetrievedNoteLength], maxNotes> where each
    // array is structured as [contract_address, note_nonce, nonzero_note_hash_counter, ...packed_note].

    const returnDataAsArrayOfArrays = noteDatas.map(({ contractAddress, noteNonce, index, note }) => {
      // If index is undefined, the note is transient which implies that the nonzero_note_hash_counter has to be true
      const noteIsTransient = index === undefined;
      const nonzeroNoteHashCounter = noteIsTransient ? true : false;
      // If you change the array on the next line you have to change the `unpack_retrieved_note` function in
      // `aztec/src/note/retrieved_note.nr`
      return [contractAddress, noteNonce, nonzeroNoteHashCounter, ...note.items];
    });

    // Now we convert each sub-array to an array of ForeignCallSingles
    const returnDataAsArrayOfForeignCallSingleArrays = returnDataAsArrayOfArrays.map(subArray =>
      subArray.map(toSingle),
    );

    // At last we convert the array of arrays to a bounded vec of arrays
    return toForeignCallResult(
      arrayOfArraysToBoundedVecOfArrays(
        returnDataAsArrayOfForeignCallSingleArrays,
        fromSingle(maxNotes).toNumber(),
        fromSingle(packedRetrievedNoteLength).toNumber(),
      ),
    );
  }

  notifyCreatedNote(
    storageSlot: ForeignCallSingle,
    noteTypeId: ForeignCallSingle,
    note: ForeignCallArray,
    noteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    this.txe.notifyCreatedNote(
      fromSingle(storageSlot),
      NoteSelector.fromField(fromSingle(noteTypeId)),
      fromArray(note),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async notifyNullifiedNote(
    innerNullifier: ForeignCallSingle,
    noteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.notifyNullifiedNote(
      fromSingle(innerNullifier),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async notifyCreatedNullifier(innerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.notifyCreatedNullifier(fromSingle(innerNullifier));
    return toForeignCallResult([]);
  }

  async checkNullifierExists(innerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const exists = await this.txe.checkNullifierExists(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async getContractInstance(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.txe.getContractInstance(addressFromSingle(address));
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

  async getPublicKeysAndPartialAddress(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedAddress = addressFromSingle(address);
    const { publicKeys, partialAddress } = await this.txe.getCompleteAddress(parsedAddress);
    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async getKeyValidationRequest(pkMHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const keyValidationRequest = await this.txe.getKeyValidationRequest(fromSingle(pkMHash));
    return toForeignCallResult(keyValidationRequest.toFields().map(toSingle));
  }

  callPrivateFunction(
    _targetContractAddress: ForeignCallSingle,
    _functionSelector: ForeignCallSingle,
    _argsHash: ForeignCallSingle,
    _sideEffectCounter: ForeignCallSingle,
    _isStaticCall: ForeignCallSingle,
  ) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::private_context`, use `private_call` instead',
    );
  }

  async getNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const witness = await this.txe.getNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async getAuthWitness(messageHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedMessageHash = fromSingle(messageHash);
    const authWitness = await this.txe.getAuthWitness(parsedMessageHash);
    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${parsedMessageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  public notifyEnqueuedPublicFunctionCall(
    _targetContractAddress: ForeignCallSingle,
    _calldataHash: ForeignCallSingle,
    _sideEffectCounter: ForeignCallSingle,
    _isStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public notifySetPublicTeardownFunctionCall(
    _targetContractAddress: ForeignCallSingle,
    _calldataHash: ForeignCallSingle,
    _sideEffectCounter: ForeignCallSingle,
    _isStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public notifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: ForeignCallSingle) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  async getChainId() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.txe.getChainId())]);
  }

  async getVersion() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.txe.getVersion())]);
  }

  async getBlockHeader(blockNumber: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const header = await this.txe.getBlockHeader(fromSingle(blockNumber).toNumber());
    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult(header.toFields().map(toSingle));
  }

  async getMembershipWitness(blockNumber: ForeignCallSingle, treeId: ForeignCallSingle, leafValue: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedTreeId = fromSingle(treeId).toNumber();
    const parsedLeafValue = fromSingle(leafValue);
    const witness = await this.txe.getMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
    if (!witness) {
      throw new Error(
        `Membership witness in tree ${MerkleTreeId[parsedTreeId]} not found for value ${parsedLeafValue} at block ${parsedBlockNumber}.`,
      );
    }
    return toForeignCallResult([toSingle(witness[0]), toArray(witness.slice(1))]);
  }

  async getLowNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();

    const witness = await this.txe.getLowNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async getIndexedTaggingSecretAsSender(sender: ForeignCallSingle, recipient: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const secret = await this.txe.getIndexedTaggingSecretAsSender(
      AztecAddress.fromField(fromSingle(sender)),
      AztecAddress.fromField(fromSingle(recipient)),
    );
    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.fetchTaggedLogs(fromSingle(pendingTaggedLogArrayBaseSlot));
    return toForeignCallResult([]);
  }

  public async validateEnqueuedNotesAndEvents(
    contractAddress: ForeignCallSingle,
    noteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    eventValidationRequestsArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.validateEnqueuedNotesAndEvents(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(noteValidationRequestsArrayBaseSlot),
      fromSingle(eventValidationRequestsArrayBaseSlot),
    );

    return toForeignCallResult([]);
  }

  public async bulkRetrieveLogs(
    contractAddress: ForeignCallSingle,
    logRetrievalRequestsArrayBaseSlot: ForeignCallSingle,
    logRetrievalResponsesArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.bulkRetrieveLogs(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(logRetrievalRequestsArrayBaseSlot),
      fromSingle(logRetrievalResponsesArrayBaseSlot),
    );

    return toForeignCallResult([]);
  }

  async storeCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, capsule: ForeignCallArray) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.storeCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(slot),
      fromArray(capsule),
    );
    return toForeignCallResult([]);
  }

  async loadCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, tSize: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const values = await this.txe.loadCapsule(AztecAddress.fromField(fromSingle(contractAddress)), fromSingle(slot));
    // We are going to return a Noir Option struct to represent the possibility of null values. Options are a struct
    // with two fields: `some` (a boolean) and `value` (a field array in this case).
    if (values === null) {
      // No data was found so we set `some` to 0 and pad `value` with zeros get the correct return size.
      return toForeignCallResult([toSingle(new Fr(0)), toArray(Array(fromSingle(tSize).toNumber()).fill(new Fr(0)))]);
    } else {
      // Data was found so we set `some` to 1 and return it along with `value`.
      return toForeignCallResult([toSingle(new Fr(1)), toArray(values)]);
    }
  }

  async deleteCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.deleteCapsule(AztecAddress.fromField(fromSingle(contractAddress)), fromSingle(slot));
    return toForeignCallResult([]);
  }

  async copyCapsule(
    contractAddress: ForeignCallSingle,
    srcSlot: ForeignCallSingle,
    dstSlot: ForeignCallSingle,
    numEntries: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.copyCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(srcSlot),
      fromSingle(dstSlot),
      fromSingle(numEntries).toNumber(),
    );

    return toForeignCallResult([]);
  }

  // TODO: I forgot to add a corresponding function here, when I introduced an oracle method to txe_oracle.ts.
  // The compiler didn't throw an error, so it took me a while to learn of the existence of this file, and that I need
  // to implement this function here. Isn't there a way to programmatically identify that this is missing, given the
  // existence of a txe_oracle method?
  async aes128Decrypt(
    ciphertextBVecStorage: ForeignCallArray,
    ciphertextLength: ForeignCallSingle,
    iv: ForeignCallArray,
    symKey: ForeignCallArray,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const plaintextBuffer = await this.txe.aes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);

    return toForeignCallResult(arrayToBoundedVec(bufferToU8Array(plaintextBuffer), ciphertextBVecStorage.length));
  }

  async getSharedSecret(
    address: ForeignCallSingle,
    ephPKField0: ForeignCallSingle,
    ephPKField1: ForeignCallSingle,
    ephPKField2: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const secret = await this.txe.getSharedSecret(
      AztecAddress.fromField(fromSingle(address)),
      Point.fromFields([fromSingle(ephPKField0), fromSingle(ephPKField1), fromSingle(ephPKField2)]),
    );
    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  emitOffchainEffect(_data: ForeignCallArray) {
    throw new Error('Offchain effects are not yet supported in the TestEnvironment');
  }

  // AVM opcodes

  avmOpcodeEmitUnencryptedLog(_message: ForeignCallArray) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitUnencryptedLog oracle while in context ${TXEContext[this.context]}`,
      );
    }

    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  async avmOpcodeStorageRead(slot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeStorageRead oracle while in context ${TXEContext[this.context]}`);
    }

    const value = (await this.txe.avmOpcodeStorageRead(fromSingle(slot))).value;
    return toForeignCallResult([toSingle(new Fr(value))]);
  }

  async avmOpcodeStorageWrite(slot: ForeignCallSingle, value: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeStorageWrite oracle while in context ${TXEContext[this.context]}`,
      );
    }

    await this.txe.storageWrite(fromSingle(slot), [fromSingle(value)]);
    return toForeignCallResult([]);
  }

  async avmOpcodeGetContractInstanceDeployer(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceDeployer oracle while in context ${TXEContext[this.context]}`,
      );
    }

    const instance = await this.txe.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceClassId(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceClassId oracle while in context ${TXEContext[this.context]}`,
      );
    }

    const instance = await this.txe.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceInitializationHash(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeGetContractInstanceInitializationHash oracle while in context ${TXEContext[this.context]}`,
      );
    }

    const instance = await this.txe.getContractInstance(addressFromSingle(address));
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

  async avmOpcodeEmitNullifier(nullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitNullifier oracle while in context ${TXEContext[this.context]}`,
      );
    }

    await this.txe.avmOpcodeEmitNullifier(fromSingle(nullifier));
    return toForeignCallResult([]);
  }

  async avmOpcodeEmitNoteHash(noteHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeEmitNoteHash oracle while in context ${TXEContext[this.context]}`,
      );
    }

    await this.txe.avmOpcodeEmitNoteHash(fromSingle(noteHash));
    return toForeignCallResult([]);
  }

  async avmOpcodeNullifierExists(innerNullifier: ForeignCallSingle, targetAddress: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(
        `Attempted to call the avmOpcodeNullifierExists oracle while in context ${TXEContext[this.context]}`,
      );
    }

    const exists = await this.txe.avmOpcodeNullifierExists(
      fromSingle(innerNullifier),
      AztecAddress.fromField(fromSingle(targetAddress)),
    );
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async avmOpcodeAddress() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeAddress oracle while in context ${TXEContext[this.context]}`);
    }

    const contractAddress = await this.txe.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async avmOpcodeBlockNumber() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeBlockNumber oracle while in context ${TXEContext[this.context]}`);
    }

    const blockNumber = await this.txe.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  async avmOpcodeTimestamp() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeTimestamp oracle while in context ${TXEContext[this.context]}`);
    }

    const timestamp = await this.txe.getTimestamp();
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

    const chainId = await this.txe.getChainId();
    return toForeignCallResult([toSingle(chainId)]);
  }

  async avmOpcodeVersion() {
    if (this.contextChecksEnabled && this.context != TXEContext.PUBLIC) {
      throw new Error(`Attempted to call the avmOpcodeVersion oracle while in context ${TXEContext[this.context]}`);
    }

    const version = await this.txe.getVersion();
    return toForeignCallResult([toSingle(version)]);
  }

  avmOpcodeReturndataSize() {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeReturndataCopy(_rdOffset: ForeignCallSingle, _copySize: ForeignCallSingle) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeCall(
    _l2Gas: ForeignCallSingle,
    _daGas: ForeignCallSingle,
    _address: ForeignCallSingle,
    _length: ForeignCallSingle,
    _args: ForeignCallArray,
  ) {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  avmOpcodeStaticCall(
    _l2Gas: ForeignCallSingle,
    _daGas: ForeignCallSingle,
    _address: ForeignCallSingle,
    _length: ForeignCallSingle,
    _args: ForeignCallArray,
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

  async privateCallNewFlow(
    from: ForeignCallSingle,
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    _argsLength: ForeignCallSingle,
    args: ForeignCallArray,
    argsHash: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    const result = await this.txe.privateCallNewFlow(
      addressFromSingle(from),
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromArray(args),
      fromSingle(argsHash),
      fromSingle(isStaticCall).toBool(),
    );

    return toForeignCallResult([toArray([result.endSideEffectCounter, result.returnsHash, result.txHash.hash])]);
  }

  async simulateUtilityFunction(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
  ) {
    const result = await this.txe.simulateUtilityFunction(
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromSingle(argsHash),
    );

    return toForeignCallResult([toSingle(result)]);
  }

  async publicCallNewFlow(
    from: ForeignCallSingle,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    calldata: ForeignCallArray,
    isStaticCall: ForeignCallSingle,
  ) {
    const result = await this.txe.publicCallNewFlow(
      addressFromSingle(from),
      addressFromSingle(address),
      fromArray(calldata),
      fromSingle(isStaticCall).toBool(),
    );

    return toForeignCallResult([toArray([result.returnsHash, result.txHash.hash])]);
  }

  async getSenderForTags() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const sender = await this.txe.getSenderForTags();
    // Return a Noir Option struct with `some` and `value` fields
    if (sender === undefined) {
      // No sender found, return Option with some=0 and value=0
      return toForeignCallResult([toSingle(0), toSingle(0)]);
    } else {
      // Sender found, return Option with some=1 and value=sender address
      return toForeignCallResult([toSingle(1), toSingle(sender)]);
    }
  }

  async setSenderForTags(senderForTags: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.setSenderForTags(AztecAddress.fromField(fromSingle(senderForTags)));
    return toForeignCallResult([]);
  }
}
