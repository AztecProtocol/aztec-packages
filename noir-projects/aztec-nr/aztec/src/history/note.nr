//! Note existence and non-nullification.

use protocol_types::{
    abis::block_header::BlockHeader,
    hash::{compute_siloed_note_hash, compute_siloed_nullifier, compute_unique_note_hash},
    merkle_tree::root::root_from_sibling_path,
};

use crate::{
    context::PrivateContext,
    history::nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by},
    note::{
        ConfirmedNote, HintedNote, note_interface::NoteHash,
        utils::compute_confirmed_note_hash_for_nullification,
    },
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

mod test;

pub fn assert_note_existed_by<Note>(
    block_header: BlockHeader,
    hinted_note: HintedNote<Note>,
) -> ConfirmedNote<Note>
where
    Note: NoteHash,
{
    let note_hash = hinted_note.note.compute_note_hash(
        hinted_note.owner,
        hinted_note.storage_slot,
        hinted_note.randomness,
    );

    let siloed_note_hash = compute_siloed_note_hash(hinted_note.contract_address, note_hash);

    let unique_note_hash = compute_unique_note_hash(
        hinted_note.metadata.to_settled().note_nonce(),
        siloed_note_hash,
    );

    // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
    let witness = unsafe { get_note_hash_membership_witness(block_header, unique_note_hash) };

    // Note inclusion is fairly straightforward, since all we need to prove is that a note exists in the note tree -
    // we don't even care _where_ in the tree it is stored. This is because entries in the note hash tree are
    // unique.
    assert_eq(
        block_header.state.partial.note_hash_tree.root,
        root_from_sibling_path(unique_note_hash, witness.index, witness.path),
        "Proving note inclusion failed",
    );

    ConfirmedNote::new(hinted_note, unique_note_hash)
}

pub fn assert_note_was_valid_by<Note>(
    block_header: BlockHeader,
    hinted_note: HintedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    let confirmed_note = assert_note_existed_by(block_header, hinted_note);
    assert_note_was_not_nullified_by(block_header, confirmed_note, context);
}

pub fn assert_note_was_nullified_by<Note>(
    block_header: BlockHeader,
    confirmed_note: ConfirmedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);
    let inner_nullifier = confirmed_note.note.compute_nullifier(
        context,
        confirmed_note.owner,
        note_hash_for_nullification,
    );

    let siloed_nullifier =
        compute_siloed_nullifier(confirmed_note.contract_address, inner_nullifier);

    assert_nullifier_existed_by(block_header, siloed_nullifier);
}

pub fn assert_note_was_not_nullified_by<Note>(
    block_header: BlockHeader,
    confirmed_note: ConfirmedNote<Note>,
    context: &mut PrivateContext,
)
where
    Note: NoteHash,
{
    let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);

    let inner_nullifier = confirmed_note.note.compute_nullifier(
        context,
        confirmed_note.owner,
        note_hash_for_nullification,
    );

    let siloed_nullifier =
        compute_siloed_nullifier(confirmed_note.contract_address, inner_nullifier);

    assert_nullifier_did_not_exist_by(block_header, siloed_nullifier);
}
