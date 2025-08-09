import { type ContractInstanceWithAddress, Fr, Point } from '@aztec/aztec.js';
import { CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { packAsRetrievedNote } from '@aztec/pxe/simulator';
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

  async txeGetPrivateContextInputs(blockNumberIsSome: ForeignCallSingle, blockNumberValue: ForeignCallSingle) {
    const blockNumber = fromSingle(blockNumberIsSome).toBool() ? fromSingle(blockNumberValue).toNumber() : null;

    const inputs = await this.txe.txeGetPrivateContextInputs(blockNumber);

    this.logger.info(
      `Created private context for block ${inputs.historicalHeader.globalVariables.blockNumber} (requested ${blockNumber})`,
    );

    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  async txeAdvanceBlocksBy(blocks: ForeignCallSingle) {
    const nBlocks = fromSingle(blocks).toNumber();
    this.logger.debug(`time traveling ${nBlocks} blocks`);

    for (let i = 0; i < nBlocks; i++) {
      const blockNumber = await this.txe.utilityGetBlockNumber();
      await this.txe.commitState();
      this.txe.setBlockNumber(blockNumber + 1);
    }
    return toForeignCallResult([]);
  }

  txeAdvanceTimestampBy(duration: ForeignCallSingle) {
    const durationBigInt = fromSingle(duration).toBigInt();
    this.logger.debug(`time traveling ${durationBigInt} seconds`);
    this.txe.txeAdvanceTimestampBy(durationBigInt);
    return toForeignCallResult([]);
  }

  txeSetContractAddress(address: ForeignCallSingle) {
    const typedAddress = addressFromSingle(address);
    this.txe.txeSetContractAddress(typedAddress);
    return toForeignCallResult([]);
  }

  async txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
    // Emit deployment nullifier
    await this.txe.noteCache.nullifierCreated(
      AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
      instance.address.toField(),
    );

    // Make sure the deployment nullifier gets included in a tx in a block
    const blockNumber = await this.txe.utilityGetBlockNumber();
    await this.txe.commitState();
    this.txe.setBlockNumber(blockNumber + 1);

    if (!fromSingle(secret).equals(Fr.ZERO)) {
      await this.txeAddAccount(artifact, instance, secret);
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

  async txeCreateAccount(secret: ForeignCallSingle) {
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

  async txeAddAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
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

  async txeAddAuthWitness(address: ForeignCallSingle, messageHash: ForeignCallSingle) {
    await this.txe.txeAddAuthWitness(addressFromSingle(address), fromSingle(messageHash));
    return toForeignCallResult([]);
  }

  // PXE oracles

  utilityGetRandomField() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(this.txe.utilityGetRandomField())]);
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
  privateStoreInExecutionCache(_length: ForeignCallSingle, values: ForeignCallArray, hash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    this.txe.privateStoreInExecutionCache(fromArray(values), fromSingle(hash));
    return toForeignCallResult([]);
  }

  async privateLoadFromExecutionCache(hash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const returns = await this.txe.privateLoadFromExecutionCache(fromSingle(hash));
    return toForeignCallResult([toArray(returns)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  utilityDebugLog(message: ForeignCallArray, _length: ForeignCallSingle, fields: ForeignCallArray) {
    const messageStr = fromArray(message)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fieldsFr = fromArray(fields);
    this.txe.utilityDebugLog(messageStr, fieldsFr);
    return toForeignCallResult([]);
  }

  async utilityStorageRead(
    contractAddress: ForeignCallSingle,
    startStorageSlot: ForeignCallSingle,
    blockNumber: ForeignCallSingle,
    numberOfElements: ForeignCallSingle,
  ) {
    const values = await this.txe.utilityStorageRead(
      addressFromSingle(contractAddress),
      fromSingle(startStorageSlot),
      fromSingle(blockNumber).toNumber(),
      fromSingle(numberOfElements).toNumber(),
    );
    return toForeignCallResult([toArray(values)]);
  }

  async utilityGetPublicDataWitness(blockNumber: ForeignCallSingle, leafSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedLeafSlot = fromSingle(leafSlot);

    const witness = await this.txe.utilityGetPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetNotes(
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

    const noteDatas = await this.txe.utilityGetNotes(
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

    const returnDataAsArrayOfArrays = noteDatas.map(packAsRetrievedNote);

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

  privateNotifyCreatedNote(
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

    this.txe.privateNotifyCreatedNote(
      fromSingle(storageSlot),
      NoteSelector.fromField(fromSingle(noteTypeId)),
      fromArray(note),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async privateNotifyNullifiedNote(
    innerNullifier: ForeignCallSingle,
    noteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.privateNotifyNullifiedNote(
      fromSingle(innerNullifier),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async privateNotifyCreatedNullifier(innerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.privateNotifyCreatedNullifier(fromSingle(innerNullifier));
    return toForeignCallResult([]);
  }

  async utilityCheckNullifierExists(innerNullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const exists = await this.txe.utilityCheckNullifierExists(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async utilityGetContractInstance(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.txe.utilityGetContractInstance(addressFromSingle(address));
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

  async utilityGetPublicKeysAndPartialAddress(address: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedAddress = addressFromSingle(address);
    const { publicKeys, partialAddress } = await this.txe.utilityGetCompleteAddress(parsedAddress);
    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async utilityGetKeyValidationRequest(pkMHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const keyValidationRequest = await this.txe.utilityGetKeyValidationRequest(fromSingle(pkMHash));
    return toForeignCallResult(keyValidationRequest.toFields().map(toSingle));
  }

  privateCallPrivateFunction(
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

  async utilityGetNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const witness = await this.txe.utilityGetNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetAuthWitness(messageHash: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedMessageHash = fromSingle(messageHash);
    const authWitness = await this.txe.utilityGetAuthWitness(parsedMessageHash);
    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${parsedMessageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  public privateNotifyEnqueuedPublicFunctionCall(
    _targetContractAddress: ForeignCallSingle,
    _calldataHash: ForeignCallSingle,
    _sideEffectCounter: ForeignCallSingle,
    _isStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public privateNotifySetPublicTeardownFunctionCall(
    _targetContractAddress: ForeignCallSingle,
    _calldataHash: ForeignCallSingle,
    _sideEffectCounter: ForeignCallSingle,
    _isStaticCall: ForeignCallSingle,
  ) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  public privateNotifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: ForeignCallSingle) {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  async utilityGetChainId() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.txe.utilityGetChainId())]);
  }

  async utilityGetVersion() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.txe.utilityGetVersion())]);
  }

  async utilityGetUtilityContext() {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const context = await this.txe.utilityGetUtilityContext();

    return toForeignCallResult(context.toNoirRepresentation());
  }

  async utilityGetBlockHeader(blockNumber: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const header = await this.txe.utilityGetBlockHeader(fromSingle(blockNumber).toNumber());
    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult(header.toFields().map(toSingle));
  }

  async utilityGetMembershipWitness(
    blockNumber: ForeignCallSingle,
    treeId: ForeignCallSingle,
    leafValue: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedTreeId = fromSingle(treeId).toNumber();
    const parsedLeafValue = fromSingle(leafValue);
    const witness = await this.txe.utilityGetMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
    if (!witness) {
      throw new Error(
        `Membership witness in tree ${MerkleTreeId[parsedTreeId]} not found for value ${parsedLeafValue} at block ${parsedBlockNumber}.`,
      );
    }
    return toForeignCallResult([toSingle(witness[0]), toArray(witness.slice(1))]);
  }

  async utilityGetLowNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();

    const witness = await this.txe.utilityGetLowNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async utilityGetIndexedTaggingSecretAsSender(sender: ForeignCallSingle, recipient: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const secret = await this.txe.utilityGetIndexedTaggingSecretAsSender(
      AztecAddress.fromField(fromSingle(sender)),
      AztecAddress.fromField(fromSingle(recipient)),
    );
    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.utilityFetchTaggedLogs(fromSingle(pendingTaggedLogArrayBaseSlot));
    return toForeignCallResult([]);
  }

  public async utilityValidateEnqueuedNotesAndEvents(
    contractAddress: ForeignCallSingle,
    noteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    eventValidationRequestsArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.utilityValidateEnqueuedNotesAndEvents(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(noteValidationRequestsArrayBaseSlot),
      fromSingle(eventValidationRequestsArrayBaseSlot),
    );

    return toForeignCallResult([]);
  }

  public async utilityBulkRetrieveLogs(
    contractAddress: ForeignCallSingle,
    logRetrievalRequestsArrayBaseSlot: ForeignCallSingle,
    logRetrievalResponsesArrayBaseSlot: ForeignCallSingle,
  ) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.utilityBulkRetrieveLogs(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(logRetrievalRequestsArrayBaseSlot),
      fromSingle(logRetrievalResponsesArrayBaseSlot),
    );

    return toForeignCallResult([]);
  }

  async utilityStoreCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, capsule: ForeignCallArray) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.utilityStoreCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(slot),
      fromArray(capsule),
    );
    return toForeignCallResult([]);
  }

  async utilityLoadCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, tSize: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const values = await this.txe.utilityLoadCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(slot),
    );
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

  async utilityDeleteCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.utilityDeleteCapsule(AztecAddress.fromField(fromSingle(contractAddress)), fromSingle(slot));
    return toForeignCallResult([]);
  }

  async utilityCopyCapsule(
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

    await this.txe.utilityCopyCapsule(
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
  async utilityAes128Decrypt(
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

    const plaintextBuffer = await this.txe.utilityAes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);

    return toForeignCallResult(arrayToBoundedVec(bufferToU8Array(plaintextBuffer), ciphertextBVecStorage.length));
  }

  async utilityGetSharedSecret(
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

    const secret = await this.txe.utilityGetSharedSecret(
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

    const instance = await this.txe.utilityGetContractInstance(addressFromSingle(address));
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

    const instance = await this.txe.utilityGetContractInstance(addressFromSingle(address));
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

    const instance = await this.txe.utilityGetContractInstance(addressFromSingle(address));
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

  async txePrivateCallNewFlow(
    from: ForeignCallSingle,
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    _argsLength: ForeignCallSingle,
    args: ForeignCallArray,
    argsHash: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    const result = await this.txe.txePrivateCallNewFlow(
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

  async txePublicCallNewFlow(
    from: ForeignCallSingle,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    calldata: ForeignCallArray,
    isStaticCall: ForeignCallSingle,
  ) {
    const result = await this.txe.txePublicCallNewFlow(
      addressFromSingle(from),
      addressFromSingle(address),
      fromArray(calldata),
      fromSingle(isStaticCall).toBool(),
    );

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

  async privateSetSenderForTags(senderForTags: ForeignCallSingle) {
    if (this.contextChecksEnabled && this.context == TXEContext.TOP_LEVEL) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.txe.privateSetSenderForTags(AztecAddress.fromField(fromSingle(senderForTags)));
    return toForeignCallResult([]);
  }
}
