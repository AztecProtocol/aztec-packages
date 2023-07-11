use dep::aztec::note::{
    note_hash::{compute_siloed_note_hash, compute_final_note_hash},
    note_interface::NoteInterface,
};
use dep::aztec::utils::arr_copy_slice;
use crate::constants::MAX_NOTE_FIELDS_SIZE;

fn compute_note_hash<Note, N>(
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    preimage: [Field; MAX_NOTE_FIELDS_SIZE],
) -> Field {
    let deserialise = note_interface.deserialise;
    let note = deserialise(arr_copy_slice(preimage, [0; N], 0));

    let compute_note_hash = note_interface.compute_note_hash;
    let note_hash = compute_note_hash(note);
    compute_siloed_note_hash(storage_slot, note_hash)
}

fn compute_nullifier<Note, N>(
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>,
    preimage: [Field; MAX_NOTE_FIELDS_SIZE],
) -> Field {
    let deserialise = note_interface.deserialise;
    let note = deserialise(arr_copy_slice(preimage, [0; N], 0));

    let compute_note_hash = note_interface.compute_note_hash;
    let note_hash = compute_note_hash(note);
    let final_note_hash = compute_final_note_hash(storage_slot, note_hash);
    
    let compute_nullifier = note_interface.compute_nullifier;
    compute_nullifier(note, final_note_hash)
}
