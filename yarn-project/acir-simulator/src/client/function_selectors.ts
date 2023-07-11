import { FUNCTION_SELECTOR_NUM_BYTES } from '@aztec/circuits.js';
import { computeFunctionSelector } from '@aztec/foundation/abi';

export const computeNoteHashSelector = computeFunctionSelector(
  'compute_note_hash(field,array)',
  FUNCTION_SELECTOR_NUM_BYTES,
);

export const computeNullifierSelector = computeFunctionSelector(
  'compute_nullifier(field,array)',
  FUNCTION_SELECTOR_NUM_BYTES,
);
