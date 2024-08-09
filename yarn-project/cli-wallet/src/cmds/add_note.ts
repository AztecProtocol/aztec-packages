import { type AztecAddress, type PXE } from '@aztec/aztec.js';
import { ExtendedNote, Note, type TxHash } from '@aztec/circuit-types';
import { getContractArtifact, parseFields } from '@aztec/cli/utils';
import { LogFn } from '@aztec/foundation/log';

export async function addNote(
  client: PXE,
  address: AztecAddress,
  contractAddress: AztecAddress,
  noteName: string,
  storageFieldName: string,
  artifactPath: string,
  txHash: TxHash,
  noteFields: string[],
  log: LogFn,
) {
  const fields = parseFields(noteFields);
  const note = new Note(fields);
  const contractArtifact = await getContractArtifact(artifactPath, log);

  const contractNote = contractArtifact.notes[noteName];
  const storageField = contractArtifact.storageLayout[storageFieldName];

  if (!contractNote) {
    throw new Error(`Note ${noteName} not found in contract ${contractArtifact.name}`);
  }

  const extendedNote = new ExtendedNote(note, address, contractAddress, storageField.slot, contractNote.id, txHash);
  await client.addNote(extendedNote);
}
