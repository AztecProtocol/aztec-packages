use dep::std::option::Option;
use crate::abi::PublicContextInputs;
use crate::context::{
    PrivateContext,
    PublicContext,
};
use crate::note::{
    note_header::NoteHeader,
    note_interface::NoteInterface,
    utils::compute_inner_note_hash,
};
use crate::oracle::notes::{notify_created_note, notify_nullified_note};
use crate::constants_gen::EMPTY_NULLIFIED_NOTE_HASH;

fn create_note<Note, N>(
    context: &mut PrivateContext,
    storage_slot: Field,
    note: &mut Note,
    note_interface: NoteInterface<Note, N>,
) {
    let contract_address = (*context).this_address();

    let header = NoteHeader { contract_address, storage_slot, nonce: 0 };
    let set_header = note_interface.set_header;
    set_header(note, header);
    let inner_note_hash = compute_inner_note_hash(note_interface, *note);

    let serialise = note_interface.serialise;
    let preimage = serialise(*note);
    assert(notify_created_note(storage_slot, preimage, inner_note_hash) == 0);

    context.push_new_note_hash(inner_note_hash);
}

fn create_note_hash_from_public<Note, N>(
    context: &mut PublicContext,
    storage_slot: Field,
    note: &mut Note,
    note_interface: NoteInterface<Note, N>,
) {
    let contract_address = (*context).this_address();

    let header = NoteHeader { contract_address, storage_slot, nonce: 0 };
    let set_header = note_interface.set_header;
    set_header(note, header);
    let inner_note_hash = compute_inner_note_hash(note_interface, *note);

    context.push_new_note_hash(inner_note_hash);
}

fn destroy_note<Note, N>(
    context: &mut PrivateContext,
    storage_slot: Field,
    note: Note,
    note_interface: NoteInterface<Note, N>,
) {
    let mut nullifier = 0;
    let mut nullified_note_hash: Field = EMPTY_NULLIFIED_NOTE_HASH;
    let compute_nullifier = note_interface.compute_nullifier;
    nullifier = compute_nullifier(note);

    let serialise = note_interface.serialise;
    let preimage = serialise(note);

    // We also need the note note_hash corresponding to the "nullifier"
    let get_header = note_interface.get_header;
    let header = get_header(note);
    // 0 nonce implies "transient" nullifier (must nullify a note_hash in this TX).
    // `nullified_note_hash` is used to inform the kernel which pending note_hash
    // the nullifier corresponds to so they can be matched and both squashed/deleted.
    // nonzero nonce implies "persistable" nullifier (nullifies a persistent/in-tree
    // note_hash) in which case `nullified_note_hash` is not used since the kernel
    // just siloes and forwards the nullier to its output.
    if (header.nonce == 0) {
        // TODO(1718): Can we reuse the note note_hash computed in `compute_nullifier`?
        nullified_note_hash = compute_inner_note_hash(note_interface, note);
    }
    assert(notify_nullified_note(storage_slot, nullifier, preimage, nullified_note_hash) == 0);

    context.push_new_nullifier(nullifier, nullified_note_hash)
}