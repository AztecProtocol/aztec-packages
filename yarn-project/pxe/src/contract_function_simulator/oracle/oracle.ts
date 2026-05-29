import {
  ARCHIVE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
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
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { ContractClassLog, ContractClassLogFields, FlatPublicLogs, PrivateLog } from '@aztec/stdlib/logs';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR } from '../../oracle_version.js';
import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { buildLegacyOracleCallbacks } from './legacy_oracle_mappings.js';
import { packAsHintedNote } from './note_packing_utils.js';

export class UnavailableOracleError extends Error {
  constructor(oracleName: string) {
    super(`${oracleName} oracles not available with the current handler`);
  }
}

// These must match the FACT_MAX_* globals in aztec-nr's `oracle/fact_store.nr`.
const FACT_MAX_PAYLOAD = 20;
const FACT_MAX_FACTS = 8;
const FACT_MAX_ACTIVE_ENTITIES = 64;

/**
 * A data source that has all the apis required by Aztec.nr.
 *
 * ## Oracle naming conventions
 *
 * We try to keep oracle naming consistent, please see below the conventions we adhere to.
 *
 * Each oracle method name has the form `aztec_{scope}_{verb}{Object}`, where:
 *
 * - **Scope prefix** indicates the execution context required:
 *   - `aztec_prv_` — available only during private function execution.
 *   - `aztec_utl_` — available during both utility and private execution.
 *
 * - **Verb** signals the operation's semantics (verb-first, then object):
 *   - `get`              — read / lookup / get data from oracle into contract.
 *   - `does`/`is`/`has`  — predicate (returns boolean).
 *   - `emit`/`notify`    — propagate data from contract to oracle.
 *   - `set`              — contract driven oracle state mutation (capsules, execution cache, tagging, etc).
 *   - `call`             — trigger nested execution (control flow).
 *   - `assert`           — validate a condition, throw on failure.
 *   - Standalone verbs (`delete`, `copy`, `decrypt`, `log`, etc) are used when no generic verb fits.
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

    const allCallbacks = { ...callback, ...buildLegacyOracleCallbacks(this) };

    // Wrap in a Proxy to intercept access to missing oracle names and provide enhanced error messages when the
    // contract's minor version is higher than the PXE's (i.e. the contract expects oracles that were added in a newer
    // minor version).
    const handler = this.handler;
    return new Proxy(allCallbacks, {
      get(target, prop: string) {
        if (prop in target) {
          return target[prop];
        }
        // Return a function that throws with an enhanced error message if applicable
        return () => {
          type NonOracleFunctionGetContractOracleVersion = {
            nonOracleFunctionGetContractOracleVersion(): { major: number; minor: number } | undefined;
          };

          let contractVersion = undefined;
          if ('nonOracleFunctionGetContractOracleVersion' in handler) {
            contractVersion = (
              handler as unknown as NonOracleFunctionGetContractOracleVersion
            ).nonOracleFunctionGetContractOracleVersion();
          }
          if (!contractVersion) {
            throw new Error(
              `Oracle '${prop}' not found and the contract's oracle version is unknown (the version check oracle ` +
                `was not called before '${prop}'). This usually means the contract was not compiled with the ` +
                `#[aztec] macro, which injects the version check as the first oracle call in every private/utility ` +
                `external function. If you're using a custom entry point, ensure assert_compatible_oracle_version() ` +
                `is called before any other oracle calls. See https://docs.aztec.network/errors/8`,
            );
          } else if (contractVersion.minor > ORACLE_VERSION_MINOR) {
            throw new Error(
              `Oracle '${prop}' not found.` +
                ` This usually means the contract requires a newer private execution environment than you have.` +
                ` Upgrade your private execution environment to a compatible version. The contract was compiled with` +
                ` Aztec.nr oracle version ${contractVersion.major}.${contractVersion.minor}, but this private` +
                ` execution environment only supports up to ${ORACLE_VERSION_MAJOR}.${ORACLE_VERSION_MINOR}.` +
                ` See https://docs.aztec.network/errors/8`,
            );
          } else {
            throw new Error(
              `Oracle '${prop}' not found.` +
                ` The contract's oracle version (${contractVersion.major}.${contractVersion.minor}) is compatible` +
                ` with this private execution environment (${ORACLE_VERSION_MAJOR}.${ORACLE_VERSION_MINOR}), so all` +
                ` standard oracles should be available. This could mean the contract was compiled against a modified` +
                ` version of Aztec.nr, or that it references an oracle that does not exist.` +
                ` See https://docs.aztec.network/errors/8`,
            );
          }
        };
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_assertCompatibleOracleVersionV2([major]: ACVMField[], [minor]: ACVMField[]) {
    this.handlerAsMisc().assertCompatibleOracleVersion(
      Fr.fromString(major).toNumber(),
      Fr.fromString(minor).toNumber(),
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getRandomField(): Promise<ACVMField[]> {
    const val = this.handlerAsMisc().getRandomField();
    return Promise.resolve([toACVMField(val)]);
  }

  // eslint-disable-next-line camelcase
  aztec_prv_setHashPreimage(values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsPrivate().setHashPreimage(values.map(Fr.fromString), Fr.fromString(hash));
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_getHashPreimage([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
    const values = await this.handlerAsPrivate().getHashPreimage(Fr.fromString(returnsHash));
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

  // TODO(https://linear.app/aztec-labs/issue/F-651): drop this
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

  // TODO(https://linear.app/aztec-labs/issue/F-651): rename to aztec_utl_getBlockHashMembershipWitness
  // eslint-disable-next-line camelcase
  async aztec_utl_getBlockHashMembershipWitnessV2(
    [anchorBlockHash]: ACVMField[],
    [blockHash]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const parsedAnchorBlockHash = BlockHash.fromString(anchorBlockHash);
    const parsedBlockHash = BlockHash.fromString(blockHash);

    const witness = await this.handlerAsUtility().getBlockHashMembershipWitness(parsedAnchorBlockHash, parsedBlockHash);
    const effective = witness ?? MembershipWitness.empty(ARCHIVE_HEIGHT);
    return [toACVMField(witness !== undefined ? 1 : 0), ...effective.toNoirRepresentation()];
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
  async aztec_utl_getPublicKeysAndPartialAddress([address]: ACVMField[]): Promise<(ACVMField | ACVMField[])[]> {
    const parsedAddress = AztecAddress.fromField(Fr.fromString(address));
    const result = await this.handlerAsUtility().getPublicKeysAndPartialAddress(parsedAddress);

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
  async aztec_utl_doesNullifierExist([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
    const exists = await this.handlerAsUtility().doesNullifierExist(Fr.fromString(innerNullifier));
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
  async aztec_utl_getFromPublicStorage(
    [blockHash]: ACVMField[],
    [contractAddress]: ACVMField[],
    [startStorageSlot]: ACVMField[],
    [numberOfElements]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const values = await this.handlerAsUtility().getFromPublicStorage(
      BlockHash.fromString(blockHash),
      new AztecAddress(Fr.fromString(contractAddress)),
      Fr.fromString(startStorageSlot),
      +numberOfElements,
    );
    return [values.map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_callUtilityFunction(
    [contractAddress]: ACVMField[],
    [functionSelector]: ACVMField[],
    args: ACVMField[],
  ): Promise<ACVMField[][]> {
    const result = await this.handlerAsUtility().callUtilityFunction(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      FunctionSelector.fromField(Fr.fromString(functionSelector)),
      args.map(Fr.fromString),
    );
    return [result.map(toACVMField)];
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
  async aztec_prv_assertValidPublicCalldata([calldataHash]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().assertValidPublicCalldata(Fr.fromString(calldataHash));
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_notifyRevertiblePhaseStart([minRevertibleSideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
    await this.handlerAsPrivate().notifyRevertiblePhaseStart(Fr.fromString(minRevertibleSideEffectCounter).toNumber());
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_prv_isExecutionInRevertiblePhase([sideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
    const isRevertible = await this.handlerAsPrivate().isExecutionInRevertiblePhase(
      Fr.fromString(sideEffectCounter).toNumber(),
    );
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
  async aztec_utl_getPendingTaggedLogs(
    [pendingTaggedLogArrayBaseSlot]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().getPendingTaggedLogs(
      Fr.fromString(pendingTaggedLogArrayBaseSlot),
      AztecAddress.fromString(scope),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getPendingTaggedLogs_v2([scope]: ACVMField[]): Promise<ACVMField[]> {
    const slot = await this.handlerAsUtility().getPendingTaggedLogsV2(AztecAddress.fromString(scope));
    return [toACVMField(slot)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_validateAndStoreEnqueuedNotesAndEvents(
    [contractAddress]: ACVMField[],
    [noteValidationRequestsArrayBaseSlot]: ACVMField[],
    [eventValidationRequestsArrayBaseSlot]: ACVMField[],
    [maxNotePackedLen]: ACVMField[],
    [maxEventSerializedLen]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEvents(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(noteValidationRequestsArrayBaseSlot),
      Fr.fromString(eventValidationRequestsArrayBaseSlot),
      Fr.fromString(maxNotePackedLen).toNumber(),
      Fr.fromString(maxEventSerializedLen).toNumber(),
      AztecAddress.fromString(scope),
    );

    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_validateAndStoreEnqueuedNotesAndEvents_v2(
    [noteValidationRequestsArrayBaseSlot]: ACVMField[],
    [eventValidationRequestsArrayBaseSlot]: ACVMField[],
    [maxNotePackedLen]: ACVMField[],
    [maxEventSerializedLen]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEventsV2(
      Fr.fromString(noteValidationRequestsArrayBaseSlot),
      Fr.fromString(eventValidationRequestsArrayBaseSlot),
      Fr.fromString(maxNotePackedLen).toNumber(),
      Fr.fromString(maxEventSerializedLen).toNumber(),
      AztecAddress.fromString(scope),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getLogsByTag(
    [contractAddress]: ACVMField[],
    [logRetrievalRequestsArrayBaseSlot]: ACVMField[],
    [logRetrievalResponsesArrayBaseSlot]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().getLogsByTag(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(logRetrievalRequestsArrayBaseSlot),
      Fr.fromString(logRetrievalResponsesArrayBaseSlot),
      AztecAddress.fromString(scope),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getMessageContextsByTxHash(
    [contractAddress]: ACVMField[],
    [messageContextRequestsArrayBaseSlot]: ACVMField[],
    [messageContextResponsesArrayBaseSlot]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().getMessageContextsByTxHash(
      AztecAddress.fromString(contractAddress),
      Fr.fromString(messageContextRequestsArrayBaseSlot),
      Fr.fromString(messageContextResponsesArrayBaseSlot),
      AztecAddress.fromString(scope),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getLogsByTag_v2([requestArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
    const responseSlot = await this.handlerAsUtility().getLogsByTagV2(Fr.fromString(requestArrayBaseSlot));
    return [toACVMField(responseSlot)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getMessageContextsByTxHash_v2([requestArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
    const responseSlot = await this.handlerAsUtility().getMessageContextsByTxHashV2(
      Fr.fromString(requestArrayBaseSlot),
    );
    return [toACVMField(responseSlot)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getTxEffect([txHash]: ACVMField[]): Promise<(ACVMField | ACVMField[])[]> {
    const txEffect = await this.handlerAsUtility().getTxEffect(TxHash.fromField(Fr.fromString(txHash)));
    // The Noir oracle returns `Option<TxEffect>`. ACVM expands this into 12 destination slots: the Option discriminant
    // followed by the 11 leaf slots of `TxEffect` (each scalar is one slot, each top-level array is one slot, and
    // the nested `PublicLogs { length, payload }` splits into two slots).
    const effect = txEffect ?? TxEffect.empty();
    const flatPublicLogs = FlatPublicLogs.fromLogs(effect.publicLogs);
    return [
      toACVMField(txEffect === null ? 0 : 1),
      toACVMField(effect.revertCode.toField()),
      toACVMField(effect.txHash.hash),
      toACVMField(effect.transactionFee),
      padArrayEnd(effect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX).map(toACVMField),
      padArrayEnd(effect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(toACVMField),
      padArrayEnd(effect.l2ToL1Msgs, Fr.ZERO, MAX_L2_TO_L1_MSGS_PER_TX).map(toACVMField),
      padArrayEnd(effect.publicDataWrites, PublicDataWrite.empty(), MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
        .flatMap(w => w.toFields())
        .map(toACVMField),
      padArrayEnd(effect.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX)
        .flatMap(l => l.toFields())
        .map(toACVMField),
      toACVMField(flatPublicLogs.length),
      flatPublicLogs.payload.map(toACVMField),
      padArrayEnd(effect.contractClassLogs, ContractClassLog.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX)
        .flatMap(l => [...l.fields.toFields(), new Fr(l.emittedLength), l.contractAddress.toField()])
        .map(toACVMField),
    ];
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    capsule: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    this.handlerAsUtility().setCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      capsule.map(Fr.fromString),
      AztecAddress.fromField(Fr.fromString(scope)),
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    [tSize]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const values = await this.handlerAsUtility().getCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      AztecAddress.fromField(Fr.fromString(scope)),
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
  aztec_utl_deleteCapsule(
    [contractAddress]: ACVMField[],
    [slot]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    this.handlerAsUtility().deleteCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(slot),
      AztecAddress.fromField(Fr.fromString(scope)),
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_copyCapsule(
    [contractAddress]: ACVMField[],
    [srcSlot]: ACVMField[],
    [dstSlot]: ACVMField[],
    [numEntries]: ACVMField[],
    [scope]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().copyCapsule(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      Fr.fromString(srcSlot),
      Fr.fromString(dstSlot),
      Fr.fromString(numEntries).toNumber(),
      AztecAddress.fromField(Fr.fromString(scope)),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_recordFact(
    [contractAddress]: ACVMField[],
    [scope]: ACVMField[],
    [entityType]: ACVMField[],
    [factType]: ACVMField[],
    [correlationKey]: ACVMField[],
    payload: ACVMField[],
    [hasOrigin]: ACVMField[],
    [originBlockNumber]: ACVMField[],
    [originBlockHash]: ACVMField[],
  ): Promise<ACVMField[]> {
    const origin = Fr.fromString(hasOrigin).toBigInt()
      ? { blockNumber: Fr.fromString(originBlockNumber).toNumber(), blockHash: Fr.fromString(originBlockHash) }
      : null;
    await this.handlerAsUtility().recordFact(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      AztecAddress.fromField(Fr.fromString(scope)),
      Fr.fromString(entityType),
      Fr.fromString(factType),
      Fr.fromString(correlationKey),
      payload.map(Fr.fromString),
      origin,
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_activeEntities(
    [contractAddress]: ACVMField[],
    [scope]: ACVMField[],
    [entityType]: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const keys = await this.handlerAsUtility().activeEntities(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      AztecAddress.fromField(Fr.fromString(scope)),
      Fr.fromString(entityType),
    );
    if (keys.length > FACT_MAX_ACTIVE_ENTITIES) {
      throw new Error(`Active entities count ${keys.length} exceeds max ${FACT_MAX_ACTIVE_ENTITIES}`);
    }
    // The Noir oracle returns the tuple `([Field; FACT_MAX_ACTIVE_ENTITIES], u32)`: storage array first, then length.
    const padded = padArrayEnd(keys, Fr.ZERO, FACT_MAX_ACTIVE_ENTITIES);
    return [padded.map(toACVMField), toACVMField(keys.length)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_loadCanonicalFacts(
    [contractAddress]: ACVMField[],
    [scope]: ACVMField[],
    [entityType]: ACVMField[],
    [correlationKey]: ACVMField[],
  ): Promise<ACVMField[][]> {
    const facts = await this.handlerAsUtility().loadCanonicalFacts(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      AztecAddress.fromField(Fr.fromString(scope)),
      Fr.fromString(entityType),
      Fr.fromString(correlationKey),
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
        flat.push(...padArrayEnd(fact.payload, Fr.ZERO, FACT_MAX_PAYLOAD));
      } else {
        flat.push(Fr.ZERO);
        flat.push(...Array<Fr>(FACT_MAX_PAYLOAD).fill(Fr.ZERO));
      }
    }
    return [flat.map(toACVMField)];
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_terminateEntity(
    [contractAddress]: ACVMField[],
    [scope]: ACVMField[],
    [entityType]: ACVMField[],
    [correlationKey]: ACVMField[],
  ): Promise<ACVMField[]> {
    await this.handlerAsUtility().terminateEntity(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      AztecAddress.fromField(Fr.fromString(scope)),
      Fr.fromString(entityType),
      Fr.fromString(correlationKey),
    );
    return [];
  }

  // eslint-disable-next-line camelcase
  aztec_utl_pushEphemeral([slot]: ACVMField[], elements: ACVMField[]): Promise<ACVMField[]> {
    const newLen = this.handlerAsUtility().pushEphemeral(Fr.fromString(slot), elements.map(Fr.fromString));
    return Promise.resolve([toACVMField(newLen)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_popEphemeral([slot]: ACVMField[]): Promise<ACVMField[][]> {
    const element = this.handlerAsUtility().popEphemeral(Fr.fromString(slot));
    return Promise.resolve([element.map(toACVMField)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeral([slot]: ACVMField[], [index]: ACVMField[]): Promise<ACVMField[][]> {
    const element = this.handlerAsUtility().getEphemeral(Fr.fromString(slot), Fr.fromString(index).toNumber());
    return Promise.resolve([element.map(toACVMField)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setEphemeral([slot]: ACVMField[], [index]: ACVMField[], elements: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsUtility().setEphemeral(
      Fr.fromString(slot),
      Fr.fromString(index).toNumber(),
      elements.map(Fr.fromString),
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeralLen([slot]: ACVMField[]): Promise<ACVMField[]> {
    const len = this.handlerAsUtility().getEphemeralLen(Fr.fromString(slot));
    return Promise.resolve([toACVMField(len)]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_removeEphemeral([slot]: ACVMField[], [index]: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsUtility().removeEphemeral(Fr.fromString(slot), Fr.fromString(index).toNumber());
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  aztec_utl_clearEphemeral([slot]: ACVMField[]): Promise<ACVMField[]> {
    this.handlerAsUtility().clearEphemeral(Fr.fromString(slot));
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_decryptAes128(
    ciphertextBVecStorage: ACVMField[],
    [ciphertextLength]: ACVMField[],
    iv: ACVMField[],
    symKey: ACVMField[],
  ): Promise<(ACVMField | ACVMField[])[]> {
    const ciphertext = fromUintBoundedVec(ciphertextBVecStorage, ciphertextLength, 8);
    const ivBuffer = fromUintArray(iv, 8);
    const symKeyBuffer = fromUintArray(symKey, 8);

    // Noir Option<BoundedVec> is encoded as [is_some: Field, storage: Field[], length: Field].
    try {
      const plaintext = await this.handlerAsUtility().decryptAes128(ciphertext, ivBuffer, symKeyBuffer);
      const [storage, length] = bufferToBoundedVec(plaintext, ciphertextBVecStorage.length);
      return [toACVMField(1), storage, length];
    } catch {
      const zeroStorage = Array(ciphertextBVecStorage.length).fill(toACVMField(0));
      return [toACVMField(0), zeroStorage, toACVMField(0)];
    }
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_getSharedSecret(
    [address]: ACVMField[],
    [ephPKField0]: ACVMField[],
    [ephPKField1]: ACVMField[],
    [ephPKField2]: ACVMField[],
    [contractAddress]: ACVMField[],
  ): Promise<ACVMField[]> {
    const secret = await this.handlerAsUtility().getSharedSecret(
      AztecAddress.fromField(Fr.fromString(address)),
      Point.fromFields([ephPKField0, ephPKField1, ephPKField2].map(Fr.fromString)),
      AztecAddress.fromField(Fr.fromString(contractAddress)),
    );
    return [toACVMField(secret)];
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setContractSyncCacheInvalid(
    [contractAddress]: ACVMField[],
    scopes: ACVMField[],
    [scopeCount]: ACVMField[],
  ): Promise<ACVMField[]> {
    const scopeAddresses = scopes.slice(0, +scopeCount).map(s => AztecAddress.fromField(Fr.fromString(s)));
    this.handlerAsUtility().setContractSyncCacheInvalid(
      AztecAddress.fromField(Fr.fromString(contractAddress)),
      scopeAddresses,
    );
    return Promise.resolve([]);
  }

  // eslint-disable-next-line camelcase
  async aztec_utl_emitOffchainEffect(data: ACVMField[]) {
    await this.handlerAsUtility().emitOffchainEffect(data.map(Fr.fromString));
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
