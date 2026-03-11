import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
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
import { BlockHash } from '@aztec/stdlib/block';
import { ContractClassLog, ContractClassLogFields } from '@aztec/stdlib/logs';

import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { packAsHintedNote } from './note_packing_utils.js';

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

    // Validate oracle names - these must be prefixed with either "aztec_prv_" or "aztec_utl_" to indicate their scope
    // and must correspond to a function on the Oracle class.
    oracleNames.forEach(name => {
      if (!name.startsWith('aztec_prv_') && !name.startsWith('aztec_utl_')) {
        throw new Error(
          `Oracle function "${name}" must be prefixed with either "aztec_prv_" or "aztec_utl_" to indicate its scope`,
        );
      }

      const method = this[name as keyof Omit<Oracle, (typeof excludedProps)[number]>];
      if (typeof method !== 'function') {
        throw new Error(`Oracle property "${name}" must be a function`);
      }
    });

    // Build callback object and return it
    const callback = oracleNames.reduce((acc, name) => {
      const method = this[name as keyof Omit<Oracle, (typeof excludedProps)[number]>];
      acc[name] = method.bind(this);
      return acc;
    }, {} as ACIRCallback);

    // Legacy oracle names used by alpha payload protocol contracts (ContractInstanceRegistry,
    // ContractClassRegistry, FeeJuice). Their bytecode is committed and cannot be changed.
    // TODO(F-416): Remove these aliases on v5 when protocol contracts are redeployed.
    const legacyOracles: ACIRCallback = {
      utilityLog: this.aztec_utl_log.bind(this),
      utilityAssertCompatibleOracleVersion: this.aztec_utl_assertCompatibleOracleVersion.bind(this),
      utilityLoadCapsule: this.aztec_utl_loadCapsule.bind(this),
      privateStoreInExecutionCache: this.aztec_prv_storeInExecutionCache.bind(this),
      privateLoadFromExecutionCache: this.aztec_prv_loadFromExecutionCache.bind(this),
    };

    return { ...callback, ...legacyOracles };
  }

  // TODO(F-416): This oracle must never change its signature - it is called by the pinned alpha payload protocol
  // contracts (ContractInstanceRegistry, ContractClassRegistry, FeeJuice) which cannot be redeployed.
  // eslint-disable-next-line camelcase
  aztec_utl_assertCompatibleOracleVersion([version]: ACVMField[]) {
    this.handlerAsMisc().assertCompatibleOracleVersion(Fr.fromString(version).toNumber());
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getRandomField(): Promise<ACVMField[]> {
    const val = this.handlerAsMisc().getRandomField();
    return Promise.resolve([toACVMField(val)]);
  }

  // TODO(F-416): This oracle must never change its signature - it is called by the pinned alpha payload protocol
  // contracts (ContractInstanceRegistry, ContractClassRegistry, FeeJuice) which cannot be redeployed.
  // eslint-disable-next-line camelcase
  aztec_prv_storeInExecutionCache(values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsPrivate().storeInExecutionCache(values.map(Fr.fromString), Fr.fromString(hash));
    return Promise.resolve([]);
  }

  // TODO(F-416): This oracle must never change its signature - it is called by the pinned alpha payload protocol
  // contracts (ContractInstanceRegistry, ContractClassRegistry, FeeJuice) which cannot be redeployed.
  // eslint-disable-next-line camelcase
  async aztec_prv_loadFromExecutionCache([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
    const values = await this.handlerAsPrivate().loadFromExecutionCache(Fr.fromString(returnsHash));
    return [values.map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getUtilityContext(): Promise<(ACVMField | ACVMField[])[]> {
    const context = this.handlerAsUtility().getUtilityContext();
    return Promise.resolve(context.toNoirRepresentation());
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getKeyValidationRequest([pkMHash]: ACVMField[]): Promise<ACVMField[]> {
    const keyValidationRequest = await this.handlerAsUtility().getKeyValidationRequest(Fr.fromString(pkMHash));

    return keyValidationRequest.toFields().map(toACVMField);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getContractInstance([address]: ACVMField[]): Promise<ACVMField[]> {
    const instance = await this.handlerAsUtility().getContractInstance(AztecAddress.fromField(Fr.fromString(address)));

    return [
      instance.salt,
      instance.deployer,
      instance.currentContractClassId,
      instance.initializationHash,
      ...instance.publicKeys.toFields(),
    ].map(toACVMField);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getNoteHashMembershipWitness(
    [anchorBlockHash]: ACVMField[],
    [noteHash]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedAnchorBlockHash = BlockHash.fromString(anchorBlockHash);
    const parsedNoteHash = Fr.fromString(noteHash);

    const witness = await this.handlerAsUtility().getNoteHashMembershipWitness(parsedAnchorBlockHash, parsedNoteHash);
    if (!witness) {
      throw new Error(
        `Note hash ${noteHash} not found in the note hash tree at anchor block hash ${parsedAnchorBlockHash.toString()}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHashMembershipWitness(
    [anchorBlockHash]: ACVMField[],
    [blockHash]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedAnchorBlockHash = BlockHash.fromString(anchorBlockHash);
    const parsedBlockHash = BlockHash.fromString(blockHash);

    const witness = await this.handlerAsUtility().getBlockHashMembershipWitness(parsedAnchorBlockHash, parsedBlockHash);
    if (!witness) {
      throw new Error(
        `Block hash ${parsedBlockHash.toString()} not found in the archive tree at anchor block ${parsedAnchorBlockHash.toString()}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getNullifierMembershipWitness(
    [blockHash]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the witness for (to prove inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockHash = BlockHash.fromString(blockHash);
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.handlerAsUtility().getNullifierMembershipWitness(parsedBlockHash, parsedNullifier);
    if (!witness) {
      throw new Error(
        `Nullifier witness not found for nullifier ${parsedNullifier} at block hash ${parsedBlockHash.toString()}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getLowNullifierMembershipWitness(
    [blockHash]: ACVMField[],
    [nullifier]: ACVMField[], // nullifier, we try to find the low nullifier witness for (to prove non-inclusion)
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockHash = BlockHash.fromString(blockHash);
    const parsedNullifier = Fr.fromString(nullifier);

    const witness = await this.handlerAsUtility().getLowNullifierMembershipWitness(parsedBlockHash, parsedNullifier);
    if (!witness) {
      throw new Error(
        `Low nullifier witness not found for nullifier ${parsedNullifier} at block hash ${parsedBlockHash.toString()}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getPublicDataWitness(
    [blockHash]: ACVMField[],
    [leafSlot]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedBlockHash = BlockHash.fromString(blockHash);
    const parsedLeafSlot = Fr.fromString(leafSlot);

    const witness = await this.handlerAsUtility().getPublicDataWitness(parsedBlockHash, parsedLeafSlot);
    if (!witness) {
      throw new Error(
        `Public data witness not found for slot ${parsedLeafSlot} at block hash ${parsedBlockHash.toString()}.`,
      );
    }
    return witness.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHeader([blockNumber]: ACVMField[]): Promise<ACVMField[]> {
    const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();

    const header = await this.handlerAsUtility().getBlockHeader(BlockNumber(parsedBlockNumber));
    if (!header) {
      throw new Error(`Block header not found for block ${parsedBlockNumber}.`);
    }
    return header.toFields().map(toACVMField);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getAuthWitness([messageHash]: ACVMField[]): Promise<ACVMField[][]> {
    const messageHashField = Fr.fromString(messageHash);
    const witness = await this.handlerAsUtility().getAuthWitness(messageHashField);
    if (!witness) {
      throw new Error(`Unknown auth witness for message hash ${messageHashField}`);
    }
    return [witness.map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_tryGetPublicKeysAndPartialAddress([address]: ACVMField[]): Promise<(ACVMField | ACVMField[])[]> {
    const parsedAddress = AztecAddress.fromField(Fr.fromString(address));
    const result = await this.handlerAsUtility().tryGetPublicKeysAndPartialAddress(parsedAddress);

    // We are going to return a Noir Option struct to represent the possibility of null values. Options are a struct
    // with two fields: `some` (a boolean) and `value` (a field array in this case).
    if (result === undefined) {
      // No data was found so we set `some` to 0 and pad `value` with zeros get the correct return size.
      return [toACVMField(0), Array(13).fill(toACVMField(0))];
    } else {
      // Data was found so we set `some` to 1 and return it along with `value`.
      return [toACVMField(1), [...result.publicKeys.toFields(), result.partialAddress].map(toACVMField)];
    }
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getNotes(
    [ownerSome]: ACVMField[],
    [ownerValue]: ACVMField[],
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
    [packedHintedNoteLength]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    // Parse Option<AztecAddress>: ownerSome is 0 for None, 1 for Some
    const owner = Fr.fromString(ownerSome).toNumber() === 1 ? AztecAddress.fromString(ownerValue) : undefined;
    const noteDatas = await this.handlerAsUtility().getNotes(
      owner,
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

    const returnDataAsArrayOfPackedHintedNotes = noteDatas.map(noteData =>
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

    // Now we convert each sub-array to an array of ACVMField
    const returnDataAsArrayOfACVMFieldArrays = returnDataAsArrayOfPackedHintedNotes.map(subArray =>
      subArray.map(toACVMField),
    );

    // At last we convert the array of arrays to a bounded vec of arrays
    return arrayOfArraysToBoundedVecOfArrays(returnDataAsArrayOfACVMFieldArrays, +maxNotes, +packedHintedNoteLength);
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedNote(
    [owner]: ACVMField[],
    [storageSlot]: ACVMField[],
    [randomness]: ACVMField[],
    [noteTypeId]: ACVMField[],
    note: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    this.handlerAsPrivate().notifyCreatedNote(
      AztecAddress.fromString(owner),
      Fr.fromString(storageSlot),
      Fr.fromString(randomness),
      NoteSelector.fromField(Fr.fromString(noteTypeId)),
      note.map(Fr.fromString),
      Fr.fromString(noteHash),
      +counter,
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyNullifiedNote(
    [innerNullifier]: ACVMField[],
    [noteHash]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsPrivate().notifyNullifiedNote(Fr.fromString(innerNullifier), Fr.fromString(noteHash), +counter);
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyCreatedNullifier([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().notifyCreatedNullifier(Fr.fromString(innerNullifier));
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_isNullifierPending(
    [innerNullifier]: ACVMField[],
    [contractAddress]: ACVMField[],
  ): Promise<ACVMField[]> {
    const isPending = await this.handlerAsPrivate().isNullifierPending(
      Fr.fromString(innerNullifier),
      AztecAddress.fromString(contractAddress),
    );
    return [toACVMField(isPending)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_checkNullifierExists([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    const exists = await this.handlerAsUtility().checkNullifierExists(Fr.fromString(innerNullifier));
    return [toACVMField(exists)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getL1ToL2MembershipWitness(
    [contractAddress]: ACVMField[],
    [messageHash]: ACVMField[],
    [secret]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const message = await this.handlerAsUtility().getL1ToL2MembershipWitness(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(messageHash),
      Fr.fromString(secret),
    );
    return message.toNoirRepresentation();
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_storageRead(
    [blockHash]: ACVMField[],
    [contractAddress]: ACVMField[],
    [startStorageSlot]: ACVMField[],
    [numberOfElements]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const values = await this.handlerAsUtility().storageRead(
      BlockHash.fromString(blockHash),
      new AztecAddress(Fr.fromString(contractAddress)),
      Fr.fromString(startStorageSlot),
      +numberOfElements,
    );
    return [values.map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedContractClassLog(
    [contractAddress]: ACVMField[],
    message: ACVMField[],
    [length]: ACVMField[],
    [counter]: ACVMField[],
  ): Promise<ACVMField[]> {
    const logFields = new ContractClassLogFields(message.map(Fr.fromString));
    const log = new ContractClassLog(new AztecAddress(Fr.fromString(contractAddress)), logFields, +length);

    this.handlerAsPrivate().notifyCreatedContractClassLog(log, +counter);
    return Promise.resolve([]);
  }

  // TODO(F-416): This oracle must never change its signature - it is called by the pinned alpha payload protocol
  // contracts (ContractInstanceRegistry, ContractClassRegistry, FeeJuice) which cannot be redeployed.
  // eslint-disable-next-line camelcase
  async aztec_utl_log(
    level: ACVMField[],
    message: ACVMField[],
    _ignoredFieldsSize: ACVMField[],
    fields: ACVMField[],
  ): Promise<ACVMField[]> {
    const levelFr = Fr.fromString(level[0]);
    const messageStr = message.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
    const fieldsFr = fields.map(Fr.fromString);
    await this.handlerAsMisc().log(levelFr.toNumber(), messageStr, fieldsFr);
    return [];
  }

  // This function's name is directly hardcoded in `circuit_recorder.ts`. Don't forget to update it there if you
  // change the name here.
  // eslint-disable-next-line camelcase
  async aztec_prv_callPrivateFunction(
    [contractAddress]: ACVMField[],
    [functionSelector]: ACVMField[],
    [argsHash]: ACVMField[],
    [sideEffectCounter]: ACVMField[],
    [isStaticCall]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const { endSideEffectCounter, returnsHash } = await this.handlerAsPrivate().callPrivateFunction(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      FunctionSelector.fromField(Fr.fromString(functionSelector)),
      Fr.fromString(argsHash),
      Fr.fromString(sideEffectCounter).toNumber(),
      Fr.fromString(isStaticCall).toBool(),
    );
    return [[endSideEffectCounter, returnsHash].map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_validatePublicCalldata([calldataHash]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().validatePublicCalldata(Fr.fromString(calldataHash));
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyRevertiblePhaseStart([minRevertibleSideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().notifyRevertiblePhaseStart(Fr.fromString(minRevertibleSideEffectCounter).toNumber());
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_inRevertiblePhase([sideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
    const isRevertible = await this.handlerAsPrivate().inRevertiblePhase(Fr.fromString(sideEffectCounter).toNumber());
    return Promise.resolve([toACVMField(isRevertible)]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getNextAppTagAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
    const tag = await this.handlerAsPrivate().getNextAppTagAsSender(
      AztecAddress.fromString(sender),
      AztecAddress.fromString(recipient),
    );
    return [toACVMField(tag.value)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_fetchTaggedLogs([pendingTaggedLogArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsUtility().fetchTaggedLogs(Fr.fromString(pendingTaggedLogArrayBaseSlot));
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_validateAndStoreEnqueuedNotesAndEvents(
    [contractAddress]: ACVMField[],
    [noteValidationRequestsArrayBaseSlot]: ACVMField[],
    [eventValidationRequestsArrayBaseSlot]: ACVMField[],
    [maxNotePackedLen]: ACVMField[],
    [maxEventSerializedLen]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEvents(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(noteValidationRequestsArrayBaseSlot),
      Fr.fromString(eventValidationRequestsArrayBaseSlot),
      Fr.fromString(maxNotePackedLen).toNumber(),
      Fr.fromString(maxEventSerializedLen).toNumber(),
    );

    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_bulkRetrieveLogs(
    [contractAddress]: ACVMField[],
    [logRetrievalRequestsArrayBaseSlot]: ACVMField[],
    [logRetrievalResponsesArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().bulkRetrieveLogs(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(logRetrievalRequestsArrayBaseSlot),
      Fr.fromString(logRetrievalResponsesArrayBaseSlot),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_utilityResolveMessageContexts(
    [contractAddress]: ACVMField[],
    [messageContextRequestsArrayBaseSlot]: ACVMField[],
    [messageContextResponsesArrayBaseSlot]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().utilityResolveMessageContexts(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(messageContextRequestsArrayBaseSlot),
      Fr.fromString(messageContextResponsesArrayBaseSlot),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_storeCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    capsule: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().storeCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      capsule.map(Fr.fromString),
    );
    return [];
  }

  // TODO(F-416): This oracle must never change its signature - it is called by the pinned alpha payload protocol
  // contracts (ContractInstanceRegistry, ContractClassRegistry, FeeJuice) which cannot be redeployed.
  // eslint-disable-next-line camelcase
  async aztec_utl_loadCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    [tSize]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const values = await this.handlerAsUtility().loadCapsule(
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

  // eslint-disable-next-line camelcase
  async aztec_utl_deleteCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsUtility().deleteCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_copyCapsule(
    [contractAddress]: ACVMField[],
    [srcSlot]: ACVMField[],
    [dstSlot]: ACVMField[],
    [numEntries]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().copyCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(srcSlot),
      Fr.fromString(dstSlot),
      Fr.fromString(numEntries).toNumber(),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_aes128Decrypt(
    ciphertextBVecStorage: ACVMField[],
    [ciphertextLength]: ACVMField[],
    iv: ACVMField[],
    symKey: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    const plaintext = await this.handlerAsUtility().aes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);
    return bufferToBoundedVec(plaintext, ciphertextBVecStorage.length);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getSharedSecret(
    [address]: ACVMField[],
    [ephPKField0]: ACVMField[],
    [ephPKField1]: ACVMField[],
    [ephPKField2]: ACVMField[],
  ): Promise<ACVMField[]> {
    const secret = await this.handlerAsUtility().getSharedSecret(
      AztecAddress.fromField(Fr.fromString(address)),
      Point.fromFields([ephPKField0, ephPKField1, ephPKField2].map(Fr.fromString)),
    );
    return secret.toFields().map(toACVMField);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_emitOffchainEffect(data: ACVMField[]) {
    await this.handlerAsPrivate().emitOffchainEffect(data.map(Fr.fromString));
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getSenderForTags(): Promise<ACVMField[]> {
    const sender = await this.handlerAsPrivate().getSenderForTags();
    // Return [1, address] for Some(address), [0, 0] for None
    return sender ? [toACVMField(1n), toACVMField(sender)] : [toACVMField(0n), toACVMField(0n)];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_setSenderForTags([senderForTags]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().setSenderForTags(AztecAddress.fromField(Fr.fromString(senderForTags)));
    return [];
  }
}
