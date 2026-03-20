import { Fr } from '@aztec/foundation/curves/bn254';
import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';

import type { Oracle } from './oracle.js';

/**
 * Builds legacy oracle name callbacks for pinned protocol contracts whose artifacts are committed and cannot be
 * changed.
 * TODO(F-416): Remove these aliases on v5 when protocol contracts are redeployed.
 */
export function buildLegacyOracleCallbacks(oracle: Oracle): ACIRCallback {
  return {
    // Simple prefix renames (privateXxx/utilityXxx → aztec_prv_/aztec_utl_)
    utilityLog: (
      level: ACVMField[],
      message: ACVMField[],
      _ignoredFieldsSize: ACVMField[],
      fields: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_utl_log(level, message, _ignoredFieldsSize, fields),
    utilityAssertCompatibleOracleVersion: (version: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_assertCompatibleOracleVersion(version),
    utilityLoadCapsule: (
      contractAddress: ACVMField[],
      slot: ACVMField[],
      tSize: ACVMField[],
    ): Promise<(ACVMField | ACVMField[])[]> => oracle.aztec_utl_loadCapsule(contractAddress, slot, tSize),
    privateStoreInExecutionCache: (values: ACVMField[], hash: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_storeInExecutionCache(values, hash),
    privateLoadFromExecutionCache: (returnsHash: ACVMField[]): Promise<ACVMField[][]> =>
      oracle.aztec_prv_loadFromExecutionCache(returnsHash),
    privateCallPrivateFunction: (
      contractAddress: ACVMField[],
      functionSelector: ACVMField[],
      argsHash: ACVMField[],
      sideEffectCounter: ACVMField[],
      isStaticCall: ACVMField[],
    ): Promise<ACVMField[][]> =>
      oracle.aztec_prv_callPrivateFunction(
        contractAddress,
        functionSelector,
        argsHash,
        sideEffectCounter,
        isStaticCall,
      ),
    privateIsNullifierPending: (innerNullifier: ACVMField[], contractAddress: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_isNullifierPending(innerNullifier, contractAddress),
    privateNotifyCreatedNullifier: (innerNullifier: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_notifyCreatedNullifier(innerNullifier),
    privateNotifyCreatedContractClassLog: (
      contractAddress: ACVMField[],
      message: ACVMField[],
      length: ACVMField[],
      counter: ACVMField[],
    ): Promise<ACVMField[]> =>
      oracle.aztec_prv_notifyCreatedContractClassLog(contractAddress, message, length, counter),
    utilityGetUtilityContext: (): Promise<(ACVMField | ACVMField[])[]> => oracle.aztec_utl_getUtilityContext(),
    utilityStorageRead: (
      blockHash: ACVMField[],
      contractAddress: ACVMField[],
      startStorageSlot: ACVMField[],
      numberOfElements: ACVMField[],
    ): Promise<ACVMField[][]> =>
      oracle.aztec_utl_storageRead(blockHash, contractAddress, startStorageSlot, numberOfElements),
    utilityStoreCapsule: (
      contractAddress: ACVMField[],
      slot: ACVMField[],
      capsule: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_utl_storeCapsule(contractAddress, slot, capsule),
    utilityCopyCapsule: (
      contractAddress: ACVMField[],
      srcSlot: ACVMField[],
      dstSlot: ACVMField[],
      numEntries: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_utl_copyCapsule(contractAddress, srcSlot, dstSlot, numEntries),
    utilityDeleteCapsule: (contractAddress: ACVMField[], slot: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_deleteCapsule(contractAddress, slot),
    utilityGetSharedSecret: (
      address: ACVMField[],
      ephPKField0: ACVMField[],
      ephPKField1: ACVMField[],
      ephPKField2: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_utl_getSharedSecret(address, ephPKField0, ephPKField1, ephPKField2),
    utilityFetchTaggedLogs: (pendingTaggedLogArrayBaseSlot: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_fetchTaggedLogs(pendingTaggedLogArrayBaseSlot),
    utilityBulkRetrieveLogs: (
      contractAddress: ACVMField[],
      logRetrievalRequestsArrayBaseSlot: ACVMField[],
      logRetrievalResponsesArrayBaseSlot: ACVMField[],
    ): Promise<ACVMField[]> =>
      oracle.aztec_utl_bulkRetrieveLogs(
        contractAddress,
        logRetrievalRequestsArrayBaseSlot,
        logRetrievalResponsesArrayBaseSlot,
      ),
    utilityGetL1ToL2MembershipWitness: (
      contractAddress: ACVMField[],
      messageHash: ACVMField[],
      secret: ACVMField[],
    ): Promise<(ACVMField | ACVMField[])[]> =>
      oracle.aztec_utl_getL1ToL2MembershipWitness(contractAddress, messageHash, secret),
    utilityEmitOffchainEffect: (data: ACVMField[]): Promise<ACVMField[]> => oracle.aztec_utl_emitOffchainEffect(data),
    // Adapter: old 3-param signature → new 5-param with injected constants.
    // Values derived from: MAX_MESSAGE_CONTENT_LEN(11) - RESERVED_FIELDS (3 for notes, 1 for events).
    utilityValidateAndStoreEnqueuedNotesAndEvents: (
      contractAddress: ACVMField[],
      noteValidationRequestsArrayBaseSlot: ACVMField[],
      eventValidationRequestsArrayBaseSlot: ACVMField[],
    ): Promise<ACVMField[]> =>
      oracle.aztec_utl_validateAndStoreEnqueuedNotesAndEvents(
        contractAddress,
        noteValidationRequestsArrayBaseSlot,
        eventValidationRequestsArrayBaseSlot,
        [new Fr(8).toString()],
        [new Fr(10).toString()],
      ),
    // Renames (same signature, different oracle name)
    privateNotifySetMinRevertibleSideEffectCounter: (counter: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_notifyRevertiblePhaseStart(counter),
    privateIsSideEffectCounterRevertible: (sideEffectCounter: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_inRevertiblePhase(sideEffectCounter),
    // Signature changes: old 4-param oracles → new 1-param validatePublicCalldata
    privateNotifyEnqueuedPublicFunctionCall: (
      _contractAddress: ACVMField[],
      calldataHash: ACVMField[],
      _sideEffectCounter: ACVMField[],
      _isStaticCall: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_prv_validatePublicCalldata(calldataHash),
    privateNotifySetPublicTeardownFunctionCall: (
      _contractAddress: ACVMField[],
      calldataHash: ACVMField[],
      _sideEffectCounter: ACVMField[],
      _isStaticCall: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_prv_validatePublicCalldata(calldataHash),
  };
}
