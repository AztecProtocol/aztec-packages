import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from '@aztec/pxe/simulator';

import type { IAvmExecutionOracle, ITxeExecutionOracle } from './oracle/interfaces.js';
import { callTxeHandler } from './oracle/txe_oracle_registry.js';
import type { TXESessionStateHandler } from './txe_session.js';
import type { ForeignCallArgs } from './utils/encoding.js';

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
  aztec_txe_assertCompatibleOracleVersion(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_assertCompatibleOracleVersion',
      inputs,
      handler: ([major, minor]) => {
        this.stateHandler.setTxeOracleVersion(major, minor);
      },
    });
  }

  // TXE session state transition functions - these get handled by the state handler

  // eslint-disable-next-line camelcase
  aztec_txe_setTopLevelTXEContext() {
    return callTxeHandler({
      oracle: 'aztec_txe_setTopLevelTXEContext',
      inputs: [],
      handler: () => this.stateHandler.enterTopLevelState(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_setPrivateTXEContext(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_setPrivateTXEContext',
      inputs,
      handler: ([contractAddress, anchorBlockNumber, gasSettings]) =>
        this.stateHandler.enterPrivateState(contractAddress, anchorBlockNumber, gasSettings),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_setPublicTXEContext(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_setPublicTXEContext',
      inputs,
      handler: ([contractAddress]) => this.stateHandler.enterPublicState(contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_setUtilityTXEContext(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_setUtilityTXEContext',
      inputs,
      handler: ([contractAddress]) => this.stateHandler.enterUtilityState(contractAddress),
    });
  }

  // Other oracles - these get handled by the oracle handler

  // TXE-specific oracles

  // eslint-disable-next-line camelcase
  aztec_txe_getDefaultAddress() {
    return callTxeHandler({
      oracle: 'aztec_txe_getDefaultAddress',
      inputs: [],
      handler: () => this.handlerAsTxe().getDefaultAddress(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getNextBlockNumber() {
    return callTxeHandler({
      oracle: 'aztec_txe_getNextBlockNumber',
      inputs: [],
      handler: () => this.handlerAsTxe().getNextBlockNumber(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getNextBlockTimestamp() {
    return callTxeHandler({
      oracle: 'aztec_txe_getNextBlockTimestamp',
      inputs: [],
      handler: () => this.handlerAsTxe().getNextBlockTimestamp(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_advanceBlocksBy(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_advanceBlocksBy',
      inputs,
      handler: ([blocks]) => this.handlerAsTxe().advanceBlocksBy(blocks),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_advanceTimestampBy(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_advanceTimestampBy',
      inputs,
      handler: ([duration]) => this.handlerAsTxe().advanceTimestampBy(duration),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_deploy(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_deploy',
      inputs,
      handler: ([contractPath, initializer, _, args, secret, salt, deployer]) =>
        this.handlerAsTxe().deploy(contractPath, initializer, args, secret, salt, deployer),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_createAccount(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_createAccount',
      inputs,
      handler: ([secret, partialAddress]) => this.handlerAsTxe().createAccount(secret, partialAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_addAccount(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_addAccount',
      inputs,
      handler: ([secret]) => this.handlerAsTxe().addAccount(secret),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_addAuthWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_addAuthWitness',
      inputs,
      handler: ([address, messageHash]) => this.handlerAsTxe().addAuthWitness(address, messageHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_sendL1ToL2Message(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_sendL1ToL2Message',
      inputs,
      handler: ([publicContentHash, privateContentHash, sender, recipient]) =>
        this.handlerAsTxe().sendL1ToL2Message(publicContentHash, privateContentHash, sender, recipient),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_setTaggingSecretStrategies(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_setTaggingSecretStrategies',
      inputs,
      handler: ([unconstrainedStrategy, constrainedStrategy]) =>
        this.handlerAsTxe().setTaggingSecretStrategies(unconstrainedStrategy, constrainedStrategy),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_setAuthorizeAllUtilityCallTargets(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_setAuthorizeAllUtilityCallTargets',
      inputs,
      handler: ([authorizeAll]) => this.handlerAsTxe().setAuthorizeAllUtilityCallTargets(authorizeAll),
    });
  }

  // PXE oracles

  // eslint-disable-next-line camelcase
  aztec_misc_assertCompatibleOracleVersion(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_misc_assertCompatibleOracleVersion',
      inputs,
      handler: ([major, minor]) => this.handlerAsMisc().assertCompatibleOracleVersion(major, minor),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_misc_getRandomField() {
    return callTxeHandler({
      oracle: 'aztec_misc_getRandomField',
      inputs: [],
      handler: () => this.handlerAsMisc().getRandomField(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastBlockTimestamp() {
    return callTxeHandler({
      oracle: 'aztec_txe_getLastBlockTimestamp',
      inputs: [],
      handler: () => this.handlerAsTxe().getLastBlockTimestamp(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastTxEffects() {
    return callTxeHandler({
      oracle: 'aztec_txe_getLastTxEffects',
      inputs: [],
      handler: () => this.handlerAsTxe().getLastTxEffects(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastCallOffchainEffects() {
    return callTxeHandler({
      oracle: 'aztec_txe_getLastCallOffchainEffects',
      inputs: [],
      handler: () => this.stateHandler.getLastCallOffchainEffects(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getLastCallContext() {
    return callTxeHandler({
      oracle: 'aztec_txe_getLastCallContext',
      inputs: [],
      handler: () => this.stateHandler.getLastCallContext(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_getPrivateEvents(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_getPrivateEvents',
      inputs,
      handler: ([selector, contractAddress, scope]) =>
        this.stateHandler.getPrivateEvents(selector, contractAddress, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_setHashPreimage(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_setHashPreimage',
      inputs,
      handler: ([values, hash]) => this.handlerAsPrivate().setHashPreimage(values, hash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getHashPreimage(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_getHashPreimage',
      inputs,
      handler: ([hash]) => this.handlerAsPrivate().getHashPreimage(hash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_misc_log(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_misc_log',
      inputs,
      handler: ([level, message, fieldsSize, fields]) => this.handlerAsMisc().log(level, message, fieldsSize, fields),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getFromPublicStorage(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getFromPublicStorage',
      inputs,
      handler: ([blockHash, contractAddress, startStorageSlot, numberOfElements]) =>
        this.handlerAsUtility().getFromPublicStorage(blockHash, contractAddress, startStorageSlot, numberOfElements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPublicDataWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getPublicDataWitness',
      inputs,
      handler: ([blockHash, leafSlot]) => this.handlerAsUtility().getPublicDataWitness(blockHash, leafSlot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getNotes(...inputs: ForeignCallArgs) {
    return callTxeHandler({
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
  aztec_prv_notifyCreatedNote(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_notifyCreatedNote',
      inputs,
      handler: ([owner, storageSlot, randomness, noteTypeId, note, noteHash, counter]) =>
        this.handlerAsPrivate().notifyCreatedNote(owner, storageSlot, randomness, noteTypeId, note, noteHash, counter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyNullifiedNote(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_notifyNullifiedNote',
      inputs,
      handler: ([innerNullifier, noteHash, counter]) =>
        this.handlerAsPrivate().notifyNullifiedNote(innerNullifier, noteHash, counter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyCreatedNullifier(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_notifyCreatedNullifier',
      inputs,
      handler: ([innerNullifier]) => this.handlerAsPrivate().notifyCreatedNullifier(innerNullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_isNullifierPending(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_isNullifierPending',
      inputs,
      handler: ([innerNullifier, contractAddress]) =>
        this.handlerAsPrivate().isNullifierPending(innerNullifier, contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_doesNullifierExist(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_doesNullifierExist',
      inputs,
      handler: ([innerNullifier]) => this.handlerAsUtility().doesNullifierExist(innerNullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getContractInstance(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getContractInstance',
      inputs,
      handler: ([address]) => this.handlerAsUtility().getContractInstance(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPublicKeysAndPartialAddress(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getPublicKeysAndPartialAddress',
      inputs,
      handler: ([address]) => this.handlerAsUtility().getPublicKeysAndPartialAddress(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getKeyValidationRequest(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getKeyValidationRequest',
      inputs,
      handler: ([pkMHash, keyIndex]) => this.handlerAsUtility().getKeyValidationRequest(pkMHash, keyIndex),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_callPrivateFunction(...inputs: ForeignCallArgs) {
    return callTxeHandler({
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
  aztec_utl_getNullifierMembershipWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getNullifierMembershipWitness',
      inputs,
      handler: ([blockHash, nullifier]) => this.handlerAsUtility().getNullifierMembershipWitness(blockHash, nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getL1ToL2MembershipWitnessV2(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getL1ToL2MembershipWitnessV2',
      inputs,
      handler: ([messageHash, nullifier]) =>
        this.handlerAsUtility().getL1ToL2MembershipWitnessV2(messageHash, nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getAuthWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getAuthWitness',
      inputs,
      handler: ([messageHash]) => this.handlerAsUtility().getAuthWitness(messageHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_assertValidPublicCalldata(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_assertValidPublicCalldata',
      inputs,
      handler: ([calldataHash]) => this.handlerAsPrivate().assertValidPublicCalldata(calldataHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_notifyRevertiblePhaseStart(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_notifyRevertiblePhaseStart',
      inputs,
      handler: ([minRevertibleSideEffectCounter]) =>
        this.handlerAsPrivate().notifyRevertiblePhaseStart(minRevertibleSideEffectCounter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_isExecutionInRevertiblePhase(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_isExecutionInRevertiblePhase',
      inputs,
      handler: ([sideEffectCounter]) => this.handlerAsPrivate().isExecutionInRevertiblePhase(sideEffectCounter),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getUtilityContext() {
    return callTxeHandler({
      oracle: 'aztec_utl_getUtilityContext',
      inputs: [],
      handler: () => this.handlerAsUtility().getUtilityContext(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getBlockHeader(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getBlockHeader',
      inputs,
      handler: ([blockNumber]) => this.handlerAsUtility().getBlockHeader(blockNumber),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getNoteHashMembershipWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getNoteHashMembershipWitness',
      inputs,
      handler: ([blockHash, noteHash]) => this.handlerAsUtility().getNoteHashMembershipWitness(blockHash, noteHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getBlockHashMembershipWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getBlockHashMembershipWitness',
      inputs,
      handler: ([anchorBlockHash, blockHash]) =>
        this.handlerAsUtility().getBlockHashMembershipWitness(anchorBlockHash, blockHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_areBlockHashesInArchive(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_areBlockHashesInArchive',
      inputs,
      handler: ([anchorBlockHash, blockHashes]) =>
        this.handlerAsUtility().areBlockHashesInArchive(anchorBlockHash, blockHashes),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getLowNullifierMembershipWitness(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getLowNullifierMembershipWitness',
      inputs,
      handler: ([blockHash, nullifier]) =>
        this.handlerAsUtility().getLowNullifierMembershipWitness(blockHash, nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getPendingTaggedLogsV2(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getPendingTaggedLogsV2',
      inputs,
      handler: ([scope, providedSecrets]) => this.handlerAsUtility().getPendingTaggedLogsV2(scope, providedSecrets),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_validateAndStoreEnqueuedNotesAndEvents(...inputs: ForeignCallArgs) {
    return callTxeHandler({
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
  aztec_utl_getLogsByTagV2(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getLogsByTagV2',
      inputs,
      handler: ([requestArrayBaseSlot]) => this.handlerAsUtility().getLogsByTagV2(requestArrayBaseSlot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getResolvedTxs(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getResolvedTxs',
      inputs,
      handler: ([requestArrayBaseSlot]) => this.handlerAsUtility().getResolvedTxs(requestArrayBaseSlot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getTxEffects(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getTxEffects',
      inputs,
      handler: ([txHashes]) => this.handlerAsUtility().getTxEffects(txHashes),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setCapsule(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_setCapsule',
      inputs,
      handler: ([contractAddress, slot, capsule, scope]) =>
        this.handlerAsUtility().setCapsule(contractAddress, slot, capsule, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getCapsule(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getCapsule',
      inputs,
      handler: ([contractAddress, slot, tSize, scope]) =>
        this.handlerAsUtility().getCapsule(contractAddress, slot, tSize, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_deleteCapsule(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_deleteCapsule',
      inputs,
      handler: ([contractAddress, slot, scope]) => this.handlerAsUtility().deleteCapsule(contractAddress, slot, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_copyCapsule(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_copyCapsule',
      inputs,
      handler: ([contractAddress, srcSlot, dstSlot, numEntries, scope]) =>
        this.handlerAsUtility().copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, scope),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_pushEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_pushEphemeral',
      inputs,
      handler: ([slot, elements]) => this.handlerAsUtility().pushEphemeral(slot, elements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_popEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_popEphemeral',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().popEphemeral(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getEphemeral',
      inputs,
      handler: ([slot, index]) => this.handlerAsUtility().getEphemeral(slot, index),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_setEphemeral',
      inputs,
      handler: ([slot, index, elements]) => this.handlerAsUtility().setEphemeral(slot, index, elements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getEphemeralLen(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getEphemeralLen',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().getEphemeralLen(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_removeEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_removeEphemeral',
      inputs,
      handler: ([slot, index]) => this.handlerAsUtility().removeEphemeral(slot, index),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_clearEphemeral(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_clearEphemeral',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().clearEphemeral(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_pushTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_pushTransient',
      inputs,
      handler: ([slot, elements]) => this.handlerAsUtility().pushTransient(slot, elements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_popTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_popTransient',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().popTransient(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getTransient',
      inputs,
      handler: ([slot, index]) => this.handlerAsUtility().getTransient(slot, index),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_setTransient',
      inputs,
      handler: ([slot, index, elements]) => this.handlerAsUtility().setTransient(slot, index, elements),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getTransientLen(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getTransientLen',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().getTransientLen(slot),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_removeTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_removeTransient',
      inputs,
      handler: ([slot, index]) => this.handlerAsUtility().removeTransient(slot, index),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_clearTransient(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_clearTransient',
      inputs,
      handler: ([slot]) => this.handlerAsUtility().clearTransient(slot),
    });
  }

  // TODO: I forgot to add a corresponding function here, when I introduced an oracle method to txe_oracle.ts.
  // The compiler didn't throw an error, so it took me a while to learn of the existence of this file, and that I need
  // to implement this function here. Isn't there a way to programmatically identify that this is missing, given the
  // existence of a txe_oracle method?
  // eslint-disable-next-line camelcase
  aztec_utl_decryptAes128(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_decryptAes128',
      inputs,
      handler: ([ciphertext, iv, symKey]) => this.handlerAsUtility().decryptAes128(ciphertext, iv, symKey),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getSharedSecrets(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getSharedSecrets',
      inputs,
      handler: ([address, ephPksSlot, contractAddress]) =>
        this.handlerAsUtility().getSharedSecrets(address, ephPksSlot, contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_setContractSyncCacheInvalid(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_setContractSyncCacheInvalid',
      inputs,
      handler: ([contractAddress, scopes]) =>
        this.handlerAsUtility().setContractSyncCacheInvalid(contractAddress, scopes),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_emitOffchainEffect(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_emitOffchainEffect',
      inputs,
      handler: ([data]) => {
        // Record the raw payload against the currently-executing top-level call. The Noir side
        // (via `env.offchain_messages()`) is responsible for decoding the protocol-reserved prefix
        // (`OFFCHAIN_MESSAGE_IDENTIFIER`, recipient) and turning each payload into an `OffchainMessage` struct suitable
        // for `offchain_receive`.
        this.stateHandler.recordOffchainEffect(data);
      },
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_recordFact(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_recordFact',
      inputs,
      handler: ([contractAddress, scope, factCollectionTypeId, factCollectionId, factTypeId, payload, originBlock]) =>
        this.handlerAsUtility().recordFact(
          contractAddress,
          scope,
          factCollectionTypeId,
          factCollectionId,
          factTypeId,
          payload,
          originBlock,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_deleteFactCollection(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_deleteFactCollection',
      inputs,
      handler: ([contractAddress, scope, factCollectionTypeId, factCollectionId]) =>
        this.handlerAsUtility().deleteFactCollection(contractAddress, scope, factCollectionTypeId, factCollectionId),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getFactCollection(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getFactCollection',
      inputs,
      handler: ([contractAddress, scope, factCollectionTypeId, factCollectionId]) =>
        this.handlerAsUtility().getFactCollection(contractAddress, scope, factCollectionTypeId, factCollectionId),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_getFactCollectionsByType(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_getFactCollectionsByType',
      inputs,
      handler: ([contractAddress, scope, factCollectionTypeId]) =>
        this.handlerAsUtility().getFactCollectionsByType(contractAddress, scope, factCollectionTypeId),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_utl_callUtilityFunction(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_utl_callUtilityFunction',
      inputs,
      handler: ([contractAddress, functionSelector, args]) =>
        this.handlerAsUtility().callUtilityFunction(contractAddress, functionSelector, args),
    });
  }

  // AVM opcodes

  // eslint-disable-next-line camelcase
  aztec_avm_emitPublicLog() {
    return callTxeHandler({
      oracle: 'aztec_avm_emitPublicLog',
      inputs: [],
      // TODO(#8811): Implement
      handler: () => {},
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_storageRead(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_storageRead',
      inputs,
      handler: ([slot, contractAddress]) => this.handlerAsAvm().storageRead(slot, contractAddress),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_storageWrite(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_storageWrite',
      inputs,
      handler: ([slot, value]) => this.handlerAsAvm().storageWrite(slot, value),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_getContractInstanceDeployer(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_getContractInstanceDeployer',
      inputs,
      handler: ([address]) => this.handlerAsAvm().getContractInstanceDeployer(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_getContractInstanceClassId(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_getContractInstanceClassId',
      inputs,
      handler: ([address]) => this.handlerAsAvm().getContractInstanceClassId(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_getContractInstanceInitializationHash(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_getContractInstanceInitializationHash',
      inputs,
      handler: ([address]) => this.handlerAsAvm().getContractInstanceInitializationHash(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_getContractInstanceImmutablesHash(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_getContractInstanceImmutablesHash',
      inputs,
      handler: ([address]) => this.handlerAsAvm().getContractInstanceImmutablesHash(address),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_sender() {
    return callTxeHandler({
      oracle: 'aztec_avm_sender',
      inputs: [],
      handler: () => this.handlerAsAvm().sender(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_emitNullifier(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_emitNullifier',
      inputs,
      handler: ([nullifier]) => this.handlerAsAvm().emitNullifier(nullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_emitNoteHash(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_emitNoteHash',
      inputs,
      handler: ([noteHash]) => this.handlerAsAvm().emitNoteHash(noteHash),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_nullifierExists(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_nullifierExists',
      inputs,
      handler: ([siloedNullifier]) => this.handlerAsAvm().nullifierExists(siloedNullifier),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_address() {
    return callTxeHandler({
      oracle: 'aztec_avm_address',
      inputs: [],
      handler: () => this.handlerAsAvm().address(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_blockNumber() {
    return callTxeHandler({
      oracle: 'aztec_avm_blockNumber',
      inputs: [],
      handler: () => this.handlerAsAvm().blockNumber(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_timestamp() {
    return callTxeHandler({
      oracle: 'aztec_avm_timestamp',
      inputs: [],
      handler: () => this.handlerAsAvm().timestamp(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_isStaticCall() {
    return callTxeHandler({
      oracle: 'aztec_avm_isStaticCall',
      inputs: [],
      handler: () => this.handlerAsAvm().isStaticCall(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_chainId() {
    return callTxeHandler({
      oracle: 'aztec_avm_chainId',
      inputs: [],
      handler: () => this.handlerAsAvm().chainId(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_version() {
    return callTxeHandler({
      oracle: 'aztec_avm_version',
      inputs: [],
      handler: () => this.handlerAsAvm().version(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_returndataSize() {
    return callTxeHandler({
      oracle: 'aztec_avm_returndataSize',
      inputs: [],
      handler: () => this.handlerAsAvm().returndataSize(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_returndataCopy(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_returndataCopy',
      inputs,
      handler: ([rdOffset, copySize]) => this.handlerAsAvm().returndataCopy(rdOffset, copySize),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_call(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_call',
      inputs,
      handler: ([l2Gas, daGas, address, argsLength, args]) =>
        this.handlerAsAvm().call(l2Gas, daGas, address, argsLength, args),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_staticCall(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_avm_staticCall',
      inputs,
      handler: ([l2Gas, daGas, address, argsLength, args]) =>
        this.handlerAsAvm().staticCall(l2Gas, daGas, address, argsLength, args),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_avm_successCopy() {
    return callTxeHandler({
      oracle: 'aztec_avm_successCopy',
      inputs: [],
      handler: () => this.handlerAsAvm().successCopy(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_privateCallNewFlow(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_privateCallNewFlow',
      inputs,
      handler: ([
        from,
        targetContractAddress,
        functionSelector,
        args,
        argsHash,
        isStaticCall,
        additionalScopes,
        authorizedUtilityCallTargets,
        gasSettings,
      ]) =>
        this.stateHandler.executePrivateCall(
          from,
          targetContractAddress,
          functionSelector,
          args,
          argsHash,
          isStaticCall,
          additionalScopes,
          authorizedUtilityCallTargets,
          gasSettings,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_executeUtilityFunction(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_executeUtilityFunction',
      inputs,
      handler: ([from, targetContractAddress, functionSelector, args, authorizedUtilityCallTargets]) =>
        this.stateHandler.executeUtilityFunction(
          from,
          targetContractAddress,
          functionSelector,
          args,
          authorizedUtilityCallTargets,
        ),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_txe_publicCallNewFlow(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_txe_publicCallNewFlow',
      inputs,
      handler: ([from, address, calldata, isStaticCall, gasSettings]) =>
        this.stateHandler.executePublicCall(from, address, calldata, isStaticCall, gasSettings),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getSenderForTags() {
    return callTxeHandler({
      oracle: 'aztec_prv_getSenderForTags',
      inputs: [],
      handler: () => this.handlerAsPrivate().getSenderForTags(),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_resolveTaggingStrategy(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_resolveTaggingStrategy',
      inputs,
      handler: ([sender, recipient, deliveryMode]) =>
        this.handlerAsPrivate().resolveTaggingStrategy(sender, recipient, deliveryMode),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_resolveCustomRequest(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_resolveCustomRequest',
      inputs,
      handler: ([kind, payload]) => this.handlerAsPrivate().resolveCustomRequest(kind, payload),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getAppTaggingSecret(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_getAppTaggingSecret',
      inputs,
      handler: ([sender, recipient]) => this.handlerAsPrivate().getAppTaggingSecret(sender, recipient),
    });
  }

  // eslint-disable-next-line camelcase
  aztec_prv_getNextTaggingIndex(...inputs: ForeignCallArgs) {
    return callTxeHandler({
      oracle: 'aztec_prv_getNextTaggingIndex',
      inputs,
      handler: ([secret, deliveryMode]) => this.handlerAsPrivate().getNextTaggingIndex(secret, deliveryMode),
    });
  }
}
