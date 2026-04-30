import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { StoredNote } from '../note_store/stored_note.js';

/** The type name reported by the schema-compatibility test for `StoredNote` fixtures. */
export const STORED_NOTE_FIXTURE_TYPE_NAME = 'StoredNote';

function buildNoteDao(noteItems: Fr[] = [new Fr(2n), new Fr(3n), new Fr(5n)]): NoteDao {
  return new NoteDao(
    new Note(noteItems),
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
 * Builds the canonical-fixture suite for `StoredNote`. Each variant pins one binary-layout branch
 * of `toBuffer()` — including paths inside the embedded `NoteDao.note: Vector<Fr>`:
 * - variant 0: `_nullifiedAt = Some(value)`, populated `scopes`, populated `note` — every field
 *   populated; passes `assertNoDefaultFields`.
 * - variant 1: `_nullifiedAt = None (undefined)`, populated `scopes` — pins the optional's `None`
 *   serialization (`?? 0`).
 * - variant 2: empty `scopes` — pins the empty-vector serialization at the `StoredNote` level
 *   (length=0 prefix, no payload).
 * - variant 3: empty `note` (`NoteDao.note: Vector<Fr>` with no items) — pins the empty-vector
 *   serialization at the nested-`NoteDao` level. Note serialization is the hottest PXE storage
 *   path; pinning the empty branch protects refactors of `Vector.toBuffer()` from silently
 *   changing the on-disk encoding of length=0 vectors.
 */
export function buildStoredNoteFixtures(): StoredNote[] {
  const scopes = new Set(['fixture-scope-a', 'fixture-scope-b']);
  return [
    new StoredNote(buildNoteDao(), new Set(scopes), BlockNumber(53)),
    new StoredNote(buildNoteDao(), new Set(scopes), undefined),
    new StoredNote(buildNoteDao(), new Set(), BlockNumber(53)),
    new StoredNote(buildNoteDao([]), new Set(scopes), BlockNumber(53)),
  ];
}
