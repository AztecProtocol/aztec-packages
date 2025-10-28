import { Fr } from '@aztec/foundation/fields';

import { getBlockBlobFields } from '../block/body.js';
import type { TxEffect } from '../tx/tx_effect.js';

export function getCheckpointBlobFields(txEffectsInBlocks: TxEffect[][]) {
  const blockBlobFields = txEffectsInBlocks.map(blockTxEffects => getBlockBlobFields(blockTxEffects)).flat();
  const totalNumBlobFields = blockBlobFields.length + 1; // +1 for the prefix indicating the number of total blob fields in a checkpoint.
  return [new Fr(totalNumBlobFields)].concat(blockBlobFields);
}
