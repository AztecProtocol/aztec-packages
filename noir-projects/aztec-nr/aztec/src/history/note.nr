//! Note existence and non-nullification.

use crate::protocol::{
    abis::block_header::BlockHeader,
    hash::{compute_siloed_note_hash, compute_siloed_nullifier, compute_unique_note_hash},
    merkle_tree::membership::check_membership,
};

use crate::{
    context::PrivateContext,
    history::nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by},
    note::{ConfirmedNote, HintedNote, note_interface::NoteHash, utils::compute_confirmed_note_hash_for_nullification},
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

mod test;

/// Asserts that a note existed in the note hash tree by the time a block was mined.
///
/// Proves note inclusion at `block_header` by checking membership of the note's unique note hash, and returns a
/// [`ConfirmedNote`] describing it.
///
/// ## Cross-contract notes
///
/// Unlike the nullification helpers, this works for notes of **any** contract, not just the executing one: note hashes
/// are siloed with the note's own contract address (carried by the [`HintedNote`]) and no secret keys are involved.
///
/// To reason about whether such a note has been nullified, see [`assert_local_note_was_nullified_by`] and
/// [`assert_local_note_was_not_nullified_by`], which — in contrast — can only be used for the executing contract's own
/// notes.
pub fn assert_note_existed_by<Note>(block_header: BlockHeader, hinted_note: HintedNote<Note>) -> ConfirmedNote<Note>
where
    Note: NoteHash,
{
    let note_hash =
        hinted_note.note.compute_note_hash(hinted_note.owner, hinted_note.storage_slot, hinted_note.randomness);

    let siloed_note_hash = compute_siloed_note_hash(hinted_note.contract_address, note_hash);

    let unique_note_hash = compute_unique_note_hash(
        hinted_note.metadata.to_settled().note_nonce(),
        siloed_note_hash,
    );

    // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
    let witness = unsafe { get_note_hash_membership_witness(block_header, unique_note_hash) };

    // Note inclusion is fairly straightforward, since all we need to prove is that a note exists in the note tree - we
    // don't even care _where_ in the tree it is stored. This is because entries in the note hash tree are unique.
    assert(
        check_membership(
            unique_note_hash,
            witness,
            block_header.state.partial.note_hash_tree.root,
        ),
        "Proving note inclusion failed",
    );

    ConfirmedNote::new(hinted_note, unique_note_hash)
}

/// Asserts a note existed and had not yet been nullified by a given block.
///
/// Combines [`assert_note_existed_by`] and [`assert_local_note_was_not_nullified_by`]: it proves both that the note
/// existed at `block_header` and that it had not been nullified then. A contract typically uses this as a security gate
/// before acting on a note whose validity at some past block matters.
///
/// ## Local notes only
///
/// Like [`assert_local_note_was_not_nullified_by`], this can only be used for notes of the executing contract. Use
/// [`assert_note_existed_by`] on its own to prove existence of another contract's notes.
pub fn assert_local_note_was_valid_by<Note>(
    block_header: BlockHeader,
    hinted_note: HintedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    let confirmed_note = assert_note_existed_by(block_header, hinted_note);
    assert_local_note_was_not_nullified_by(block_header, confirmed_note, context);
}

/// Asserts a note had been nullified by a given block.
///
/// ## Local notes only
///
/// This can only be used for notes of the executing contract. Use [`assert_note_existed_by`] on its own to prove
/// existence of another contract's notes.
pub fn assert_local_note_was_nullified_by<Note>(
    block_header: BlockHeader,
    confirmed_note: ConfirmedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    assert(
        confirmed_note.contract_address == context.this_address(),
        "Note nullification history is only supported for the executing contract's own notes",
    );

    let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);
    let inner_nullifier =
        confirmed_note.note.compute_nullifier(context, confirmed_note.owner, note_hash_for_nullification);

    let siloed_nullifier = compute_siloed_nullifier(confirmed_note.contract_address, inner_nullifier);

    assert_nullifier_existed_by(block_header, siloed_nullifier);
}

/// Asserts a note had **not** been nullified by a given block.
///
/// ## Local notes only
///
/// This can only be used for notes of the executing contract. Use [`assert_note_existed_by`] on its own to prove
/// existence of another contract's notes.
pub fn assert_local_note_was_not_nullified_by<Note>(
    block_header: BlockHeader,
    confirmed_note: ConfirmedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    assert(
        confirmed_note.contract_address == context.this_address(),
        "Note nullification history is only supported for the executing contract's own notes",
    );

    let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);

    let inner_nullifier =
        confirmed_note.note.compute_nullifier(context, confirmed_note.owner, note_hash_for_nullification);

    let siloed_nullifier = compute_siloed_nullifier(confirmed_note.contract_address, inner_nullifier);

    assert_nullifier_did_not_exist_by(block_header, siloed_nullifier);
}
