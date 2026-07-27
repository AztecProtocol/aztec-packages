import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note } from '@aztec/stdlib/note';

import { packAsHintedNote } from './note_packing_utils.js';

it('packs hinted note', () => {
  const noteInfo = {
    contractAddress: AztecAddress.fromFieldUnsafe(new Fr(1n)),
    owner: AztecAddress.fromFieldUnsafe(new Fr(5n)),
    randomness: new Fr(42n),
    storageSlot: new Fr(100n),
    noteNonce: new Fr(2n),
    isPending: true,
    note: new Note([new Fr(3n), new Fr(4n)]),
  };

  const packed = packAsHintedNote(noteInfo);

  expect(packed).toMatchSnapshot();

  // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
  const fieldArrayStr = `[${packed.map(f => f.toString()).join(',')}]`;
  updateInlineTestData(
    'noir-projects/labs/aztec-nr/aztec/src/note/hinted_note.nr',
    'packed_hinted_note_from_typescript',
    fieldArrayStr,
  );
});
