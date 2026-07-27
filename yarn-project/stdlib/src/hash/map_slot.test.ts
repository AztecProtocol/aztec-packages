import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { AztecAddress } from '../aztec-address/index.js';
import { deriveStorageSlotInMap } from './index.js';

describe('Map slot', () => {
  it('derived map slot matches Noir', async () => {
    const mapSlot = new Fr(0x132258fb6962c4387ba659d9556521102d227549a386d39f0b22d1890d59c2b5n);
    const key = AztecAddress.fromStringUnsafe('0x302dbc2f9b50a73283d5fb2f35bc01eae8935615817a0b4219a057b2ba8a5a3f');

    const slot = await deriveStorageSlotInMap(mapSlot, key);

    expect(slot.toString()).toMatchInlineSnapshot(
      `"0x2d225f361108379adc2da91378b9702675c5546b57e78bafc1e74ec7fec55967"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/storage/map.nr',
      'slot_from_typescript',
      slot.toString(),
    );
  });
});
