import { jsonStringify } from '@aztec/foundation/json-rpc';

import { randomUniqueNote } from '../tests/mocks.js';
import { UniqueNote } from './unique_note.js';

describe('UniqueNote', () => {
  let note: UniqueNote;

  beforeEach(async () => {
    note = await randomUniqueNote();
  });

  it('convert to and from buffer', () => {
    const buf = note.toBuffer();
    expect(UniqueNote.fromBuffer(buf)).toEqual(note);
  });

  it('convert to and from JSON', () => {
    const json = jsonStringify(note);
    expect(UniqueNote.schema.parse(JSON.parse(json))).toEqual(note);
  });
});
