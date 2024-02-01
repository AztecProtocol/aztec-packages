use dep::std::merkle::compute_merkle_root;

use crate::{
    context::PrivateContext,
    note::{
        utils::compute_note_hash_for_consumption,
        note_header::NoteHeader,
        note_interface::NoteInterface,
    },
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

pub fn prove_note_inclusion<Note, N>(
    note_with_header: Note,
    context: PrivateContext
) where Note: NoteInterface {
    let note_commitment = compute_note_hash_for_consumption(note_with_header);

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

pub fn prove_note_inclusion_at<Note, N>(
    note_with_header: Note,
    block_number: u32, // The block at which we'll prove that the note exists
    context: PrivateContext
) where Note: NoteInterface {
    let note_commitment = compute_note_hash_for_consumption(note_with_header);

    // 1) Get block header from oracle and ensure that the block is included in the archive.
    let header = context.get_header_at(block_number);

    // 2) Get the membership witness of the note in the note hash tree
    let witness = get_note_hash_membership_witness(block_number, note_commitment);

    // 3) Prove that the commitment is in the note hash tree
    assert(
        header.state.partial.note_hash_tree.root
        == compute_merkle_root(note_commitment, witness.index, witness.path), "Proving note inclusion failed"
    );
    // --> Now we have traversed the trees all the way up to archive root.
}
