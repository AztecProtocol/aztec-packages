import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { deriveStorageSlotInMap } from './map_slot.js';

describe('Map slot', () => {
  it('derived map slot matches Noir', () => {
    const mapSlot = new Point(
      new Fr(0x132258fb6962c4387ba659d9556521102d227549a386d39f0b22d1890d59c2b5n),
      new Fr(0x0a9fa1154d046737fdc9562245b2db9eb87d065301c70995c55ea20693e27b44n),
      false,
    );

    const key = AztecAddress.fromString('0x302dbc2f9b50a73283d5fb2f35bc01eae8935615817a0b4219a057b2ba8a5a3f');

    const slot = deriveStorageSlotInMap(mapSlot, key);

    expect(slot.toString()).toMatchInlineSnapshot(
      `"0x2e6865f314bd97a5d93eb47180214b9bc61ef070e21f091afd7d441f6bca95650eabe741b8b291f9fefb958de389bc61aa2638eafb3c63f75bd50efd8cc9a0a9"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/slots.nr',
      'slot_x_from_typescript',
      slot.x.toString(),
    );
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/slots.nr',
      'slot_y_from_typescript',
      slot.y.toString(),
    );
  });
});
