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

    // Point serialization changes: old format includes is_infinite field, new format omits it.
    // Old getPublicKeysAndPartialAddress returns Option<[Field; 13]> with 4 keys as (x, y, is_infinite) + partial.
    // New _v2 returns Option<[Field; 9]> with 4 keys as (x, y) + partial.
    // eslint-disable-next-line camelcase
    aztec_utl_getPublicKeysAndPartialAddress: async (address: ACVMField[]): Promise<(ACVMField | ACVMField[])[]> => {
      const result = await oracle.aztec_utl_getPublicKeysAndPartialAddress_v2(address);
      // result is [some, [k0.x, k0.y, k1.x, k1.y, k2.x, k2.y, k3.x, k3.y, partial_address]]
      const some = result[0] as ACVMField;
      const fields = result[1] as ACVMField[];
      if (some === toACVMField(0)) {
        // The None case
        return [toACVMField(0), Array(13).fill(toACVMField(0))];
      }

      // Expand each key (x, y) → (x, y, is_infinite) where is_infinite = 1 if x == 0 && y == 0
      const expanded: ACVMField[] = [];
      for (let i = 0; i < 4; i++) {
        // With new Noir infinite point is represented simply as [0, 0] so if x and y are 0 we set the is_infinite flag
        // as 1, 0 otherwise.
        const x = fields[i * 2];
        const y = fields[i * 2 + 1];
        const isInfinite = toACVMField(x === toACVMField(0) && y === toACVMField(0) ? 1 : 0);
        expanded.push(x, y, isInfinite);
      }
      expanded.push(fields[8]); // partial_address
      return [some, expanded];
    },

    // Old getSharedSecret takes 5 args (address, ephPK.x, ephPK.y, ephPK.is_infinite, contractAddress).
    // New _v2 takes 4 args (without is_infinite).
    // eslint-disable-next-line camelcase
    aztec_utl_getSharedSecret: (
      address: ACVMField[],
      ephPKField0: ACVMField[],
      ephPKField1: ACVMField[],
      ephPKIsInfinite: ACVMField[],
      contractAddress: ACVMField[],
    ): Promise<ACVMField[]> => {
      if (
        ephPKIsInfinite[0] !== toACVMField(0) &&
        (ephPKField0[0] !== toACVMField(0) || ephPKField1[0] !== toACVMField(0))
      ) {
        // We throw an error in case isInfinite flag is 1 and x, y are non-zero as at that would be a bug and it would
        // not be possible to map the serialization from old Noir format (infinite point represented as [0, 0, 1]) to
        // new Noir format (infinite point represented simply as [0, 0]).
        throw new Error('Inconsistent ephemeral public key: is_infinite is set but x or y coordinates are non-zero');
      }
      return oracle.aztec_utl_getSharedSecret_v2(address, ephPKField0, ephPKField1, contractAddress);
    },

    // Old getContractInstance returns 16 fields: [salt, deployer, classId, initHash, 4×(x, y, is_infinite)].
    // New _v2 returns 12 fields: [salt, deployer, classId, initHash, 4×(x, y)].
    // eslint-disable-next-line camelcase
    aztec_utl_getContractInstance: async (address: ACVMField[]): Promise<ACVMField[]> => {
      const result = await oracle.aztec_utl_getContractInstance_v2(address);
      // result is [salt, deployer, classId, initHash, k0.x, k0.y, k1.x, k1.y, k2.x, k2.y, k3.x, k3.y]
      // Expand the public keys portion by inserting is_infinite after each (x, y) pair.
      const expanded: ACVMField[] = result.slice(0, 4); // salt, deployer, classId, initHash
      for (let i = 0; i < 4; i++) {
        const x = result[4 + i * 2];
        const y = result[4 + i * 2 + 1];
        const isInfinite = toACVMField(x === toACVMField(0) && y === toACVMField(0) ? 1 : 0);
        expanded.push(x, y, isInfinite);
      }
      return expanded;
    },

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
