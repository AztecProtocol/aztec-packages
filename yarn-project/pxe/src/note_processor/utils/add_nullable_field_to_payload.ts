import { L1NotePayload, Note } from '@aztec/circuit-types';
import { type Fr } from '@aztec/foundation/fields';

import { type PxeDatabase } from '../../database/pxe_database.js';
import { getSortedNullableFields } from './get_sorted_nullable_fields.js';

/**
 * Inserts publicly delivered nullable fields into the note payload.
 * @param db - PXE database used to fetch contract instance and artifact.
 * @param payload - Note payload to which nullable fields should be added.
 * @param nullableFields - List of nullable fields to be added to the note payload.
 * @returns Note payload with nullable fields added.
 */
export async function addNullableFieldsToPayload(
  db: PxeDatabase,
  payload: L1NotePayload,
  nullableFields: Fr[],
): Promise<L1NotePayload> {
  const noteFields = await getSortedNullableFields(db, payload.contractAddress, payload.noteTypeId);

  // Now we insert the nullable fields into the note based on its indices defined in the ABI.
  const modifiedNoteItems = [...payload.note.items];
  let indexInNullable = 0;
  for (let i = 0; i < noteFields.length; i++) {
    const noteField = noteFields[i];
    if (noteField.nullable) {
      if (i == noteFields.length - 1) {
        // We are processing the last field so we simply insert the rest of the nullable fields at the end
        modifiedNoteItems.push(...nullableFields.slice(indexInNullable));
      } else {
        const noteFieldLength = noteFields[i + 1].index - noteField.index;
        const nullableFieldsToInsert = nullableFields.slice(indexInNullable, indexInNullable + noteFieldLength);
        indexInNullable += noteFieldLength;
        // Now we insert the nullable fields at the note field index
        modifiedNoteItems.splice(noteField.index, 0, ...nullableFieldsToInsert);
      }
    }
  }

  return new L1NotePayload(
    new Note(modifiedNoteItems),
    payload.contractAddress,
    payload.storageSlot,
    payload.noteTypeId,
    []
  );
}
