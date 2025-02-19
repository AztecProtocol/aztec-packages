import { SCHEDULED_DELAY_CHANGE_PCKD_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

export * from './scheduled_delay_change.js';
export * from './scheduled_value_change.js';

export function computeSharedMutableHashSlot(sharedMutableSlot: Fr, valueChangeLen: number) {
  // hash is stored after the value change and the delay change
  return sharedMutableSlot.add(new Fr(valueChangeLen + SCHEDULED_DELAY_CHANGE_PCKD_LEN));
}
