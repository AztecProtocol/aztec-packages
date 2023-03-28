import { AztecAddress, Fr } from "../circuits.js";

export interface NoteDao {
    contractAddress: AztecAddress;
    contractSlot: Fr;
    note: Fr[];
    // Computed properties
    siblingPath: Fr[];
    nullifier: Fr; // TODO Review
    index: number;
}
