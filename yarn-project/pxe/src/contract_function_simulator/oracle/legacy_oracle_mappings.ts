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
    utilityLog: (...args: ACVMField[][]) => oracle.aztec_utl_log(args[0], args[1], args[2], args[3]),
    utilityAssertCompatibleOracleVersion: (...args: ACVMField[][]) =>
      oracle.aztec_utl_assertCompatibleOracleVersion(args[0]),
    utilityLoadCapsule: (...args: ACVMField[][]) => oracle.aztec_utl_loadCapsule(args[0], args[1], args[2]),
    privateStoreInExecutionCache: (...args: ACVMField[][]) => oracle.aztec_prv_storeInExecutionCache(args[0], args[1]),
    privateLoadFromExecutionCache: (...args: ACVMField[][]) => oracle.aztec_prv_loadFromExecutionCache(args[0]),
    privateCallPrivateFunction: (...args: ACVMField[][]) =>
      oracle.aztec_prv_callPrivateFunction(args[0], args[1], args[2], args[3], args[4]),
    privateIsNullifierPending: (...args: ACVMField[][]) => oracle.aztec_prv_isNullifierPending(args[0], args[1]),
    privateNotifyCreatedNullifier: (...args: ACVMField[][]) => oracle.aztec_prv_notifyCreatedNullifier(args[0]),
    privateNotifyCreatedContractClassLog: (...args: ACVMField[][]) =>
      oracle.aztec_prv_notifyCreatedContractClassLog(args[0], args[1], args[2], args[3]),
    privateGetNextAppTagAsSender: (...args: ACVMField[][]) => oracle.aztec_prv_getNextAppTagAsSender(args[0], args[1]),
    privateGetSenderForTags: () => oracle.aztec_prv_getSenderForTags(),
    privateSetSenderForTags: (...args: ACVMField[][]) => oracle.aztec_prv_setSenderForTags(args[0]),
    utilityGetUtilityContext: () => oracle.aztec_utl_getUtilityContext(),
    utilityStorageRead: (...args: ACVMField[][]) => oracle.aztec_utl_storageRead(args[0], args[1], args[2], args[3]),
    utilityStoreCapsule: (...args: ACVMField[][]) => oracle.aztec_utl_storeCapsule(args[0], args[1], args[2]),
    utilityCopyCapsule: (...args: ACVMField[][]) => oracle.aztec_utl_copyCapsule(args[0], args[1], args[2], args[3]),
    utilityDeleteCapsule: (...args: ACVMField[][]) => oracle.aztec_utl_deleteCapsule(args[0], args[1]),
    utilityAes128Decrypt: (...args: ACVMField[][]) =>
      oracle.aztec_utl_aes128Decrypt(args[0], args[1], args[2], args[3]),
    utilityGetSharedSecret: (...args: ACVMField[][]) =>
      oracle.aztec_utl_getSharedSecret(args[0], args[1], args[2], args[3]),
    utilityFetchTaggedLogs: (...args: ACVMField[][]) => oracle.aztec_utl_fetchTaggedLogs(args[0]),
    utilityBulkRetrieveLogs: (...args: ACVMField[][]) => oracle.aztec_utl_bulkRetrieveLogs(args[0], args[1], args[2]),
    // Adapter: old 3-param signature → new 5-param with injected constants.
    // Values derived from: MAX_MESSAGE_CONTENT_LEN(11) - RESERVED_FIELDS (3 for notes, 1 for events).
    utilityValidateAndStoreEnqueuedNotesAndEvents: (
      contractAddress: ACVMField[],
      noteValidationRequestsArrayBaseSlot: ACVMField[],
      eventValidationRequestsArrayBaseSlot: ACVMField[],
    ) =>
      oracle.aztec_utl_validateAndStoreEnqueuedNotesAndEvents(
        contractAddress,
        noteValidationRequestsArrayBaseSlot,
        eventValidationRequestsArrayBaseSlot,
        [new Fr(8).toString()],
        [new Fr(10).toString()],
      ),
    utilityGetL1ToL2MembershipWitness: (...args: ACVMField[][]) =>
      oracle.aztec_utl_getL1ToL2MembershipWitness(args[0], args[1], args[2]),
    utilityCheckNullifierExists: (...args: ACVMField[][]) => oracle.aztec_utl_checkNullifierExists(args[0]),
    utilityGetRandomField: () => oracle.aztec_utl_getRandomField(),
    utilityEmitOffchainEffect: (...args: ACVMField[][]) => oracle.aztec_utl_emitOffchainEffect(args[0]),
    // Renames (same signature, different oracle name)
    privateNotifySetMinRevertibleSideEffectCounter: (...args: ACVMField[][]) =>
      oracle.aztec_prv_notifyRevertiblePhaseStart(args[0]),
    privateIsSideEffectCounterRevertible: (...args: ACVMField[][]) => oracle.aztec_prv_inRevertiblePhase(args[0]),
    // Signature changes: old 4-param oracles → new 1-param validatePublicCalldata
    privateNotifyEnqueuedPublicFunctionCall: (
      [_contractAddress]: ACVMField[],
      [calldataHash]: ACVMField[],
      [_sideEffectCounter]: ACVMField[],
      [_isStaticCall]: ACVMField[],
    ) => oracle.aztec_prv_validatePublicCalldata([calldataHash]),
    privateNotifySetPublicTeardownFunctionCall: (
      [_contractAddress]: ACVMField[],
      [calldataHash]: ACVMField[],
      [_sideEffectCounter]: ACVMField[],
      [_isStaticCall]: ACVMField[],
    ) => oracle.aztec_prv_validatePublicCalldata([calldataHash]),
  };
}
