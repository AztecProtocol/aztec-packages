import { UPDATED_CLASS_IDS_SLOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';
import { deriveStorageSlotInMap } from '../hash/map_slot.js';
import { ScheduledDelayChange } from './scheduled_delay_change.js';
import { ScheduledValueChange } from './scheduled_value_change.js';
import { SHARED_MUTABLE_VALUES_LEN, SharedMutableValues } from './shared_mutable_values.js';

export class SharedMutableValuesWithHash {
  private smv: SharedMutableValues;

  constructor(svc: ScheduledValueChange, sdc: ScheduledDelayChange) {
    this.smv = new SharedMutableValues(svc, sdc);
  }

  async toFields(): Promise<Fr[]> {
    return [...this.smv.toFields(), await this.smv.hash()];
  }

  async writeToTree(sharedMutableSlot: Fr, storageWrite: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const fields = await this.toFields();

    for (let i = 0; i < fields.length; i++) {
      await storageWrite(sharedMutableSlot.add(new Fr(i)), fields[i]);
    }
  }

  static async getContractUpdateSlots(contractAddress: AztecAddress) {
    const sharedMutableSlot = await deriveStorageSlotInMap(new Fr(UPDATED_CLASS_IDS_SLOT), contractAddress);
    const sharedMutableHashSlot = sharedMutableSlot.add(new Fr(SHARED_MUTABLE_VALUES_LEN));

    return {
      sharedMutableSlot,
      sharedMutableHashSlot,
    };
  }
}
