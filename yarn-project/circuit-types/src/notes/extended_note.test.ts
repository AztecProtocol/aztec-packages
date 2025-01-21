import { jsonStringify } from '@aztec/foundation/json-rpc';

import { randomExtendedNote, randomUniqueNote } from '../mocks.js';
import { ExtendedNote, UniqueNote } from './extended_note.js';

describe('ExtendedNote', () => {
  let note: ExtendedNote;

  beforeEach(async () => {
    note = await randomExtendedNote();
  });

  it('convert to and from buffer', () => {
    const buf = note.toBuffer();
    expect(ExtendedNote.fromBuffer(buf)).toEqual(note);
  });

  it('convert to and from JSON', () => {
    const json = jsonStringify(note);
    expect(ExtendedNote.schema.parse(JSON.parse(json))).toEqual(note);
  });
});

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
