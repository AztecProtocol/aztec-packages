import { AztecAddress, Fr } from '@aztec/aztec.js';
import { ExtendedNote, Note, TxHash } from '@aztec/circuit-types';
import { DebugLogger } from '@aztec/foundation/log';

import { createCompatibleClient } from '../client.js';
import { parseFields } from '../parse_args.js';

export async function addNote(
  address: AztecAddress,
  contractAddress: AztecAddress,
  storageSlot: Fr,
  txHash: TxHash,
  noteFields: string[],
  rpcUrl: string,
  debugLogger: DebugLogger,
) {
  const note = new Note(parseFields(noteFields));
  const extendedNote = new ExtendedNote(note, address, contractAddress, storageSlot, txHash);
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  await client.addNote(extendedNote);
}
