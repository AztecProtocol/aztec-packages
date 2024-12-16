import { type L1NotePayload, Note } from '@aztec/circuit-types';
import { ContractNotFoundError } from '@aztec/simulator/client';

import { type PxeDatabase } from '../database/pxe_database.js';

/**
 * Merges privately and publicly delivered note values.
 * @param db - PXE database used to fetch contract instance and artifact.
 * @param payload - Payload corresponding to the note.
 * @returns Note payload with public fields added.
 */
export async function getOrderedNoteItems(
  db: PxeDatabase,
  { contractAddress, noteTypeId, privateNoteValues, publicNoteValues }: L1NotePayload,
): Promise<Note> {
  if (publicNoteValues.length === 0) {
    return new Note(privateNoteValues);
  }

  const instance = await db.getContractInstance(contractAddress);
  if (!instance) {
    throw new ContractNotFoundError(
      `Could not find instance for ${contractAddress.toString()}. This should never happen here as the partial notes flow should be triggered only for non-deferred notes.`,
    );
  }

  const artifact = await db.getContractArtifact(instance.contractClassId);
  if (!artifact) {
    throw new Error(
      `Could not find artifact for contract class ${instance.contractClassId.toString()}. This should never happen here as the partial notes flow should be triggered only for non-deferred notes.`,
    );
  }

  const noteFields = Object.values(artifact.notes).find(note => note.id.equals(noteTypeId))?.fields;

  if (!noteFields) {
    throw new Error(`Could not find note fields for note type ${noteTypeId.toString()}.`);
  }

  // We sort note fields by index so that we can iterate over them in order.
  noteFields.sort((a, b) => a.index - b.index);

  // Now we insert the public fields into the note based on its indices defined in the ABI.
  const modifiedNoteItems = privateNoteValues;
  let indexInPublicValues = 0;
  for (let i = 0; i < noteFields.length; i++) {
    const noteField = noteFields[i];
    if (noteField.nullable) {
      if (i == noteFields.length - 1) {
        // We are processing the last field so we simply insert the rest of the public fields at the end
        modifiedNoteItems.push(...publicNoteValues.slice(indexInPublicValues));
      } else {
        const noteFieldLength = noteFields[i + 1].index - noteField.index;
        const publicValuesToInsert = publicNoteValues.slice(indexInPublicValues, indexInPublicValues + noteFieldLength);
        indexInPublicValues += noteFieldLength;
        // Now we insert the public fields at the note field index
        modifiedNoteItems.splice(noteField.index, 0, ...publicValuesToInsert);
      }
    }
  }

  return new Note(modifiedNoteItems);
}
