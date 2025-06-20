import { Fr, Point } from '@aztec/foundation/fields';
import {
  type ACIRCallback,
  type ACVMField,
  arrayOfArraysToBoundedVecOfArrays,
  bufferToBoundedVec,
  fromUintArray,
  fromUintBoundedVec,
  toACVMField,
} from '@aztec/simulator/client';
import { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractClassLog, ContractClassLogFields } from '@aztec/stdlib/logs';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { TypedOracle } from './typed_oracle.js';

/**
 * A data source that has all the apis required by Aztec.nr.
 */
export class Oracle {
  private typedOracle: TypedOracle;

  constructor(typedOracle: TypedOracle) {
    this.typedOracle = typedOracle;
  }

  toACIRCallback(): ACIRCallback {
    return Object.getOwnPropertyNames(Oracle.prototype)
      .filter(
        name => name !== 'constructor' && name != 'toACIRCallback' && typeof this[name as keyof Oracle] === 'function',
      )
      .reduce((acc, name) => {
        acc[name] = this[name as keyof Omit<Oracle, 'toACIRCallback' | 'typedOracle' | 'constructor'>].bind(this);
        return acc;
      }, {} as ACIRCallback);
  }

  getRandomField(): Promise<ACVMField[]> {
    const val = this.typedOracle.getRandomField();
    return Promise.resolve([toACVMField(val)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  storeInExecutionCache(_length: ACVMField[], values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
    this.typedOracle.storeInExecutionCache(values.map(Fr.fromString), Fr.fromString(hash));
    return Promise.resolve([]);
  }

  async loadFromExecutionCache([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
    const values = await this.typedOracle.loadFromExecutionCache(Fr.fromString(returnsHash));
    return [values.map(toACVMField)];
  }

  async getBlockNumber(): Promise<ACVMField[]> {
    return [toACVMField(await this.typedOracle.getBlockNumber())];
  }

  async getContractAddress(): Promise<ACVMField[]> {
    return [toACVMField(await this.typedOracle.getContractAddress())];
  }

  async getVersion(): Promise<ACVMField[]> {
    return [toACVMField(await this.typedOracle.getVersion())];
  }

  async getChainId(): Promise<ACVMField[]> {
    return [toACVMField(await this.typedOracle.getChainId())];
  }

  async getKeyValidationRequest([pkMHash]: ACVMField[]): Promise<ACVMField[]> {
    const keyValidationRequest = await this.typedOracle.getKeyValidationRequest(Fr.fromString(pkMHash));

    return keyValidationRequest.toFields().map(toACVMField);
  }

  async getContractInstance([address]: ACVMField[]): Promise<ACVMField[]> {
    const instance = await this.typedOracle.getContractInstance(AztecAddress.fromField(Fr.fromString(address)));

    return [
      instance.salt,
      instance.deployer,
      instance.currentContractClassId,
      instance.initializationHash,
      ...instance.publicKeys.toFields(),
    ].map(toACVMField);
  }

  async getMembershipWitness(
    [blockNumber]: ACVMField[],
    [treeId]: ACVMField[],
    [leafValue]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedTreeId = Fr.fromString(treeId).toNumber();
    const parsedLeafValue = Fr.fromString(leafValue);

    const witness = await this.typedOracle.getMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
    if (!witness) {
      throw new Error(
        `Leaf ${leafValue} not found in the tree ${MerkleTreeId[parsedTreeId]} at block ${parsedBlockNumber}.`,
      );
    }
    return [toACVMField(witness[0]), witness.slice(1).map(toACVMField)];
  }

  async getNullifierMembershipWitness(
    [blockNumber]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the witness for (to prove inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.typedOracle.getNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
    if (!witness) {
      throw new Error(`Nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`);
    }
    return witness.toNoirRepresentation();
  }

  async getLowNullifierMembershipWitness(
    [blockNumber]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the low nullifier witness for (to prove non-inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.typedOracle.getLowNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
    if (!witness) {
      throw new Error(
        `Low nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  async getPublicDataWitness(
    [blockNumber]: ACVMField[],
    [leafSlot]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedLeafSlot = Fr.fromString(leafSlot);

    const witness = await this.typedOracle.getPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return witness.toNoirRepresentation();
  }

  async getBlockHeader([blockNumber]: ACVMField[]): Promise<ACVMField[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();

    const header = await this.typedOracle.getBlockHeader(parsedBlockNumber);
    if (!header) {
      throw new Error(`Block header not found for block ${parsedBlockNumber}.`);
    }
    return header.toFields().map(toACVMField);
  }

  async getAuthWitness([messageHash]: ACVMField[]): Promise<ACVMField[][]> {
    const messageHashField = Fr.fromString(messageHash);
    const witness = await this.typedOracle.getAuthWitness(messageHashField);
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHashField}`);
    }
    return [witness.map(toACVMField)];
  }

  async getPublicKeysAndPartialAddress([address]: ACVMField[]): Promise<ACVMField[][]> {
    const parsedAddress = AztecAddress.fromField(Fr.fromString(address));
    const { publicKeys, partialAddress } = await this.typedOracle.getCompleteAddress(parsedAddress);

    return [[...publicKeys.toFields(), partialAddress].map(toACVMField)];
  }

  async getNotes(
    [storageSlot]: ACVMField[],
    [numSelects]: ACVMField[],
    selectByIndexes: ACVMField[],
    selectByOffsets: ACVMField[],
    selectByLengths: ACVMField[],
    selectValues: ACVMField[],
    selectComparators: ACVMField[],
    sortByIndexes: ACVMField[],
    sortByOffsets: ACVMField[],
    sortByLengths: ACVMField[],
    sortOrder: ACVMField[],
    [limit]: ACVMField[],
    [offset]: ACVMField[],
    [status]: ACVMField[],
    [maxNotes]: ACVMField[],
    [packedRetrievedNoteLength]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const noteDatas = await this.typedOracle.getNotes(
      Fr.fromString(storageSlot),
      +numSelects,
      selectByIndexes.map(s => +s),
      selectByOffsets.map(s => +s),
      selectByLengths.map(s => +s),
      selectValues.map(Fr.fromString),
      selectComparators.map(s => +s),
      sortByIndexes.map(s => +s),
      sortByOffsets.map(s => +s),
      sortByLengths.map(s => +s),
      sortOrder.map(s => +s),
      +limit,
      +offset,
      +status,
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

    // Now we convert each sub-array to an array of ACVMField
    const returnDataAsArrayOfACVMFieldArrays = returnDataAsArrayOfArrays.map(subArray => subArray.map(toACVMField));

    // At last we convert the array of arrays to a bounded vec of arrays
    return arrayOfArraysToBoundedVecOfArrays(returnDataAsArrayOfACVMFieldArrays, +maxNotes, +packedRetrievedNoteLength);
  }

  notifyCreatedNote(
    [storageSlot]: ACVMField[],
    [noteTypeId]: ACVMField[],
    note: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    this.typedOracle.notifyCreatedNote(
      Fr.fromString(storageSlot),
      NoteSelector.fromField(Fr.fromString(noteTypeId)),
      note.map(Fr.fromString),
      Fr.fromString(noteHash),
      +counter,
    );
    return Promise.resolve([]);
  }

  async notifyNullifiedNote(
    [innerNullifier]: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.notifyNullifiedNote(Fr.fromString(innerNullifier), Fr.fromString(noteHash), +counter);
    return [];
  }

  async notifyCreatedNullifier([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.notifyCreatedNullifier(Fr.fromString(innerNullifier));
    return [];
  }

  async checkNullifierExists([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    const exists = await this.typedOracle.checkNullifierExists(Fr.fromString(innerNullifier));
    return [toACVMField(exists)];
  }

  async getL1ToL2MembershipWitness(
    [contractAddress]: ACVMField[],
    [messageHash]: ACVMField[],
    [secret]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const message = await this.typedOracle.getL1ToL2MembershipWitness(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(messageHash),
      Fr.fromString(secret),
    );
    return message.toNoirRepresentation();
  }

  async storageRead(
    [contractAddress]: ACVMField[],
    [startStorageSlot]: ACVMField[],
    [blockNumber]: ACVMField[],
    [numberOfElements]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const values = await this.typedOracle.storageRead(
      new AztecAddress(Fr.fromString(contractAddress)),
      Fr.fromString(startStorageSlot),
      +blockNumber,
      +numberOfElements,
    );
    return [values.map(toACVMField)];
  }

  async storageWrite([startStorageSlot]: ACVMField[], values: ACVMField[]): Promise<ACVMField[]> {
    const newValues = await this.typedOracle.storageWrite(Fr.fromString(startStorageSlot), values.map(Fr.fromString));
    return newValues.map(toACVMField);
  }

  notifyCreatedContractClassLog(
    [contractAddress]: ACVMField[],
    message: ACVMField[],
    [length]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    const logFields = new ContractClassLogFields(message.map(Fr.fromString));
    const log = new ContractClassLog(new AztecAddress(Fr.fromString(contractAddress)), logFields, +length);

    this.typedOracle.notifyCreatedContractClassLog(log, +counter);
    return Promise.resolve([]);
  }

  debugLog(message: ACVMField[], _ignoredFieldsSize: ACVMField[], fields: ACVMField[]): Promise<ACVMField[]> {
    const messageStr = message.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
    const fieldsFr = fields.map(Fr.fromString);
    this.typedOracle.debugLog(messageStr, fieldsFr);
    return Promise.resolve([]);
  }

  async callPrivateFunction(
    [contractAddress]: ACVMField[],
    [functionSelector]: ACVMField[],
    [argsHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const { endSideEffectCounter, returnsHash } = await this.typedOracle.callPrivateFunction(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      FunctionSelector.fromField(Fr.fromString(functionSelector)),
      Fr.fromString(argsHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [[endSideEffectCounter, returnsHash].map(toACVMField)];
  }

  async notifyEnqueuedPublicFunctionCall(
    [contractAddress]: ACVMField[],
    [calldataHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.notifyEnqueuedPublicFunctionCall(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(calldataHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [];
  }

  async notifySetPublicTeardownFunctionCall(
    [contractAddress]: ACVMField[],
    [calldataHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.notifySetPublicTeardownFunctionCall(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(calldataHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [];
  }

  async notifySetMinRevertibleSideEffectCounter([minRevertibleSideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.notifySetMinRevertibleSideEffectCounter(
      Fr.fromString(minRevertibleSideEffectCounter).toNumber(),
    );
    return Promise.resolve([]);
  }

  async getIndexedTaggingSecretAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
    const taggingSecret = await this.typedOracle.getIndexedTaggingSecretAsSender(
      AztecAddress.fromString(sender),
      AztecAddress.fromString(recipient),
    );
    return taggingSecret.toFields().map(toACVMField);
  }

  async incrementAppTaggingSecretIndexAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.incrementAppTaggingSecretIndexAsSender(
      AztecAddress.fromString(sender),
      AztecAddress.fromString(recipient),
    );
    return [];
  }

  async fetchTaggedLogs([pendingTaggedLogArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.fetchTaggedLogs(Fr.fromString(pendingTaggedLogArrayBaseSlot));
    return [];
  }

  async validateEnqueuedNotesAndEvents(
    [contractAddress]: ACVMField[],
    [noteValidationRequestsArrayBaseSlot]: ACVMField[],
    [eventValidationRequestsArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.validateEnqueuedNotesAndEvents(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(noteValidationRequestsArrayBaseSlot),
      Fr.fromString(eventValidationRequestsArrayBaseSlot),
    );

    return [];
  }

  async bulkRetrieveLogs(
    [contractAddress]: ACVMField[],
    [logRetrievalRequestsArrayBaseSlot]: ACVMField[],
    [logRetrievalResponsesArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.bulkRetrieveLogs(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(logRetrievalRequestsArrayBaseSlot),
      Fr.fromString(logRetrievalResponsesArrayBaseSlot),
    );
    return [];
  }

  async storeCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[], capsule: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.storeCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      capsule.map(Fr.fromString),
    );
    return [];
  }

  async loadCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    [tSize]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const values = await this.typedOracle.loadCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
    );

    // We are going to return a Noir Option struct to represent the possibility of null values. Options are a struct
    // with two fields: `some` (a boolean) and `value` (a field array in this case).
    if (values === null) {
      // No data was found so we set `some` to 0 and pad `value` with zeros get the correct return size.
      return [toACVMField(0), Array(Fr.fromString(tSize).toNumber()).fill(toACVMField(0))];
    } else {
      // Data was found so we set `some` to 1 and return it along with `value`.
      return [toACVMField(1), values.map(toACVMField)];
    }
  }

  async deleteCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[]): Promise<ACVMField[]> {
    await this.typedOracle.deleteCapsule(AztecAddress.fromField(Fr.fromString(contractAddress)), Fr.fromString(slot));
    return [];
  }

  async copyCapsule(
    [contractAddress]: ACVMField[],
    [srcSlot]: ACVMField[],
    [dstSlot]: ACVMField[],
    [numEntries]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.typedOracle.copyCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(srcSlot),
      Fr.fromString(dstSlot),
      Fr.fromString(numEntries).toNumber(),
    );
    return [];
  }

  async aes128Decrypt(
    ciphertextBVecStorage: ACVMField[],
    [ciphertextLength]: ACVMField[],
    iv: ACVMField[],
    symKey: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const plaintext = await this.typedOracle.aes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);
    return bufferToBoundedVec(plaintext, ciphertextBVecStorage.length);
  }

  async getSharedSecret(
    [address]: ACVMField[],
    [ephPKField0]: ACVMField[],
    [ephPKField1]: ACVMField[],
    [ephPKField2]: ACVMField[],
  ): Promise<ACVMField[]> {
    const secret = await this.typedOracle.getSharedSecret(
      AztecAddress.fromField(Fr.fromString(address)),
      Point.fromFields([ephPKField0, ephPKField1, ephPKField2].map(Fr.fromString)),
    );
    return secret.toFields().map(toACVMField);
  }

  async emitOffchainEffect(data: ACVMField[]) {
    await this.typedOracle.emitOffchainEffect(data.map(Fr.fromString));
    return [];
  }
}
