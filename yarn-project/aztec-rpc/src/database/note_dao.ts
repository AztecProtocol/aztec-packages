import { AztecAddress, Fr } from '@aztec/circuits.js';

export interface NoteDao {
  contractAddress: AztecAddress;
  contractSlot: Fr;
  note: Fr[];
  // Computed properties
  siblingPath: Fr[];
  nullifier: Fr; // TODO Review
  index: number;
}
