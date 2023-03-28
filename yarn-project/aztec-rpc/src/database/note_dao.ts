import { AztecAddress, Fr } from '@aztec/circuits.js';
import { NotePreImage } from '../aztec_rpc_server/note_preimage/note_preimage.js';

export interface NoteDao {
  contractAddress: AztecAddress;
  contractSlot: Fr;
  notePreimage: NotePreImage;
  commitment: Fr;
  // Computed properties
  available: boolean;
  siblingPath: Fr[];
  nullifier: Fr; // TODO Review
  index: number;
}
