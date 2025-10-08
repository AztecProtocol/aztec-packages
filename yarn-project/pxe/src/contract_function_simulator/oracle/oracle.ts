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

import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { packAsRetrievedNote } from './note_packing_utils.js';

export class UnavailableOracleError extends Error {
  constructor(oracleName: string) {
    super(`${oracleName} oracles not available with the current handler`);
  }
}

/**
 * A data source that has all the apis required by Aztec.nr.
 */
export class Oracle {
  constructor(private handler: IMiscOracle | IUtilityExecutionOracle | IPrivateExecutionOracle) {}

  private handlerAsMisc(): IMiscOracle {
    if (!('isMisc' in this.handler)) {
      throw new UnavailableOracleError('Misc');
    }

    return this.handler;
  }

  private handlerAsUtility(): IUtilityExecutionOracle {
    if (!('isUtility' in this.handler)) {
      throw new UnavailableOracleError('Utility');
    }

    return this.handler;
  }

  private handlerAsPrivate(): IPrivateExecutionOracle {
    if (!('isPrivate' in this.handler)) {
      throw new UnavailableOracleError('Private');
    }

    return this.handler;
  }

  toACIRCallback(): ACIRCallback {
    const excludedProps = [
      'handler',
      'constructor',
      'toACIRCallback',
      'handlerAsMisc',
      'handlerAsUtility',
      'handlerAsPrivate',
    ] as const;

    // Get all the oracle function names
    const oracleNames = Object.getOwnPropertyNames(Oracle.prototype).filter(
      name => !excludedProps.includes(name as (typeof excludedProps)[number]),
    );

    // Validate oracle names - these must be prefixed with either "private" or "utility" to indicate their scope
    // and must correspond to a function on the Oracle class.
    oracleNames.forEach(name => {
      if (!name.startsWith('private') && !name.startsWith('utility')) {
        throw new Error(
          `Oracle function "${name}" must be prefixed with either "private" or "utility" to indicate its scope`,
        );
      }

      const method = this[name as keyof Omit<Oracle, (typeof excludedProps)[number]>];
      if (typeof method !== 'function') {
        throw new Error(`Oracle property "${name}" must be a function`);
      }
    });

    // Build callback object and return it
    return oracleNames.reduce((acc, name) => {
      const method = this[name as keyof Omit<Oracle, (typeof excludedProps)[number]>];
      acc[name] = method.bind(this);
      return acc;
    }, {} as ACIRCallback);
  }

  utilityAssertCompatibleOracleVersion([version]: ACVMField[]) {
    this.handlerAsMisc().utilityAssertCompatibleOracleVersion(Fr.fromString(version).toNumber());
    return Promise.resolve([]);
  }

  utilityGetRandomField(): Promise<ACVMField[]> {
    const val = this.handlerAsMisc().utilityGetRandomField();
    return Promise.resolve([toACVMField(val)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  privateStoreInExecutionCache(_length: ACVMField[], values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsPrivate().privateStoreInExecutionCache(values.map(Fr.fromString), Fr.fromString(hash));
    return Promise.resolve([]);
  }

  async privateLoadFromExecutionCache([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
    const values = await this.handlerAsPrivate().privateLoadFromExecutionCache(Fr.fromString(returnsHash));
    return [values.map(toACVMField)];
  }

  async utilityGetUtilityContext(): Promise<(ACVMField | ACVMField[])[]> {
    const context = await this.handlerAsUtility().utilityGetUtilityContext();
    return context.toNoirRepresentation();
  }

  async utilityGetKeyValidationRequest([pkMHash]: ACVMField[]): Promise<ACVMField[]> {
    const keyValidationRequest = await this.handlerAsUtility().utilityGetKeyValidationRequest(Fr.fromString(pkMHash));

    return keyValidationRequest.toFields().map(toACVMField);
  }

  async utilityGetContractInstance([address]: ACVMField[]): Promise<ACVMField[]> {
    const instance = await this.handlerAsUtility().utilityGetContractInstance(
      AztecAddress.fromField(Fr.fromString(address)),
    );

    return [
      instance.salt,
      instance.deployer,
      instance.currentContractClassId,
      instance.initializationHash,
      ...instance.publicKeys.toFields(),
    ].map(toACVMField);
  }

  async utilityGetMembershipWitness(
    [blockNumber]: ACVMField[],
    [treeId]: ACVMField[],
    [leafValue]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedTreeId = Fr.fromString(treeId).toNumber();
    const parsedLeafValue = Fr.fromString(leafValue);

    const witness = await this.handlerAsUtility().utilityGetMembershipWitness(
      parsedBlockNumber,
      parsedTreeId,
      parsedLeafValue,
    );
    if (!witness) {
      throw new Error(
        `Leaf ${leafValue} not found in the tree ${MerkleTreeId[parsedTreeId]} at block ${parsedBlockNumber}.`,
      );
    }
    return [toACVMField(witness[0]), witness.slice(1).map(toACVMField)];
  }

  async utilityGetNullifierMembershipWitness(
    [blockNumber]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the witness for (to prove inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.handlerAsUtility().utilityGetNullifierMembershipWitness(
      parsedBlockNumber,
      parsedNullifier,
    );
    if (!witness) {
      throw new Error(`Nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`);
    }
    return witness.toNoirRepresentation();
  }

  async utilityGetLowNullifierMembershipWitness(
    [blockNumber]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the low nullifier witness for (to prove non-inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.handlerAsUtility().utilityGetLowNullifierMembershipWitness(
      parsedBlockNumber,
      parsedNullifier,
    );
    if (!witness) {
      throw new Error(
        `Low nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  async utilityGetPublicDataWitness(
    [blockNumber]: ACVMField[],
    [leafSlot]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
    const parsedLeafSlot = Fr.fromString(leafSlot);

    const witness = await this.handlerAsUtility().utilityGetPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return witness.toNoirRepresentation();
  }

  async utilityGetBlockHeader([blockNumber]: ACVMField[]): Promise<ACVMField[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();

    const header = await this.handlerAsUtility().utilityGetBlockHeader(parsedBlockNumber);
    if (!header) {
      throw new Error(`Block header not found for block ${parsedBlockNumber}.`);
    }
    return header.toFields().map(toACVMField);
  }

  async utilityGetAuthWitness([messageHash]: ACVMField[]): Promise<ACVMField[][]> {
    const messageHashField = Fr.fromString(messageHash);
    const witness = await this.handlerAsUtility().utilityGetAuthWitness(messageHashField);
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHashField}`);
    }
    return [witness.map(toACVMField)];
  }

  async utilityGetPublicKeysAndPartialAddress([address]: ACVMField[]): Promise<ACVMField[][]> {
    const parsedAddress = AztecAddress.fromField(Fr.fromString(address));
    const { publicKeys, partialAddress } =
      await this.handlerAsUtility().utilityGetPublicKeysAndPartialAddress(parsedAddress);

    return [[...publicKeys.toFields(), partialAddress].map(toACVMField)];
  }

  async utilityGetNotes(
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
    const noteDatas = await this.handlerAsUtility().utilityGetNotes(
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

    const returnDataAsArrayOfPackedRetrievedNotes = noteDatas.map(packAsRetrievedNote);

    // Now we convert each sub-array to an array of ACVMField
    const returnDataAsArrayOfACVMFieldArrays = returnDataAsArrayOfPackedRetrievedNotes.map(subArray =>
      subArray.map(toACVMField),
    );

    // At last we convert the array of arrays to a bounded vec of arrays
    return arrayOfArraysToBoundedVecOfArrays(returnDataAsArrayOfACVMFieldArrays, +maxNotes, +packedRetrievedNoteLength);
  }

  privateNotifyCreatedNote(
    [storageSlot]: ACVMField[],
    [noteTypeId]: ACVMField[],
    note: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    this.handlerAsPrivate().privateNotifyCreatedNote(
      Fr.fromString(storageSlot),
      NoteSelector.fromField(Fr.fromString(noteTypeId)),
      note.map(Fr.fromString),
      Fr.fromString(noteHash),
      +counter,
    );
    return Promise.resolve([]);
  }

  async privateNotifyNullifiedNote(
    [innerNullifier]: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsPrivate().privateNotifyNullifiedNote(
      Fr.fromString(innerNullifier),
      Fr.fromString(noteHash),
      +counter,
    );
    return [];
  }

  async privateNotifyCreatedNullifier([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().privateNotifyCreatedNullifier(Fr.fromString(innerNullifier));
    return [];
  }

  async utilityCheckNullifierExists([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    const exists = await this.handlerAsUtility().utilityCheckNullifierExists(Fr.fromString(innerNullifier));
    return [toACVMField(exists)];
  }

  async utilityGetL1ToL2MembershipWitness(
    [contractAddress]: ACVMField[],
    [messageHash]: ACVMField[],
    [secret]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const message = await this.handlerAsUtility().utilityGetL1ToL2MembershipWitness(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(messageHash),
      Fr.fromString(secret),
    );
    return message.toNoirRepresentation();
  }

  async utilityStorageRead(
    [contractAddress]: ACVMField[],
    [startStorageSlot]: ACVMField[],
    [blockNumber]: ACVMField[],
    [numberOfElements]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const values = await this.handlerAsUtility().utilityStorageRead(
      new AztecAddress(Fr.fromString(contractAddress)),
      Fr.fromString(startStorageSlot),
      +blockNumber,
      +numberOfElements,
    );
    return [values.map(toACVMField)];
  }

  privateNotifyCreatedContractClassLog(
    [contractAddress]: ACVMField[],
    message: ACVMField[],
    [length]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    const logFields = new ContractClassLogFields(message.map(Fr.fromString));
    const log = new ContractClassLog(new AztecAddress(Fr.fromString(contractAddress)), logFields, +length);

    this.handlerAsPrivate().privateNotifyCreatedContractClassLog(log, +counter);
    return Promise.resolve([]);
  }

  utilityDebugLog(
    level: ACVMField[],
    message: ACVMField[],
    _ignoredFieldsSize: ACVMField[],
    fields: ACVMField[],
  ): Promise<ACVMField[]> {
    const levelFr = Fr.fromString(level[0]);
    const messageStr = message.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
    const fieldsFr = fields.map(Fr.fromString);
    this.handlerAsMisc().utilityDebugLog(levelFr.toNumber(), messageStr, fieldsFr);
    return Promise.resolve([]);
  }

  // This function's name is directly hardcoded in `circuit_recorder.ts`. Don't forget to update it there if you
  // change the name here.
  async privateCallPrivateFunction(
    [contractAddress]: ACVMField[],
    [functionSelector]: ACVMField[],
    [argsHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const { endSideEffectCounter, returnsHash } = await this.handlerAsPrivate().privateCallPrivateFunction(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      FunctionSelector.fromField(Fr.fromString(functionSelector)),
      Fr.fromString(argsHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [[endSideEffectCounter, returnsHash].map(toACVMField)];
  }

  async privateNotifyEnqueuedPublicFunctionCall(
    [contractAddress]: ACVMField[],
    [calldataHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsPrivate().privateNotifyEnqueuedPublicFunctionCall(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(calldataHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [];
  }

  async privateNotifySetPublicTeardownFunctionCall(
    [contractAddress]: ACVMField[],
    [calldataHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsPrivate().privateNotifySetPublicTeardownFunctionCall(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(calldataHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [];
  }

  async privateNotifySetMinRevertibleSideEffectCounter([minRevertibleSideEffectCounter]: ACVMField[]): Promise<
    ACVMField[]
  > {
    await this.handlerAsPrivate().privateNotifySetMinRevertibleSideEffectCounter(
      Fr.fromString(minRevertibleSideEffectCounter).toNumber(),
    );
    return Promise.resolve([]);
  }

  async privateGetNextAppTagAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
    const tag = await this.handlerAsPrivate().privateGetNextAppTagAsSender(
      AztecAddress.fromString(sender),
      AztecAddress.fromString(recipient),
    );
    return [toACVMField(tag)];
  }

  async utilityFetchTaggedLogs([pendingTaggedLogArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityFetchTaggedLogs(Fr.fromString(pendingTaggedLogArrayBaseSlot));
    return [];
  }

  async utilityValidateEnqueuedNotesAndEvents(
    [contractAddress]: ACVMField[],
    [noteValidationRequestsArrayBaseSlot]: ACVMField[],
    [eventValidationRequestsArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityValidateEnqueuedNotesAndEvents(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(noteValidationRequestsArrayBaseSlot),
      Fr.fromString(eventValidationRequestsArrayBaseSlot),
    );

    return [];
  }

  async utilityBulkRetrieveLogs(
    [contractAddress]: ACVMField[],
    [logRetrievalRequestsArrayBaseSlot]: ACVMField[],
    [logRetrievalResponsesArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityBulkRetrieveLogs(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(logRetrievalRequestsArrayBaseSlot),
      Fr.fromString(logRetrievalResponsesArrayBaseSlot),
    );
    return [];
  }

  async utilityStoreCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    capsule: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityStoreCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      capsule.map(Fr.fromString),
    );
    return [];
  }

  async utilityLoadCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    [tSize]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const values = await this.handlerAsUtility().utilityLoadCapsule(
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

  async utilityDeleteCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityDeleteCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
    );
    return [];
  }

  async utilityCopyCapsule(
    [contractAddress]: ACVMField[],
    [srcSlot]: ACVMField[],
    [dstSlot]: ACVMField[],
    [numEntries]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityCopyCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(srcSlot),
      Fr.fromString(dstSlot),
      Fr.fromString(numEntries).toNumber(),
    );
    return [];
  }

  async utilityAes128Decrypt(
    ciphertextBVecStorage: ACVMField[],
    [ciphertextLength]: ACVMField[],
    iv: ACVMField[],
    symKey: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const plaintext = await this.handlerAsUtility().utilityAes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);
    return bufferToBoundedVec(plaintext, ciphertextBVecStorage.length);
  }

  async utilityGetSharedSecret(
    [address]: ACVMField[],
    [ephPKField0]: ACVMField[],
    [ephPKField1]: ACVMField[],
    [ephPKField2]: ACVMField[],
  ): Promise<ACVMField[]> {
    const secret = await this.handlerAsUtility().utilityGetSharedSecret(
      AztecAddress.fromField(Fr.fromString(address)),
      Point.fromFields([ephPKField0, ephPKField1, ephPKField2].map(Fr.fromString)),
    );
    return secret.toFields().map(toACVMField);
  }

  async utilityEmitOffchainEffect(data: ACVMField[]) {
    await this.handlerAsPrivate().utilityEmitOffchainEffect(data.map(Fr.fromString));
    return [];
  }

  async privateGetSenderForTags(): Promise<ACVMField[]> {
    const sender = await this.handlerAsPrivate().privateGetSenderForTags();
    // Return [1, address] for Some(address), [0, 0] for None
    return sender ? [toACVMField(1n), toACVMField(sender)] : [toACVMField(0n), toACVMField(0n)];
  }

  async privateSetSenderForTags([senderForTags]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().privateSetSenderForTags(AztecAddress.fromField(Fr.fromString(senderForTags)));
    return [];
  }
}
