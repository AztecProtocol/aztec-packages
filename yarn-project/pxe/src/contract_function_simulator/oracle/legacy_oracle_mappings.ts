import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';

import type { Oracle } from './oracle.js';

/**
 * Builds legacy oracle name callbacks for pinned protocol contracts whose artifacts are committed and cannot be
 * changed.
 * TODO(F-416): Remove these aliases on v5 when protocol contracts are redeployed.
 *
 * NOTE: On v4-next the oracle methods have NOT been renamed to aztec_utl_/aztec_prv_ prefixes yet, so these
 * entries map old names to the same old names (which are the current method names). They are kept for
 * forward-compatibility in case the rename lands on this branch.
 */
export function buildLegacyOracleCallbacks(oracle: Oracle): ACIRCallback {
  return {
    // Simple prefix renames (on v4-next these are identity mappings since methods haven't been renamed)
    utilityLog: (...args: ACVMField[][]) => oracle.utilityLog(args[0], args[1], args[2], args[3]),
    utilityAssertCompatibleOracleVersion: (...args: ACVMField[][]) =>
      oracle.utilityAssertCompatibleOracleVersion(args[0]),
    utilityLoadCapsule: (...args: ACVMField[][]) => oracle.utilityLoadCapsule(args[0], args[1], args[2]),
    privateStoreInExecutionCache: (...args: ACVMField[][]) => oracle.privateStoreInExecutionCache(args[0], args[1]),
    privateLoadFromExecutionCache: (...args: ACVMField[][]) => oracle.privateLoadFromExecutionCache(args[0]),
    privateCallPrivateFunction: (...args: ACVMField[][]) =>
      oracle.privateCallPrivateFunction(args[0], args[1], args[2], args[3], args[4]),
    privateIsNullifierPending: (...args: ACVMField[][]) => oracle.privateIsNullifierPending(args[0], args[1]),
    privateNotifyCreatedNullifier: (...args: ACVMField[][]) => oracle.privateNotifyCreatedNullifier(args[0]),
    privateNotifyCreatedContractClassLog: (...args: ACVMField[][]) =>
      oracle.privateNotifyCreatedContractClassLog(args[0], args[1], args[2], args[3]),
    privateGetNextAppTagAsSender: (...args: ACVMField[][]) => oracle.privateGetNextAppTagAsSender(args[0], args[1]),
    privateGetSenderForTags: () => oracle.privateGetSenderForTags(),
    privateSetSenderForTags: (...args: ACVMField[][]) => oracle.privateSetSenderForTags(args[0]),
    utilityGetUtilityContext: () => oracle.utilityGetUtilityContext(),
    utilityStorageRead: (...args: ACVMField[][]) => oracle.utilityStorageRead(args[0], args[1], args[2], args[3]),
    utilityStoreCapsule: (...args: ACVMField[][]) => oracle.utilityStoreCapsule(args[0], args[1], args[2]),
    utilityCopyCapsule: (...args: ACVMField[][]) => oracle.utilityCopyCapsule(args[0], args[1], args[2], args[3]),
    utilityDeleteCapsule: (...args: ACVMField[][]) => oracle.utilityDeleteCapsule(args[0], args[1]),
    utilityAes128Decrypt: (...args: ACVMField[][]) =>
      oracle.utilityAes128Decrypt(args[0], args[1], args[2], args[3]),
    utilityGetSharedSecret: (...args: ACVMField[][]) =>
      oracle.utilityGetSharedSecret(args[0], args[1], args[2], args[3]),
    utilityFetchTaggedLogs: (...args: ACVMField[][]) => oracle.utilityFetchTaggedLogs(args[0]),
    utilityBulkRetrieveLogs: (...args: ACVMField[][]) => oracle.utilityBulkRetrieveLogs(args[0], args[1], args[2]),
    utilityValidateAndStoreEnqueuedNotesAndEvents: (...args: ACVMField[][]) =>
      oracle.utilityValidateAndStoreEnqueuedNotesAndEvents(args[0], args[1], args[2]),
    utilityGetL1ToL2MembershipWitness: (...args: ACVMField[][]) =>
      oracle.utilityGetL1ToL2MembershipWitness(args[0], args[1], args[2]),
    utilityCheckNullifierExists: (...args: ACVMField[][]) => oracle.utilityCheckNullifierExists(args[0]),
    utilityGetRandomField: () => oracle.utilityGetRandomField(),
    utilityEmitOffchainEffect: (...args: ACVMField[][]) => oracle.utilityEmitOffchainEffect(args[0]),
    // On v4-next, the #21209 renames (privateNotifySetMinRevertibleSideEffectCounter →
    // notifyRevertiblePhaseStart, etc.) and signature changes (4-param → 1-param validatePublicCalldata)
    // have NOT landed, so those legacy mappings are not needed here.
  };
}
