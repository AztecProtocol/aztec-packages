import { Fr } from '@aztec/foundation/curves/bn254';
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

  it('equals returns false when number of items is different', () => {
    const note1 = new Note([Fr.random(), Fr.random(), Fr.random()]);
    const note2 = new Note([...note1.items, Fr.random(), Fr.random()]);

    expect(note1.equals(note2)).toBe(false);
    expect(note2.equals(note1)).toBe(false);
  });
});
