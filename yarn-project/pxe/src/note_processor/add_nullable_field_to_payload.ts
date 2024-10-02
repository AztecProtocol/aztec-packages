import { L1NotePayload, Note } from '@aztec/circuit-types';
import { type Fr } from '@aztec/foundation/fields';
import { ContractNotFoundError } from '@aztec/simulator';

import { type PxeDatabase } from '../database/pxe_database.js';

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
  const instance = await db.getContractInstance(payload.contractAddress);
  if (!instance) {
    throw new ContractNotFoundError(
      `Could not find instance for ${payload.contractAddress.toString()}. This should never happen here as the partial notes flow should be triggered only for non-deferred notes.`,
    );
  }

  const artifact = await db.getContractArtifact(instance.contractClassId);
  if (!artifact) {
    throw new Error(
      `Could not find artifact for contract class ${instance.contractClassId.toString()}. This should never happen here as the partial notes flow should be triggered only for non-deferred notes.`,
    );
  }

  const noteFields = Object.values(artifact.notes).find(note => note.id.equals(payload.noteTypeId))?.fields;

  if (!noteFields) {
    throw new Error(`Could not find note fields for note type ${payload.noteTypeId.toString()}.`);
  }

  // We sort note fields by index so that we can iterate over them in order.
  noteFields.sort((a, b) => a.index - b.index);

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
  );
}
