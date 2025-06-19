import { type ContractInstanceWithAddress, Fr, Point } from '@aztec/aztec.js';
import { DEPLOYER_CONTRACT_ADDRESS } from '@aztec/constants';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { enrichPublicSimulationError } from '@aztec/pxe/server';
import type { TypedOracle } from '@aztec/pxe/simulator';
import { type ContractArtifact, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePartialAddress } from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import { PrivateLogWithTxData, PublicLogWithTxData } from '@aztec/stdlib/logs';
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
  toSingleOrArray,
} from '../util/encoding.js';
import { ExpectedFailureError } from '../util/expected_failure_error.js';

export class TXEService {
  public oraclesEnabled = true;

  constructor(
    private logger: Logger,
    private typedOracle: TypedOracle,
  ) {}

  static async init(logger: Logger, protocolContracts: ProtocolContract[]) {
    logger.debug(`TXE service initialized`);
    const store = await openTmpStore('test');
    const txe = await TXE.create(logger, store, protocolContracts);
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
    await (this.typedOracle as TXE).noteCache.nullifierCreated(
      AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
      instance.address.toField(),
    );

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
    const accountDataProvider = (this.typedOracle as TXE).getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = (this.typedOracle as TXE).getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
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
    const accountDataProvider = (this.typedOracle as TXE).getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = (this.typedOracle as TXE).getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(this.typedOracle.getRandomField())]);
  }

  async getContractAddress() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const contractAddress = await this.typedOracle.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async getBlockNumber() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const blockNumber = await this.typedOracle.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  storeInExecutionCache(_length: ForeignCallSingle, values: ForeignCallArray, hash: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    this.typedOracle.storeInExecutionCache(fromArray(values), fromSingle(hash));
    return toForeignCallResult([]);
  }

  async loadFromExecutionCache(hash: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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

  async getPublicDataWitness(blockNumber: ForeignCallSingle, leafSlot: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedLeafSlot = fromSingle(leafSlot);

    const witness = await this.typedOracle.getPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    this.typedOracle.notifyCreatedNote(
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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.notifyNullifiedNote(
      fromSingle(innerNullifier),
      fromSingle(noteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async notifyCreatedNullifier(innerNullifier: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.notifyCreatedNullifier(fromSingle(innerNullifier));
    return toForeignCallResult([]);
  }

  async checkNullifierExists(innerNullifier: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const exists = await this.typedOracle.checkNullifierExists(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async getContractInstance(address: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedAddress = addressFromSingle(address);
    const { publicKeys, partialAddress } = await this.typedOracle.getCompleteAddress(parsedAddress);
    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async getKeyValidationRequest(pkMHash: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const keyValidationRequest = await this.typedOracle.getKeyValidationRequest(fromSingle(pkMHash));
    return toForeignCallResult(keyValidationRequest.toFields().map(toSingle));
  }

  async callPrivateFunction(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const witness = await this.typedOracle.getNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Nullifier membership witness not found at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async getAuthWitness(messageHash: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedMessageHash = fromSingle(messageHash);
    const authWitness = await this.typedOracle.getAuthWitness(parsedMessageHash);
    if (!authWitness) {
      throw new Error(`Auth witness not found for message hash ${parsedMessageHash}.`);
    }
    return toForeignCallResult([toArray(authWitness)]);
  }

  public async notifyEnqueuedPublicFunctionCall(
    targetContractAddress: ForeignCallSingle,
    calldataHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.notifyEnqueuedPublicFunctionCall(
      addressFromSingle(targetContractAddress),
      fromSingle(calldataHash),
      fromSingle(sideEffectCounter).toNumber(),
      fromSingle(isStaticCall).toBool(),
    );
    return toForeignCallResult([]);
  }

  public async notifySetPublicTeardownFunctionCall(
    targetContractAddress: ForeignCallSingle,
    calldataHash: ForeignCallSingle,
    sideEffectCounter: ForeignCallSingle,
    isStaticCall: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.notifySetPublicTeardownFunctionCall(
      addressFromSingle(targetContractAddress),
      fromSingle(calldataHash),
      fromSingle(sideEffectCounter).toNumber(),
      fromSingle(isStaticCall).toBool(),
    );
    return toForeignCallResult([]);
  }

  public async notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.notifySetMinRevertibleSideEffectCounter(
      fromSingle(minRevertibleSideEffectCounter).toNumber(),
    );
    return toForeignCallResult([]);
  }

  async getChainId() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.typedOracle.getChainId())]);
  }

  async getVersion() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    return toForeignCallResult([toSingle(await this.typedOracle.getVersion())]);
  }

  async getBlockHeader(blockNumber: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const header = await this.typedOracle.getBlockHeader(fromSingle(blockNumber).toNumber());
    if (!header) {
      throw new Error(`Block header not found for block ${blockNumber}.`);
    }
    return toForeignCallResult(header.toFields().map(toSingle));
  }

  async getMembershipWitness(blockNumber: ForeignCallSingle, treeId: ForeignCallSingle, leafValue: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedTreeId = fromSingle(treeId).toNumber();
    const parsedLeafValue = fromSingle(leafValue);
    const witness = await this.typedOracle.getMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
    if (!witness) {
      throw new Error(
        `Membership witness in tree ${MerkleTreeId[parsedTreeId]} not found for value ${parsedLeafValue} at block ${parsedBlockNumber}.`,
      );
    }
    return toForeignCallResult([toSingle(witness[0]), toArray(witness.slice(1))]);
  }

  async getLowNullifierMembershipWitness(blockNumber: ForeignCallSingle, nullifier: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const parsedBlockNumber = fromSingle(blockNumber).toNumber();

    const witness = await this.typedOracle.getLowNullifierMembershipWitness(parsedBlockNumber, fromSingle(nullifier));
    if (!witness) {
      throw new Error(`Low nullifier witness not found for nullifier ${nullifier} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult(witness.toNoirRepresentation());
  }

  async getIndexedTaggingSecretAsSender(sender: ForeignCallSingle, recipient: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const secret = await this.typedOracle.getIndexedTaggingSecretAsSender(
      AztecAddress.fromField(fromSingle(sender)),
      AztecAddress.fromField(fromSingle(recipient)),
    );
    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.fetchTaggedLogs(fromSingle(pendingTaggedLogArrayBaseSlot));
    return toForeignCallResult([]);
  }

  public async validateEnqueuedNotesAndEvents(
    contractAddress: ForeignCallSingle,
    noteValidationRequestsArrayBaseSlot: ForeignCallSingle,
    eventValidationRequestsArrayBaseSlot: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.validateEnqueuedNotesAndEvents(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(noteValidationRequestsArrayBaseSlot),
      fromSingle(eventValidationRequestsArrayBaseSlot),
    );

    return toForeignCallResult([]);
  }

  async getPublicLogByTag(tag: ForeignCallSingle, contractAddress: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    // TODO(AD): this was warning that getPublicLogByTag did not return a promise.
    const log = await Promise.resolve(
      this.typedOracle.getPublicLogByTag(fromSingle(tag), AztecAddress.fromField(fromSingle(contractAddress))),
    );

    if (log == null) {
      return toForeignCallResult([
        toSingle(Fr.ZERO),
        ...PublicLogWithTxData.noirSerializationOfEmpty().map(toSingleOrArray),
      ]);
    } else {
      return toForeignCallResult([toSingle(Fr.ONE), ...log.toNoirSerialization().map(toSingleOrArray)]);
    }
  }

  async getPrivateLogByTag(siloedTag: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const log = await this.typedOracle.getPrivateLogByTag(fromSingle(siloedTag));
    if (log == null) {
      return toForeignCallResult([
        toSingle(Fr.ZERO),
        ...PrivateLogWithTxData.noirSerializationOfEmpty().map(toSingleOrArray),
      ]);
    } else {
      return toForeignCallResult([toSingle(Fr.ONE), ...log.toNoirSerialization().map(toSingleOrArray)]);
    }
  }

  async storeCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, capsule: ForeignCallArray) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.storeCapsule(
      AztecAddress.fromField(fromSingle(contractAddress)),
      fromSingle(slot),
      fromArray(capsule),
    );
    return toForeignCallResult([]);
  }

  async loadCapsule(contractAddress: ForeignCallSingle, slot: ForeignCallSingle, tSize: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.deleteCapsule(AztecAddress.fromField(fromSingle(contractAddress)), fromSingle(slot));
    return toForeignCallResult([]);
  }

  async copyCapsule(
    contractAddress: ForeignCallSingle,
    srcSlot: ForeignCallSingle,
    dstSlot: ForeignCallSingle,
    numEntries: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.copyCapsule(
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
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const plaintextBuffer = await this.typedOracle.aes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);

    return toForeignCallResult(arrayToBoundedVec(bufferToU8Array(plaintextBuffer), ciphertextBVecStorage.length));
  }

  async getSharedSecret(
    address: ForeignCallSingle,
    ephPKField0: ForeignCallSingle,
    ephPKField1: ForeignCallSingle,
    ephPKField2: ForeignCallSingle,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const secret = await this.typedOracle.getSharedSecret(
      AztecAddress.fromField(fromSingle(address)),
      Point.fromFields([fromSingle(ephPKField0), fromSingle(ephPKField1), fromSingle(ephPKField2)]),
    );
    return toForeignCallResult(secret.toFields().map(toSingle));
  }

  emitOffchainEffect(_data: ForeignCallArray) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    // Offchain messages are currently discarded in the TXE tests.
    // TODO: Expose this to the tests.

    return toForeignCallResult([]);
  }

  // AVM opcodes

  avmOpcodeEmitUnencryptedLog(_message: ForeignCallArray) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    // TODO(#8811): Implement
    return toForeignCallResult([]);
  }

  async avmOpcodeStorageRead(slot: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const value = (await (this.typedOracle as TXE).avmOpcodeStorageRead(fromSingle(slot))).value;
    return toForeignCallResult([toSingle(new Fr(value))]);
  }

  async avmOpcodeStorageWrite(slot: ForeignCallSingle, value: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await this.typedOracle.storageWrite(fromSingle(slot), [fromSingle(value)]);
    return toForeignCallResult([]);
  }

  async avmOpcodeGetContractInstanceDeployer(address: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.deployer),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceClassId(address: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.currentContractClassId),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  async avmOpcodeGetContractInstanceInitializationHash(address: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const instance = await this.typedOracle.getContractInstance(addressFromSingle(address));
    return toForeignCallResult([
      toSingle(instance.initializationHash),
      // AVM requires an extra boolean indicating the instance was found
      toSingle(new Fr(1)),
    ]);
  }

  avmOpcodeSender() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const sender = (this.typedOracle as TXE).getMsgSender();
    return toForeignCallResult([toSingle(sender)]);
  }

  async avmOpcodeEmitNullifier(nullifier: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await (this.typedOracle as TXE).avmOpcodeEmitNullifier(fromSingle(nullifier));
    return toForeignCallResult([]);
  }

  async avmOpcodeEmitNoteHash(noteHash: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    await (this.typedOracle as TXE).avmOpcodeEmitNoteHash(fromSingle(noteHash));
    return toForeignCallResult([]);
  }

  async avmOpcodeNullifierExists(innerNullifier: ForeignCallSingle, targetAddress: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const exists = await (this.typedOracle as TXE).avmOpcodeNullifierExists(
      fromSingle(innerNullifier),
      AztecAddress.fromField(fromSingle(targetAddress)),
    );
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async avmOpcodeAddress() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const contractAddress = await this.typedOracle.getContractAddress();
    return toForeignCallResult([toSingle(contractAddress.toField())]);
  }

  async avmOpcodeBlockNumber() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const blockNumber = await this.typedOracle.getBlockNumber();
    return toForeignCallResult([toSingle(new Fr(blockNumber))]);
  }

  avmOpcodeIsStaticCall() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const isStaticCall = (this.typedOracle as TXE).getIsStaticCall();
    return toForeignCallResult([toSingle(new Fr(isStaticCall ? 1 : 0))]);
  }

  async avmOpcodeChainId() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const chainId = await (this.typedOracle as TXE).getChainId();
    return toForeignCallResult([toSingle(chainId)]);
  }

  async avmOpcodeVersion() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const version = await (this.typedOracle as TXE).getVersion();
    return toForeignCallResult([toSingle(version)]);
  }

  avmOpcodeReturndataSize() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const size = (this.typedOracle as TXE).avmOpcodeReturndataSize();
    return toForeignCallResult([toSingle(new Fr(size))]);
  }

  avmOpcodeReturndataCopy(rdOffset: ForeignCallSingle, copySize: ForeignCallSingle) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const returndata = (this.typedOracle as TXE).avmOpcodeReturndataCopy(
      fromSingle(rdOffset).toNumber(),
      fromSingle(copySize).toNumber(),
    );
    // This is a slice, so we need to return the length as well.
    return toForeignCallResult([toSingle(new Fr(returndata.length)), toArray(returndata)]);
  }

  async avmOpcodeCall(
    _l2Gas: ForeignCallSingle,
    _daGas: ForeignCallSingle,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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
          (this.typedOracle as TXE).getContractDataProvider(),
          this.logger,
        );
        throw new Error(result.revertReason.message);
      } else {
        throw new Error(`Public function call reverted: ${result.revertReason}`);
      }
    }

    return toForeignCallResult([]);
  }

  async avmOpcodeStaticCall(
    _l2Gas: ForeignCallSingle,
    _daGas: ForeignCallSingle,
    address: ForeignCallSingle,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

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
          (this.typedOracle as TXE).getContractDataProvider(),
          this.logger,
        );
        throw new Error(result.revertReason.message);
      } else {
        throw new Error(`Public function call reverted: ${result.revertReason}`);
      }
    }

    return toForeignCallResult([]);
  }

  avmOpcodeSuccessCopy() {
    if (!this.oraclesEnabled) {
      throw new Error(
        'Oracle access from the root of a TXe test are not enabled. Please use env._ to interact with the oracles.',
      );
    }

    const success = (this.typedOracle as TXE).avmOpcodeSuccessCopy();
    return toForeignCallResult([toSingle(new Fr(success))]);
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
    const result = await (this.typedOracle as TXE).privateCallNewFlow(
      addressFromSingle(from),
      addressFromSingle(targetContractAddress),
      FunctionSelector.fromField(fromSingle(functionSelector)),
      fromArray(args),
      fromSingle(argsHash),
      fromSingle(isStaticCall).toBool(),
    );

    return toForeignCallResult([toArray([result.endSideEffectCounter, result.returnsHash, result.txHash])]);
  }

  disableOracles() {
    this.oraclesEnabled = false;
  }

  enableOracles() {
    this.oraclesEnabled = true;
  }

  async simulateUtilityFunction(
    targetContractAddress: ForeignCallSingle,
    functionSelector: ForeignCallSingle,
    argsHash: ForeignCallSingle,
  ) {
    const result = await (this.typedOracle as TXE).simulateUtilityFunction(
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
    const result = await (this.typedOracle as TXE).publicCallNewFlow(
      addressFromSingle(from),
      addressFromSingle(address),
      fromArray(calldata),
      fromSingle(isStaticCall).toBool(),
    );

    return toForeignCallResult([toArray([result.returnsHash, result.txHash])]);
  }
}
