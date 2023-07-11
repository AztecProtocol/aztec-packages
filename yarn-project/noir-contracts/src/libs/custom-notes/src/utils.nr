use dep::aztec::note::{
    note_hash::{compute_inner_note_hash, compute_siloed_note_hash},
    note_interface::NoteInterface,
};
use dep::aztec::utils::arr_copy_slice;
use crate::constants::MAX_NOTE_FIELDS_SIZE;

fn compute_note_hash_and_nullifier<Note, N>(
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    preimage: [Field; MAX_NOTE_FIELDS_SIZE],
) -> [Field; 2] {
    let deserialise = note_interface.deserialise;
    let note = deserialise(arr_copy_slice(preimage, [0; N], 0));

    let compute_note_hash = note_interface.compute_note_hash;
    let note_hash = compute_note_hash(note);
    let inner_note_hash = compute_inner_note_hash(storage_slot, note_hash);
    
    let siloed_note_hash = compute_siloed_note_hash(storage_slot, note_hash);
    let compute_nullifier = note_interface.compute_nullifier;
    let inner_nullifier = compute_nullifier(note, siloed_note_hash);

    [inner_note_hash, inner_nullifier]
}
