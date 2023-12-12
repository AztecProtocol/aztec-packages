use crate::{
    
    context::PrivateContext,

pub fn prove_note_commitment_inclusion(
    note_commitment: Fr,
    block_number: u32, // The block at which we'll prove that the note exists
    context: PrivateContext
) {
    // 1) Get block header from oracle and ensure that the block is included in the archive.
    let block_header = context.get_block_header(block_number);

    // 4) Get the membership witness of the note in the note hash tree
    let note_hash_tree_id = 2; // TODO(#3443)
    let witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> =
        get_membership_witness(block_number, note_hash_tree_id, note_commitment);

    // 5) Prove that the commitment is in the note hash tree
    assert(
        block_header.note_hash_tree_root == compute_merkle_root(note_commitment, witness.index, witness.path),
        "Proving note inclusion failed"
    );

    // --> Now we have traversed the trees all the way up to blocks tree root.
}

pub fn prove_note_inclusion<Note, N>(
    note_interface: NoteInterface<Note, N>,
    note_with_header: Note,
    block_number: u32, // The block at which we'll prove that the note exists
    context: PrivateContext
) {
    let note_commitment = note_utils::compute_unique_siloed_note_hash(ValueNoteMethods, note_with_header)

    prove_note_commitment_inclusion(note_commitment, block_number, context);
}