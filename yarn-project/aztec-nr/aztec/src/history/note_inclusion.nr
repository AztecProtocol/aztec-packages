use dep::std::merkle::compute_merkle_root;

use crate::{
    context::PrivateContext,
    note::{
        utils::compute_note_hash_for_read_or_nullify,
        note_header::NoteHeader,
        note_interface::NoteInterface,
    },
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

pub fn prove_note_inclusion<Note, N>(
    note_with_header: Note,
    context: PrivateContext
) where Note: NoteInterface {
    let note_commitment = compute_note_hash_for_read_or_nullify(note_with_header);

    // 1) Get the membership witness of the note in the note hash tree
    let witness = get_note_hash_membership_witness(
        context.historical_header.global_variables.block_number as u32,
        note_commitment
    );

    // 2) Prove that the commitment is in the note hash tree
    assert(
        context.historical_header.state.partial.note_hash_tree.root
        == compute_merkle_root(note_commitment, witness.index, witness.path), "Proving note inclusion failed"
    );
}
