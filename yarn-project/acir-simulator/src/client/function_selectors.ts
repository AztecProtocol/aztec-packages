import { FUNCTION_SELECTOR_NUM_BYTES } from '@aztec/circuits.js';
import { computeFunctionSelector } from '@aztec/foundation/abi';

export const computeNoteHashAndNullifierSelector = computeFunctionSelector(
  'stev(field,field,array)',
  FUNCTION_SELECTOR_NUM_BYTES,
);
