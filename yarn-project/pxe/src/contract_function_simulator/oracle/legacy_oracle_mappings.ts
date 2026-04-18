import { toACVMField } from '@aztec/simulator/client';
import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Oracle } from './oracle.js';

/**
 * Builds legacy oracle name callbacks for pinned protocol contracts whose artifacts are committed and cannot be
 * changed.
 * TODO(F-416): Remove these aliases on v5 when protocol contracts are redeployed.
 */
export function buildLegacyOracleCallbacks(oracle: Oracle): ACIRCallback {
  // If you are about to add a new mapping ensure that the old oracle name is different from the new one - this can
  // commonly occur when only the args are getting modified.
  return {
    // Simple prefix renames (privateXxx/utilityXxx → aztec_prv_/aztec_utl_)
    utilityLog: (
      level: ACVMField[],
      message: ACVMField[],
      _ignoredFieldsSize: ACVMField[],
      fields: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_utl_log(level, message, _ignoredFieldsSize, fields),
    utilityAssertCompatibleOracleVersion: (version: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_assertCompatibleOracleVersionV2(version, [toACVMField(0)]),
    // Old 1-arg oracle before minor/major split. Maps to V2 with minor=0.
    // eslint-disable-next-line camelcase
    aztec_utl_assertCompatibleOracleVersion: (version: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_assertCompatibleOracleVersionV2(version, [toACVMField(0)]),
    utilityLoadCapsule: (
      contractAddress: ACVMField[],
      slot: ACVMField[],
      tSize: ACVMField[],
    ): Promise<(ACVMField | ACVMField[])[]> =>
      oracle.aztec_utl_getCapsule(contractAddress, slot, tSize, [toACVMField(AztecAddress.ZERO)]),
    privateStoreInExecutionCache: (values: ACVMField[], hash: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_setHashPreimage(values, hash),
    privateLoadFromExecutionCache: (returnsHash: ACVMField[]): Promise<ACVMField[][]> =>
      oracle.aztec_prv_getHashPreimage(returnsHash),
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
      oracle.aztec_utl_getFromPublicStorage(blockHash, contractAddress, startStorageSlot, numberOfElements),
    utilityStoreCapsule: (
      contractAddress: ACVMField[],
      slot: ACVMField[],
      capsule: ACVMField[],
    ): Promise<ACVMField[]> =>
      oracle.aztec_utl_setCapsule(contractAddress, slot, capsule, [toACVMField(AztecAddress.ZERO)]),
    utilityCopyCapsule: (
      contractAddress: ACVMField[],
      srcSlot: ACVMField[],
      dstSlot: ACVMField[],
      numEntries: ACVMField[],
    ): Promise<ACVMField[]> =>
      oracle.aztec_utl_copyCapsule(contractAddress, srcSlot, dstSlot, numEntries, [toACVMField(AztecAddress.ZERO)]),
    utilityDeleteCapsule: (contractAddress: ACVMField[], slot: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_utl_deleteCapsule(contractAddress, slot, [toACVMField(AztecAddress.ZERO)]),
    utilityGetL1ToL2MembershipWitness: (
      contractAddress: ACVMField[],
      messageHash: ACVMField[],
      secret: ACVMField[],
    ): Promise<(ACVMField | ACVMField[])[]> =>
      oracle.aztec_utl_getL1ToL2MembershipWitness(contractAddress, messageHash, secret),
    // Renames (same signature, different oracle name)
    privateNotifySetMinRevertibleSideEffectCounter: (counter: ACVMField[]): Promise<ACVMField[]> =>
      oracle.aztec_prv_notifyRevertiblePhaseStart(counter),
    // Signature changes: old 4-param oracles → new 1-param validatePublicCalldata
    privateNotifyEnqueuedPublicFunctionCall: (
      _contractAddress: ACVMField[],
      calldataHash: ACVMField[],
      _sideEffectCounter: ACVMField[],
      _isStaticCall: ACVMField[],
    ): Promise<ACVMField[]> => oracle.aztec_prv_assertValidPublicCalldata(calldataHash),
  };
}
