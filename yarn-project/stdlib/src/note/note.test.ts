import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import times from 'lodash.times';

import { Note } from './note.js';

describe('note', () => {
  let note: Note;

  beforeEach(() => {
    note = new Note(times(5, Fr.random));
  });

  it('convert to and from buffer', () => {
    expect(Note.fromBuffer(note.toBuffer())).toEqual(note);
  });

  it('converts to and from json', () => {
    expect(jsonParseWithSchema(jsonStringify(note), Note.schema)).toEqual(note);
  });
});
