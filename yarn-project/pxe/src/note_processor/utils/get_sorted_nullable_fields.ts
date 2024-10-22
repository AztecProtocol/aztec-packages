import { type AztecAddress } from "@aztec/circuits.js";
import { type PxeDatabase } from "../../database/pxe_database.js";
import { type NoteField, type NoteSelector } from "@aztec/foundation/abi";
import { ContractNotFoundError } from "@aztec/simulator";

export async function getSortedNullableFields(db: PxeDatabase, contractAddress: AztecAddress, noteTypeId: NoteSelector): Promise<NoteField[]> {
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

    return noteFields;
}