import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note } from '@aztec/stdlib/note';

import { packAsRetrievedNote } from './note_packing_utils.js';

it('packs retrieved note', () => {
  const noteInfo = {
    contractAddress: AztecAddress.fromField(new Fr(1n)),
    noteNonce: new Fr(2n),
    index: undefined, // Transient note
    note: new Note([new Fr(3n), new Fr(4n)]),
  };

  const packed = packAsRetrievedNote(noteInfo);

  expect(packed).toMatchSnapshot();

  // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
  const fieldArrayStr = `[${packed.map(f => f.toString()).join(',')}]`;
  updateInlineTestData(
    'noir-projects/aztec-nr/aztec/src/note/retrieved_note.nr',
    'packed_retrieved_note_from_typescript',
    fieldArrayStr,
  );
});
