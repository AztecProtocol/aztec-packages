import {
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import {
  TOTAL_MANA_USED_BIT_SIZE,
  decodeBlockEndStateField,
  encodeBlockEndStateField,
} from './block_end_state_field.js';

describe('block end state field', () => {
  it('encode and decode correctly', () => {
    const blockEndStateField = {
      l1ToL2MessageNextAvailableLeafIndex: 4466,
      noteHashNextAvailableLeafIndex: 3377,
      nullifierNextAvailableLeafIndex: 2288,
      publicDataNextAvailableLeafIndex: 1199,
      totalManaUsed: 87654321n,
    };
    const encoded = encodeBlockEndStateField(blockEndStateField);

    const decoded = decodeBlockEndStateField(encoded);
    expect(decoded).toEqual(blockEndStateField);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test block_end_state_field.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr',
      'block_end_state_field_from_typescript',
      encoded.toString(),
    );
  });

  it('encode and decode large values correctly', () => {
    const blockEndStateField = {
      l1ToL2MessageNextAvailableLeafIndex: 2 ** L1_TO_L2_MSG_TREE_HEIGHT - 4466,
      noteHashNextAvailableLeafIndex: 2 ** NOTE_HASH_TREE_HEIGHT - 3377,
      nullifierNextAvailableLeafIndex: 2 ** NULLIFIER_TREE_HEIGHT - 2288,
      publicDataNextAvailableLeafIndex: 2 ** PUBLIC_DATA_TREE_HEIGHT - 1199,
      totalManaUsed: 2n ** TOTAL_MANA_USED_BIT_SIZE - 87654321n,
    };
    const encoded = encodeBlockEndStateField(blockEndStateField);

    const decoded = decodeBlockEndStateField(encoded);
    expect(decoded).toEqual(blockEndStateField);

    // AZTEC_GENERATE_TEST_DATA=1 yarn test block_end_state_field.test.ts
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/blob_data/block_blob_data.nr',
      'large_block_end_state_field_from_typescript',
      encoded.toString(),
    );
  });
});
