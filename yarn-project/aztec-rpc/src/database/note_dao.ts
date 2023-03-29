import { AztecAddress, Fr } from '@aztec/circuits.js';
import { NotePreImage } from '../aztec_rpc_server/note_preimage/note_preimage.js';

export interface NoteDao {
  contractAddress: AztecAddress;
  contractSlot: Fr;
  notePreimage: NotePreImage;
  // Computed properties
  siblingPath: Fr[];
  nullifier: Fr;
  commitment: Fr;
  index: number;
}
