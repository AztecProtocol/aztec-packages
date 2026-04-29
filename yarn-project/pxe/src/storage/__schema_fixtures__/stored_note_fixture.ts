import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { StoredNote } from '../note_store/stored_note.js';

/** The type name reported by the schema-compatibility test for `StoredNote` fixtures. */
export const STORED_NOTE_FIXTURE_TYPE_NAME = 'StoredNote';

function buildNoteDao(): NoteDao {
  return new NoteDao(
    new Note([new Fr(2n), new Fr(3n), new Fr(5n)]),
    AztecAddress.fromBigInt(7n),
    AztecAddress.fromBigInt(11n),
    new Fr(13n),
    new Fr(17n),
    new Fr(19n),
    new Fr(23n),
    new Fr(29n),
    TxHash.fromField(new Fr(31n)),
    BlockNumber(37),
    new Fr(41n).toString(),
    43,
    47,
  );
}

/**
 * Builds the canonical-fixture suite for `StoredNote`. The optional `_nullifiedAt` field is
 * fanned out across two variants:
 * - variant 0: `Some(value)` — every field populated; passes `assertNoDefaultFields`.
 * - variant 1: `None` — same `noteDao` and `scopes`, with `_nullifiedAt = undefined`.
 */
export function buildStoredNoteFixtures(): StoredNote[] {
  const scopes = new Set(['fixture-scope-a', 'fixture-scope-b']);
  return [
    new StoredNote(buildNoteDao(), new Set(scopes), BlockNumber(53)),
    new StoredNote(buildNoteDao(), new Set(scopes), undefined),
  ];
}
