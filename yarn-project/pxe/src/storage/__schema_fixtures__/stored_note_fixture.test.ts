import { assertNoDefaultFields } from './assert_no_default_fields.js';
import { STORED_NOTE_FIXTURE_TYPE_NAME, buildStoredNoteFixtures } from './stored_note_fixture.js';

describe('StoredNote fixture', () => {
  it('produces deterministic bytes across runs', () => {
    const a = buildStoredNoteFixtures();
    const b = buildStoredNoteFixtures();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].toBuffer().equals(b[i].toBuffer())).toBe(true);
    }
  });

  it('produces fixtures with stable count', () => {
    expect(buildStoredNoteFixtures().length).toBe(4);
  });

  it('variant 0 has no default fields', () => {
    expect(() => assertNoDefaultFields(STORED_NOTE_FIXTURE_TYPE_NAME, buildStoredNoteFixtures()[0])).not.toThrow();
  });
});
