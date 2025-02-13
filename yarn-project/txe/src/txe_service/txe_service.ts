import { MerkleTreeId, SimulationError } from '@aztec/circuit-types';
import {
  type ContractInstanceWithAddress,
  DEPLOYER_CONTRACT_ADDRESS,
  Fr,
  FunctionSelector,
  PublicDataWrite,
  computePartialAddress,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { type ContractArtifact, NoteSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Logger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { protocolContractNames } from '@aztec/protocol-contracts';
import { getCanonicalProtocolContract } from '@aztec/protocol-contracts/bundle';
import { enrichPublicSimulationError } from '@aztec/pxe';
import { type TypedOracle } from '@aztec/simulator/client';
import { HashedValuesCache } from '@aztec/simulator/server';
import { NativeWorldStateService } from '@aztec/world-state';

import { TXE } from '../oracle/txe_oracle.js';
import {
  type ForeignCallArray,
  type ForeignCallSingle,
  addressFromSingle,
  fromArray,
  fromSingle,
  fromUintArray,
  toArray,
  toForeignCallResult,
  toSingle,
} from '../util/encoding.js';
import { ExpectedFailureError } from '../util/expected_failure_error.js';
import { TXEDatabase } from '../util/txe_database.js';

export class TXEService {
  constructor(private logger: Logger, private typedOracle: TypedOracle) {}

  static async init(logger: Logger) {
    const store = openTmpStore(true);
    const executionCache = new HashedValuesCache();
    const nativeWorldStateService = await NativeWorldStateService.tmp();
    const baseFork = await nativeWorldStateService.fork();

    const keyStore = new KeyStore(store);
    const txeDatabase = new TXEDatabase(store);
    // Register protocol contracts.
    for (const name of protocolContractNames) {
      const { contractClass, instance, artifact } = await getCanonicalProtocolContract(name);
      await txeDatabase.addContractArtifact(contractClass.id, artifact);
      await txeDatabase.addContractInstance(instance);
    }
    logger.debug(`TXE service initialized`);
    const txe = await TXE.create(logger, executionCache, keyStore, txeDatabase, nativeWorldStateService, baseFork);
    const service = new TXEService(logger, txe);
    await service.advanceBlocksBy(toSingle(new Fr(1n)));
    return service;
  }

  // Cheatcodes

  async getPrivateContextInputs(blockNumber: ForeignCallSingle) {
    const inputs = await (this.typedOracle as TXE).getPrivateContextInputs(fromSingle(blockNumber).toNumber());
    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  async advanceBlocksBy(blocks: ForeignCallSingle) {
    const nBlocks = fromSingle(blocks).toNumber();
    this.logger.debug(`time traveling ${nBlocks} blocks`);

    for (let i = 0; i < nBlocks; i++) {
      const blockNumber = await this.typedOracle.getBlockNumber();
      await (this.typedOracle as TXE).commitState();
      (this.typedOracle as TXE).setBlockNumber(blockNumber + 1);
    }
    return toForeignCallResult([]);
  }

  setContractAddress(address: ForeignCallSingle) {
    const typedAddress = addressFromSingle(address);
    (this.typedOracle as TXE).setContractAddress(typedAddress);
    return toForeignCallResult([]);
  }

  async deriveKeys(secret: ForeignCallSingle) {
    const keys = await (this.typedOracle as TXE).deriveKeys(fromSingle(secret));
    return toForeignCallResult(keys.publicKeys.toFields().map(toSingle));
  }

  async deploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
    // Emit deployment nullifier
    (this.typedOracle as TXE).addSiloedNullifiersFromPublic([
      await siloNullifier(AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS), instance.address.toField()),
    ]);

    if (!fromSingle(secret).equals(Fr.ZERO)) {
      await this.addAccount(artifact, instance, secret);
    } else {
      await (this.typedOracle as TXE).addContractInstance(instance);
      await (this.typedOracle as TXE).addContractArtifact(instance.currentContractClassId, artifact);
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

  async directStorageWrite(
    contractAddress: ForeignCallSingle,
    startStorageSlot: ForeignCallSingle,
    values: ForeignCallArray,
  ) {
    const startStorageSlotFr = fromSingle(startStorageSlot);
    const valuesFr = fromArray(values);
    const contractAddressFr = addressFromSingle(contractAddress);

    const publicDataWrites = await Promise.all(
      valuesFr.map(async (value, i) => {
        const storageSlot = startStorageSlotFr.add(new Fr(i));
        this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
        return new PublicDataWrite(await computePublicDataTreeLeafSlot(contractAddressFr, storageSlot), value);
      }),
    );

    await (this.typedOracle as TXE).addPublicDataWrites(publicDataWrites);

    return toForeignCallResult([toArray(publicDataWrites.map(write => write.value))]);
  }

  async createAccount(secret: ForeignCallSingle) {
    const keyStore = (this.typedOracle as TXE).getKeyStore();
    const secretFr = fromSingle(secret);
    // This is a footgun !
    const completeAddress = await keyStore.addAccount(secretFr, secretFr);
    const accountStore = (this.typedOracle as TXE).getTXEDatabase();
    await accountStore.setAccount(completeAddress.address, completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);
    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  async addAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: ForeignCallSingle) {
    this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    await (this.typedOracle as TXE).addContractInstance(instance);
    await (this.typedOracle as TXE).addContractArtifact(instance.currentContractClassId, artifact);

    const keyStore = (this.typedOracle as TXE).getKeyStore();
    const completeAddress = await keyStore.addAccount(fromSingle(secret), await computePartialAddress(instance));
    const accountStore = (this.typedOracle as TXE).getTXEDatabase();
    await accountStore.setAccount(completeAddress.address, completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);
    return toForeignCallResult([
      toSingle(completeAddress.address),
      ...completeAddress.publicKeys.toFields().map(toSingle),
    ]);
  }

  getSideEffectsCounter() {
    const counter = (this.typedOracle as TXE).getSideEffectsCounter();
    return toForeignCallResult([toSingle(new Fr(counter))]);
  }

  async addAuthWitness(address: ForeignCallSingle, messageHash: ForeignCallSingle) {
    await (this.typedOracle as TXE).addAuthWitness(addressFromSingle(address), fromSingle(messageHash));
    return toForeignCallResult([]);
  }

  async assertPublicCallFails(
    address: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    const parsedAddress = addressFromSingle(address);
    const parsedSelector = fromSingle(functionSelector);
    const extendedArgs = [parsedSelector, ...fromArray(args)];
    const result = await (this.typedOracle as TXE).avmOpcodeCall(parsedAddress, extendedArgs, false);
    if (result.revertCode.isOK()) {
      throw new ExpectedFailureError('Public call did not revert');
    }

    return toForeignCallResult([]);
  }

  async assertPrivateCallFails(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    try {
      await this.typedOracle.callPrivateFunction(
        addressFromSingle(targetContractAddress),
        FunctionSelector.fromField(fromSingle(functionSelector)),
        fromSingle(argsHash),
        fromSingle(sideEffectCounter).toNumber(),
        fromSingle(isStaticCall).toBool(),
      );
      throw new ExpectedFailureError('Private call did not fail');
    } catch (e) {
      if (e instanceof ExpectedFailureError) {
        throw e;
      }
    }
    return toForeignCallResult([]);
  }

  // PXE oracles

  getRandomField() {
    return toForeignCallResult([toSingle(this.typedOracle.getRandomField())]);
  }

  async getContractAddress() {
    const contractAddress = await this.typedOracle.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async getBlockNumber() {
    const blockNumber = await this.typedOracle.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  async storeInExecutionCache(_length: ForeignCallSingle, values: ForeignCallArray) {
    const returnsHash = await this.typedOracle.storeInExecutionCache(fromArray(values));
    return toForeignCallResult([toSingle(returnsHash)]);
  }

  async loadFromExecutionCache(hash: ForeignCallSingle) {
    const returns = await this.typedOracle.loadFromExecutionCache(fromSingle(hash));
    return toForeignCallResult([toArray(returns)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  debugLog(message: ForeignCallArray, _length: ForeignCallSingle, fields: ForeignCallArray) {
    const messageStr = fromArray(message)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fieldsFr = fromArray(fields);
    this.typedOracle.debugLog(messageStr, fieldsFr);
    return toForeignCallResult([]);
  }

  async storageRead(
    contractAddress: ForeignCallSingle,
    startStorageSlot: ForeignCallSingle,
    blockNumber: ForeignCallSingle,
    numberOfElements: ForeignCallSingle,
  ) {
    const values = await this.typedOracle.storageRead(
      addressFromSingle(contractAddress),
      fromSingle(startStorageSlot),
      fromSingle(blockNumber).toNumber(),
      fromSingle(numberOfElements).toNumber(),
    );
    return toForeignCallResult([toArray(values)]);
  }

  async storageWrite(startStorageSlot: ForeignCallSingle, values: ForeignCallArray) {
    const newValues = await this.typedOracle.storageWrite(fromSingle(startStorageSlot), fromArray(values));
    return toForeignCallResult([toArray(newValues)]);
  }

  async getPublicDataTreeWitness(blockNumber: ForeignCallSingle, leafSlot: ForeignCallSingle) {
    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedLeafSlot = fromSingle(leafSlot);

    const witness = await this.typedOracle.getPublicDataTreeWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult([toArray(witness.toFields())]);
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
    returnSize: ForeignCallSingle,
  ) {
    const noteDatas = await this.typedOracle.getNotes(
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
    const noteLength = noteDatas?.[0]?.note.items.length ?? 0;
    if (!noteDatas.every(({ note }) => noteLength === note.items.length)) {
      throw new Error('Notes should all be the same length.');
    }

    const contractAddress = noteDatas[0]?.contractAddress ?? Fr.ZERO;

    // Values indicates whether the note is settled or transient.
    const noteTypes = {
      isSettled: new Fr(0),
      isTransient: new Fr(1),
    };
    const flattenData = noteDatas.flatMap(({ nonce, note, index }) => [
      nonce,
      index === undefined ? noteTypes.isTransient : noteTypes.isSettled,
      ...note.items,
    ]);

    const returnFieldSize = fromSingle(returnSize).toNumber();
    const returnData = [noteDatas.length, contractAddress.toField(), ...flattenData].map(v => new Fr(v));
    if (returnData.length > returnFieldSize) {
      throw new Error(`Return data size too big. Maximum ${returnFieldSize} fields. Got ${flattenData.length}.`);
    }

    const paddedZeros = Array(returnFieldSize - returnData.length).fill(new Fr(0));
    return toForeignCallResult([toArray([...returnData, ...paddedZeros])]);
  }

  notifyCreatedNote(
    storageSlot: ForeignCallSingle,
    noteTypeId: ForeignCallSingle,
    note: ForeignCallArray,
    noteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    this.typedOracle.notifyCreatedNote(
      fromSingle(storageSlot),
      NoteSelector.fromField(fromSingle(noteTypeId)),
      fromArray(note),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([toSingle(new Fr(0))]);
  }

  async notifyNullifiedNote(
    innerNullifier: ForeignCallSingle,
    noteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    await this.typedOracle.notifyNullifiedNote(
      fromSingle(innerNullifier),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([toSingle(new Fr(0))]);
  }

  async notifyCreatedNullifier(innerNullifier: ForeignCallSingle) {
    await this.typedOracle.notifyCreatedNullifier(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(0))]);
  }

  async checkNullifierExists(innerNullifier: ForeignCallSingle) {
    const exists = await this.typedOracle.checkNullifierExists(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async getContractInstance(address: ForeignCallSingle) {
    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
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

  async getPublicKeysAndPartialAddress(address: ForeignCallSingle) {
    const parsedAddress = addressFromSingle(address);
    const { publicKeys, partialAddress } = await this.typedOracle.getCompleteAddress(parsedAddress);
    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async getKeyValidationRequest(pkMHash: ForeignCallSingle) {
    const keyValidationRequest = await this.typedOracle.getKeyValidationRequest(fromSingle(pkMHash));
    return toForeignCallResult([toArray(keyValidationRequest.toFields())]);
  }

  async callPrivateFunction(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    const result = await this.typedOracle.callPrivateFunction(
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromSingle(argsHash),
      fromSingle(sideEffectCounter).toNumber(),
      fromSingle(isStaticCall).toBool(),
    );
    return toForeignCallResult([toArray([result.endSideEffectCounter, result.returnsHash])]);
  }

  async getNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const witness = await this.typedOracle.getNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult([toArray(witness.toFields())]);
  }

  async getAuthWitness(messageHash: ForeignCallSingle) {
    const parsedMessageHash = fromSingle(messageHash);
    const authWitness = await this.typedOracle.getAuthWitness(parsedMessageHash);
    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${parsedMessageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  async enqueuePublicFunctionCall(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    const newArgsHash = await this.typedOracle.enqueuePublicFunctionCall(
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromSingle(argsHash),
      fromSingle(sideEffectCounter).toNumber(),
      fromSingle(isStaticCall).toBool(),
    );
    return toForeignCallResult([toSingle(newArgsHash)]);
  }

  public async setPublicTeardownFunctionCall(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    const newArgsHash = await this.typedOracle.setPublicTeardownFunctionCall(
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromSingle(argsHash),
      fromSingle(sideEffectCounter).toNumber(),
      fromSingle(isStaticCall).toBool(),
    );
    return toForeignCallResult([toSingle(newArgsHash)]);
  }

  public notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: ForeignCallSingle) {
    this.typedOracle.notifySetMinRevertibleSideEffectCounter(fromSingle(minRevertibleSideEffectCounter).toNumber());
  }

  async getChainId() {
    return toForeignCallResult([toSingle(await this.typedOracle.getChainId())]);
  }

  async getVersion() {
    return toForeignCallResult([toSingle(await this.typedOracle.getVersion())]);
  }

  async getBlockHeader(blockNumber: ForeignCallSingle) {
    const header = await this.typedOracle.getBlockHeader(fromSingle(blockNumber).toNumber());
    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult([toArray(header.toFields())]);
  }

  async getMembershipWitness(blockNumber: ForeignCallSingle, treeId: ForeignCallSingle, leafValue: ForeignCallSingle) {
    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedTreeId = fromSingle(treeId).toNumber();
    const parsedLeafValue = fromSingle(leafValue);
    const witness = await this.typedOracle.getMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
    if (!witness) {
      throw new Error(
        `Membership witness in tree ${MerkleTreeId[parsedTreeId]} not found for value ${parsedLeafValue} at block ${parsedBlockNumber}.`,
      );
    }
    return toForeignCallResult([toArray(witness)]);
  }

  async getLowNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    const parsedBlockNumber = fromSingle(blockNumber).toNumber();

    const witness = await this.typedOracle.getLowNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult([toArray(witness.toFields())]);
  }

  async getIndexedTaggingSecretAsSender(sender: ForeignCallSingle, recipient: ForeignCallSingle) {
    const secret = await this.typedOracle.getIndexedTaggingSecretAsSender(
      AztecAddress.fromField(fromSingle(sender)),
      AztecAddress.fromField(fromSingle(recipient)),
    );
    return toForeignCallResult([toArray(secret.toFields())]);
  }

  async syncNotes() {
    await this.typedOracle.syncNotes();
    return toForeignCallResult([]);
  }

  async storeCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, capsule: ForeignCallArray) {
    await this.typedOracle.storeCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(slot),
      fromArray(capsule),
    );
    return toForeignCallResult([]);
  }

  async loadCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, tSize: ForeignCallSingle) {
    const values = await this.typedOracle.loadCapsule(
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

  async deleteCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle) {
    await this.typedOracle.deleteCapsule(AztecAddress.fromField(fromSingle(contractAddress)), fromSingle(slot));
    return toForeignCallResult([]);
  }

  async copyCapsule(
    contractAddress: ForeignCallSingle,
    srcSlot: ForeignCallSingle,
    dstSlot: ForeignCallSingle,
    numEntries: ForeignCallSingle,
  ) {
    await this.typedOracle.copyCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(srcSlot),
      fromSingle(dstSlot),
      fromSingle(numEntries).toNumber(),
    );

    return toForeignCallResult([]);
  }

  // TODO: I forgot to add a corresponding function here, when I introduced an oracle method to txe_oracle.ts. The compiler didn't throw an error, so it took me a while to learn of the existence of this file, and that I need to implement this function here. Isn't there a way to programmatically identify that this is missing, given the existence of a txe_oracle method?
  async aes128Decrypt(ciphertext: ForeignCallArray, iv: ForeignCallArray, symKey: ForeignCallArray) {
    const ciphertextBuffer = fromUintArray(ciphertext, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const paddedPlaintext = await this.typedOracle.aes128Decrypt(ciphertextBuffer, ivBuffer, symKeyBuffer);

    // We convert each byte of the buffer to its own Field, so that the Noir
    // function correctly receives [u8; N].
    return toForeignCallResult([toArray(Array.from(paddedPlaintext).map(byte => new Fr(byte)))]);
  }

  // AVM opcodes

  avmOpcodeEmitUnencryptedLog(_message: ForeignCallArray) {
    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  async avmOpcodeStorageRead(slot: ForeignCallSingle) {
    const value = await (this.typedOracle as TXE).avmOpcodeStorageRead(fromSingle(slot));
    return toForeignCallResult([toSingle(value)]);
  }

  async avmOpcodeStorageWrite(slot: ForeignCallSingle, value: ForeignCallSingle) {
    await this.typedOracle.storageWrite(fromSingle(slot), [fromSingle(value)]);
    return toForeignCallResult([]);
  }

  async avmOpcodeGetContractInstanceDeployer(address: ForeignCallSingle) {
    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceClassId(address: ForeignCallSingle) {
    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceInitializationHash(address: ForeignCallSingle) {
    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.initializationHash),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  avmOpcodeSender() {
    const sender = (this.typedOracle as TXE).getMsgSender();
    return toForeignCallResult([toSingle(sender)]);
  }

  async avmOpcodeEmitNullifier(nullifier: ForeignCallSingle) {
    await (this.typedOracle as TXE).avmOpcodeEmitNullifier(fromSingle(nullifier));
    return toForeignCallResult([]);
  }

  async avmOpcodeEmitNoteHash(noteHash: ForeignCallSingle) {
    await (this.typedOracle as TXE).avmOpcodeEmitNoteHash(fromSingle(noteHash));
    return toForeignCallResult([]);
  }

  async avmOpcodeNullifierExists(innerNullifier: ForeignCallSingle, targetAddress: ForeignCallSingle) {
    const exists = await (this.typedOracle as TXE).avmOpcodeNullifierExists(
      fromSingle(innerNullifier),
      AztecAddress.fromField(fromSingle(targetAddress)),
    );
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async avmOpcodeAddress() {
    const contractAddress = await this.typedOracle.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async avmOpcodeBlockNumber() {
    const blockNumber = await this.typedOracle.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  avmOpcodeIsStaticCall() {
    const isStaticCall = (this.typedOracle as TXE).getIsStaticCall();
    return toForeignCallResult([toSingle(new Fr(isStaticCall ? 1 : 0))]);
  }

  async avmOpcodeChainId() {
    const chainId = await (this.typedOracle as TXE).getChainId();
    return toForeignCallResult([toSingle(chainId)]);
  }

  async avmOpcodeVersion() {
    const version = await (this.typedOracle as TXE).getVersion();
    return toForeignCallResult([toSingle(version)]);
  }

  avmOpcodeReturndataSize() {
    const size = (this.typedOracle as TXE).avmOpcodeReturndataSize();
    return toForeignCallResult([toSingle(new Fr(size))]);
  }

  avmOpcodeReturndataCopy(rdOffset: ForeignCallSingle, copySize: ForeignCallSingle) {
    const returndata = (this.typedOracle as TXE).avmOpcodeReturndataCopy(
      fromSingle(rdOffset).toNumber(),
      fromSingle(copySize).toNumber(),
    );
    // This is a slice, so we need to return the length as well.
    return toForeignCallResult([toSingle(new Fr(returndata.length)), toArray(returndata)]);
  }

  async avmOpcodeCall(
    _gas: ForeignCallArray,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    const result = await (this.typedOracle as TXE).avmOpcodeCall(
      addressFromSingle(address),
      fromArray(args),
      /* isStaticCall */ false,
    );

    // Poor man's revert handling
    if (!result.revertCode.isOK()) {
      if (result.revertReason && result.revertReason instanceof SimulationError) {
        await enrichPublicSimulationError(
          result.revertReason,
          (this.typedOracle as TXE).getContractDataOracle(),
          (this.typedOracle as TXE).getTXEDatabase(),
          this.logger,
        );
        throw new Error(result.revertReason.message);
      } else {
        throw new Error(`Public function call reverted: ${result.revertReason}`);
      }
    }

    return toForeignCallResult([toSingle(new Fr(result.revertCode.isOK()))]);
  }

  async avmOpcodeStaticCall(
    _gas: ForeignCallArray,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    const result = await (this.typedOracle as TXE).avmOpcodeCall(
      addressFromSingle(address),
      fromArray(args),
      /* isStaticCall */ true,
    );

    // Poor man's revert handling
    if (!result.revertCode.isOK()) {
      if (result.revertReason && result.revertReason instanceof SimulationError) {
        await enrichPublicSimulationError(
          result.revertReason,
          (this.typedOracle as TXE).getContractDataOracle(),
          (this.typedOracle as TXE).getTXEDatabase(),
          this.logger,
        );
        throw new Error(result.revertReason.message);
      } else {
        throw new Error(`Public function call reverted: ${result.revertReason}`);
      }
    }

    return toForeignCallResult([toSingle(new Fr(result.revertCode.isOK()))]);
  }
}
