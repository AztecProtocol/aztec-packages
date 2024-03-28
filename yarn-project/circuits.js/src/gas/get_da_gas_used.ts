import { arrayNonEmptyLength } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Tuple } from '@aztec/foundation/serialize';

import {
  DA_BYTES_PER_FIELD,
  DA_GAS_PER_BYTE,
  FIXED_DA_GAS,
  type MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  type MAX_NEW_NOTE_HASHES_PER_TX,
  type MAX_NEW_NULLIFIERS_PER_TX,
  type MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '../constants.gen.js';
import { GasUsed } from '../structs/gas_used.js';
import { PublicDataUpdateRequest } from '../structs/public_data_update_request.js';
import { SideEffect, SideEffectLinkedToNoteHash } from '../structs/side_effects.js';

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
export function getDAGasUsed(effect: {
  noteHashes: Tuple<SideEffect, typeof MAX_NEW_NOTE_HASHES_PER_TX>;
  nullifiers: Tuple<SideEffectLinkedToNoteHash, typeof MAX_NEW_NULLIFIERS_PER_TX>;
  l2ToL1Msgs: Tuple<Fr, typeof MAX_NEW_L2_TO_L1_MSGS_PER_TX>;
  publicDataUpdateRequests: Tuple<PublicDataUpdateRequest, typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>;
  encryptedLogPreimagesLength: number;
  unencryptedLogPreimagesLength: number;
}): GasUsed {
  const nonEmptyFields =
    arrayNonEmptyLength(effect.noteHashes, SideEffect.isEmpty) +
    arrayNonEmptyLength(effect.nullifiers, SideEffectLinkedToNoteHash.isEmpty) +
    arrayNonEmptyLength(effect.l2ToL1Msgs, Fr.isZero) +
    2 * arrayNonEmptyLength(effect.publicDataUpdateRequests, PublicDataUpdateRequest.isEmpty);

  const gasUsed =
    BigInt(FIXED_DA_GAS) +
    BigInt(DA_GAS_PER_BYTE) *
      BigInt(
        DA_BYTES_PER_FIELD * nonEmptyFields + effect.encryptedLogPreimagesLength + effect.unencryptedLogPreimagesLength,
      );

  return new GasUsed(gasUsed);
}

export const FixedDAGasUsed = new GasUsed(BigInt(FIXED_DA_GAS));
