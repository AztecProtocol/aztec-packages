import { Fr, GasUsed, RevertCode } from '@aztec/circuits.js';
import { arrayNonEmptyLength } from '@aztec/foundation/collection';

import { PublicDataWrite } from './public_data_write.js';
import { GasProfiler, GasType, ITxEffectWithoutGasUsed, TxEffect, TxEffectFactory } from './tx_effect.js';

export const DA_BYTE_GAS = 16n;

export const FIXED_BYTES = // 17 bytes
  GasUsed.PACKED_SIZE_IN_BYTES + // da_gas_used
  GasUsed.PACKED_SIZE_IN_BYTES + // compute_gas_used
  RevertCode.PACKED_SIZE_IN_BYTES; // revert_code

export const FIXED_DA_GAS = FIXED_BYTES * DA_BYTE_GAS; // 272n

const getComputeGasUsed = (_effect: ITxEffectWithoutGasUsed) => {
  // Just a dummy for now
  return new GasUsed(1n);
};

/**
 * Note. This does not exactly match ethereum calldata cost.
 * It is correlated, but simplified to ease circuit calculations:
 * We don't want to bitwise deconstruct the calldata to count the non-zero bytes in the circuit.
 *
 * We overcompensate by
 * - assuming our FIXED_BYTE "header" is always non-zero.
 * - assuming there is no zero byte in any non-zero field
 *
 * We undercompensate by
 * - not counting the bytes used to store the lengths of the various arrays
 *
 * @param effect the TxEffect to calculate the DA gas used for
 * @returns our interpretation of the DA gas used
 */
const getDAGasUsed = (effect: ITxEffectWithoutGasUsed) => {
  const nonEmptyFields =
    arrayNonEmptyLength(effect.noteHashes, Fr.isZero) +
    arrayNonEmptyLength(effect.nullifiers, Fr.isZero) +
    arrayNonEmptyLength(effect.l2ToL1Msgs, Fr.isZero) +
    2 * arrayNonEmptyLength(effect.publicDataWrites, PublicDataWrite.isEmpty);

  const gasUsed =
    FIXED_DA_GAS +
    DA_BYTE_GAS *
      BigInt(
        Fr.SIZE_IN_BYTES * nonEmptyFields +
          effect.encryptedLogs.getSerializedLength() +
          effect.unencryptedLogs.getSerializedLength(),
      );

  return new GasUsed(gasUsed);
};

const gasProfiler: GasProfiler = (effect: ITxEffectWithoutGasUsed) => {
  return {
    [GasType.DA]: getDAGasUsed(effect),
    [GasType.COMPUTE]: getComputeGasUsed(effect),
  };
};

export const CalldataTxEffectFactory: TxEffectFactory = {
  gasProfiler,
  build(effect: ITxEffectWithoutGasUsed) {
    const { [GasType.DA]: daGasUsed, [GasType.COMPUTE]: computeGasUsed } = this.gasProfiler(effect);
    return new TxEffect(
      daGasUsed,
      computeGasUsed,
      effect.revertCode,
      effect.noteHashes,
      effect.nullifiers,
      effect.l2ToL1Msgs,
      effect.publicDataWrites,
      effect.encryptedLogs,
      effect.unencryptedLogs,
    );
  },
};
