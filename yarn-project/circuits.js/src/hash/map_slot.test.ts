import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { deriveStorageSlotInMap } from './index.js';

describe('Map slot', () => {
  it('derived map slot matches Noir', () => {
    const mapSlot = new Fr(0x132258fb6962c4387ba659d9556521102d227549a386d39f0b22d1890d59c2b5n);
    const key = AztecAddress.fromString('0x302dbc2f9b50a73283d5fb2f35bc01eae8935615817a0b4219a057b2ba8a5a3f');

    const slot = deriveStorageSlotInMap(mapSlot, key);

    expect(slot.toString()).toMatchInlineSnapshot(
      `"0x15b9fe39449affd8b377461263e9d2b610b9ad40580553500b4e41d9cbd887ac"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/storage/map.nr',
      'slot_from_typescript',
      slot.toString(),
    );
  });
});
