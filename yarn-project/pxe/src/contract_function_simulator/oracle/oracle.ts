import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';

import { ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR } from '../../oracle_version.js';
import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { callHandler } from './oracle_registry.js';

export class UnavailableOracleError extends Error {
  constructor(oracleName: string) {
    super(`${oracleName} oracles not available with the current handler`);
  }
}

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

    // Wrap in a Proxy to intercept access to missing oracle names and provide enhanced error messages when the
    // contract's minor version is higher than the PXE's (i.e. the contract expects oracles that were added in a newer
    // minor version).
    const handler = this.handler;
    return new Proxy(callback, {
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
  aztec_utl_assertCompatibleOracleVersion(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_assertCompatibleOracleVersion',
      inputs,
      handler: ([major, minor]) => {
        this.handlerAsMisc().assertCompatibleOracleVersion(major, minor);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getRandomField(): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getRandomField',
      inputs: [],
      handler: () => this.handlerAsMisc().getRandomField(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_setHashPreimage(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_setHashPreimage',
      inputs,
      handler: ([values, hash]) => {
        this.handlerAsPrivate().setHashPreimage(values, hash);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getHashPreimage(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_getHashPreimage',
      inputs,
      handler: ([returnsHash]) => this.handlerAsPrivate().getHashPreimage(returnsHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getUtilityContext(): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getUtilityContext',
      inputs: [],
      handler: () => this.handlerAsUtility().getUtilityContext(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getKeyValidationRequest(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getKeyValidationRequest',
      inputs,
      handler: ([pkMHash]) => this.handlerAsUtility().getKeyValidationRequest(pkMHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getContractInstance(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getContractInstance',
      inputs,
      handler: ([address]) => this.handlerAsUtility().getContractInstance(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getNoteHashMembershipWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getNoteHashMembershipWitness',
      inputs,
      handler: ([anchorBlockHash, noteHash]) =>
        this.handlerAsUtility().getNoteHashMembershipWitness(anchorBlockHash, noteHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getBlockHashMembershipWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getBlockHashMembershipWitness',
      inputs,
      handler: ([anchorBlockHash, blockHash]) =>
        this.handlerAsUtility().getBlockHashMembershipWitness(anchorBlockHash, blockHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getNullifierMembershipWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getNullifierMembershipWitness',
      inputs,
      handler: ([blockHash, nullifier]) => this.handlerAsUtility().getNullifierMembershipWitness(blockHash, nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getLowNullifierMembershipWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getLowNullifierMembershipWitness',
      inputs,
      handler: ([blockHash, nullifier]) =>
        this.handlerAsUtility().getLowNullifierMembershipWitness(blockHash, nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPublicDataWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getPublicDataWitness',
      inputs,
      handler: ([blockHash, leafSlot]) => this.handlerAsUtility().getPublicDataWitness(blockHash, leafSlot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getBlockHeader(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getBlockHeader',
      inputs,
      handler: ([blockNumber]) => this.handlerAsUtility().getBlockHeader(blockNumber),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getAuthWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getAuthWitness',
      inputs,
      handler: ([messageHash]) => this.handlerAsUtility().getAuthWitness(messageHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPublicKeysAndPartialAddress(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getPublicKeysAndPartialAddress',
      inputs,
      handler: ([address]) => this.handlerAsUtility().getPublicKeysAndPartialAddress(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getNotes(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getNotes',
      inputs,
      handler: ([
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
        maxNotes,
        packedHintedNoteLength,
      ]) =>
        this.handlerAsUtility().getNotes(
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
          maxNotes,
          packedHintedNoteLength,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedNote(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_notifyCreatedNote',
      inputs,
      handler: ([owner, storageSlot, randomness, noteTypeId, note, noteHash, counter]) => {
        this.handlerAsPrivate().notifyCreatedNote(owner, storageSlot, randomness, noteTypeId, note, noteHash, counter);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyNullifiedNote(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_notifyNullifiedNote',
      inputs,
      handler: ([innerNullifier, noteHash, counter]) =>
        this.handlerAsPrivate().notifyNullifiedNote(innerNullifier, noteHash, counter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedNullifier(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_notifyCreatedNullifier',
      inputs,
      handler: ([innerNullifier]) => this.handlerAsPrivate().notifyCreatedNullifier(innerNullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_isNullifierPending(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_isNullifierPending',
      inputs,
      handler: ([innerNullifier, contractAddress]) =>
        this.handlerAsPrivate().isNullifierPending(innerNullifier, contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_doesNullifierExist(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_doesNullifierExist',
      inputs,
      handler: ([innerNullifier]) => this.handlerAsUtility().doesNullifierExist(innerNullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getL1ToL2MembershipWitness(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getL1ToL2MembershipWitness',
      inputs,
      handler: ([contractAddress, messageHash, secret]) =>
        this.handlerAsUtility().getL1ToL2MembershipWitness(contractAddress, messageHash, secret),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getFromPublicStorage(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getFromPublicStorage',
      inputs,
      handler: ([blockHash, contractAddress, startStorageSlot, numberOfElements]) =>
        this.handlerAsUtility().getFromPublicStorage(blockHash, contractAddress, startStorageSlot, numberOfElements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_callUtilityFunction(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_callUtilityFunction',
      inputs,
      handler: ([contractAddress, functionSelector, args]) =>
        this.handlerAsUtility().callUtilityFunction(contractAddress, functionSelector, args),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedContractClassLog(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_notifyCreatedContractClassLog',
      inputs,
      handler: ([log, counter]) => {
        this.handlerAsPrivate().notifyCreatedContractClassLog(log, counter);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_log(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_log',
      inputs,
      handler: ([level, message, _, fields]) => this.handlerAsMisc().log(level, message, fields),
    });
  }

  // This function's name is directly hardcoded in `circuit_recorder.ts`. Don't forget to update it there if you
  // change the name here.
  // eslint-disable-next-line camelcase
  aztec_prv_callPrivateFunction(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_callPrivateFunction',
      inputs,
      handler: ([contractAddress, functionSelector, argsHash, sideEffectCounter, isStaticCall]) =>
        this.handlerAsPrivate().callPrivateFunction(
          contractAddress,
          functionSelector,
          argsHash,
          sideEffectCounter,
          isStaticCall,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_assertValidPublicCalldata(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_assertValidPublicCalldata',
      inputs,
      handler: ([calldataHash]) => this.handlerAsPrivate().assertValidPublicCalldata(calldataHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyRevertiblePhaseStart(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_notifyRevertiblePhaseStart',
      inputs,
      handler: ([minRevertibleSideEffectCounter]) =>
        this.handlerAsPrivate().notifyRevertiblePhaseStart(minRevertibleSideEffectCounter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_isExecutionInRevertiblePhase(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_isExecutionInRevertiblePhase',
      inputs,
      handler: ([sideEffectCounter]) => this.handlerAsPrivate().isExecutionInRevertiblePhase(sideEffectCounter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getAppTaggingSecret(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_getAppTaggingSecret',
      inputs,
      handler: ([sender, recipient]) => this.handlerAsPrivate().getAppTaggingSecret(sender, recipient),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getNextTaggingIndex(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_getNextTaggingIndex',
      inputs,
      handler: ([secret, mode]) => this.handlerAsPrivate().getNextTaggingIndex(secret, mode),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPendingTaggedLogs(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getPendingTaggedLogs',
      inputs,
      handler: ([scope]) => this.handlerAsUtility().getPendingTaggedLogs(scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_validateAndStoreEnqueuedNotesAndEvents(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_validateAndStoreEnqueuedNotesAndEvents',
      inputs,
      handler: ([noteValidationRequests, eventValidationRequests, scope]) =>
        this.handlerAsUtility().validateAndStoreEnqueuedNotesAndEvents(
          noteValidationRequests,
          eventValidationRequests,
          scope,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getLogsByTag(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getLogsByTag',
      inputs,
      handler: ([requests]) => this.handlerAsUtility().getLogsByTag(requests),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getMessageContextsByTxHash(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getMessageContextsByTxHash',
      inputs,
      handler: ([requests]) => this.handlerAsUtility().getMessageContextsByTxHash(requests),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getTxEffect(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getTxEffect',
      inputs,
      handler: ([txHash]) => this.handlerAsUtility().getTxEffect(txHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setCapsule(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_setCapsule',
      inputs,
      handler: ([contractAddress, slot, capsule, scope]) => {
        this.handlerAsUtility().setCapsule(contractAddress, slot, capsule, scope);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getCapsule(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getCapsule',
      inputs,
      handler: ([contractAddress, slot, tSize, scope]) =>
        this.handlerAsUtility().getCapsule(contractAddress, slot, tSize, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_deleteCapsule(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_deleteCapsule',
      inputs,
      handler: ([contractAddress, slot, scope]) => {
        this.handlerAsUtility().deleteCapsule(contractAddress, slot, scope);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_copyCapsule(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_copyCapsule',
      inputs,
      handler: ([contractAddress, srcSlot, dstSlot, numEntries, scope]) =>
        this.handlerAsUtility().copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_pushEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_pushEphemeral',
      inputs,
      handler: ([slot, elements]) => this.handlerAsUtility().pushEphemeral(slot, elements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_popEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_popEphemeral',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().popEphemeral(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getEphemeral',
      inputs,
      handler: ([slot, index]) => this.handlerAsUtility().getEphemeral(slot, index),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_setEphemeral',
      inputs,
      handler: ([slot, index, elements]) => {
        this.handlerAsUtility().setEphemeral(slot, index, elements);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeralLen(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getEphemeralLen',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().getEphemeralLen(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_removeEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_removeEphemeral',
      inputs,
      handler: ([slot, index]) => {
        this.handlerAsUtility().removeEphemeral(slot, index);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_clearEphemeral(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_clearEphemeral',
      inputs,
      handler: ([slot]) => {
        this.handlerAsUtility().clearEphemeral(slot);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_decryptAes128(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_decryptAes128',
      inputs,
      handler: ([ciphertext, iv, symKey]) => this.handlerAsUtility().decryptAes128(ciphertext, iv, symKey),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getSharedSecrets(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_getSharedSecrets',
      inputs,
      handler: ([address, ephPks, contractAddress]) =>
        this.handlerAsUtility().getSharedSecrets(address, ephPks, contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setContractSyncCacheInvalid(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_setContractSyncCacheInvalid',
      inputs,
      handler: ([contractAddress, scopes]) => {
        this.handlerAsUtility().setContractSyncCacheInvalid(contractAddress, scopes);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_emitOffchainEffect(...inputs: ACVMField[][]): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_utl_emitOffchainEffect',
      inputs,
      handler: ([data]) => this.handlerAsUtility().emitOffchainEffect(data),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getSenderForTags(): Promise<(ACVMField | ACVMField[])[]> {
    return callHandler({
      oracle: 'aztec_prv_getSenderForTags',
      inputs: [],
      handler: () => this.handlerAsPrivate().getSenderForTags(),
    });
  }
}
