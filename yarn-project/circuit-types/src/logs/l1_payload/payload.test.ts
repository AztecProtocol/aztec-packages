import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import times from 'lodash.times';

import { Event, Note } from './payload.js';

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

describe('event', () => {
  it('convert to and from buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const note = new Event(fields);
    const buf = note.toBuffer();
    expect(Event.fromBuffer(buf)).toEqual(note);
  });
});
