import { UPDATED_CLASS_IDS_SLOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';
import { deriveStorageSlotInMap } from '../hash/map_slot.js';
import { DELAYED_PUBLIC_MUTABLE_VALUES_LEN, DelayedPublicMutableValues } from './delayed_public_mutable_values.js';
import { ScheduledDelayChange } from './scheduled_delay_change.js';
import { ScheduledValueChange } from './scheduled_value_change.js';

export class DelayedPublicMutableValuesWithHash {
  private smv: DelayedPublicMutableValues;

  constructor(svc: ScheduledValueChange, sdc: ScheduledDelayChange) {
    this.smv = new DelayedPublicMutableValues(svc, sdc);
  }

  async toFields(): Promise<Fr[]> {
    return [...this.smv.toFields(), await this.smv.hash()];
  }

  async writeToTree(delayedPublicMutableSlot: Fr, storageWrite: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const fields = await this.toFields();

    for (let i = 0; i < fields.length; i++) {
      await storageWrite(delayedPublicMutableSlot.add(new Fr(i)), fields[i]);
    }
  }

  static async getContractUpdateSlots(contractAddress: AztecAddress) {
    const delayedPublicMutableSlot = await deriveStorageSlotInMap(new Fr(UPDATED_CLASS_IDS_SLOT), contractAddress);
    const delayedPublicMutableHashSlot = delayedPublicMutableSlot.add(new Fr(DELAYED_PUBLIC_MUTABLE_VALUES_LEN));

    return {
      delayedPublicMutableSlot,
      delayedPublicMutableHashSlot,
    };
  }
}
