use crate::note::discovery::MAX_NOTE_SERIALIZED_LEN;
use dep::protocol_types::{address::AztecAddress, constants::MAX_NOTE_HASHES_PER_TX};

pub global PUBLIC_LOG_SIZE_IN_FIELDS: u32 = 5; // todo replace with constant from miranda's pr. make sure to use data and not raw size (excl addr) and remove tag

/// Finds new notes that may have been sent to all registered accounts in PXE in the current contract and makes them available
/// for later querying via the `get_notes` oracle.
pub fn sync_notes() {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        sync_notes_oracle_wrapper();
    }
}

unconstrained fn sync_notes_oracle_wrapper() {
    sync_notes_oracle();
}

#[oracle(syncNotes)]
unconstrained fn sync_notes_oracle() {}

/// Informs PXE of a note's existence so that it can later retrieved by the `getNotes` oracle. The note will be scoped
/// to `contract_address`, meaning other contracts will not be able to access it unless authorized.
///
/// The note's `content` is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value is
/// typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are the
/// inner hashes, i.e. the raw hashes returned by `NoteInterface::compute_note_hash` and
/// `NullifiableNote::compute_nullifier`. PXE will verify that the siloed unique note hash was inserted into the tree at
/// `tx_hash`, and will store the nullifier to later check for nullification.
///
/// `recipient` is the account to which the note was sent to. Other accounts will not be able to access this note (e.g.
/// other accounts will not be able to see one another's token balance notes, even in the same PXE) unless authorized.
///
/// Returns true if the note was sucessfully delivered and added to PXE's database.
pub unconstrained fn deliver_note(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {
    deliver_note_oracle(
        contract_address,
        storage_slot,
        nonce,
        content,
        note_hash,
        nullifier,
        tx_hash,
        recipient,
    )
}

#[oracle(deliverNote)]
unconstrained fn deliver_note_oracle(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {}

pub struct LogWithTxData {
    pub log_content: BoundedVec<Field, PUBLIC_LOG_SIZE_IN_FIELDS>,
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
}

pub unconstrained fn get_log_by_tag(tag: Field) -> Option<LogWithTxData> {
    get_log_by_tag_oracle(tag)
}

#[oracle(deliverNote)]
unconstrained fn get_log_by_tag_oracle(tag: Field) -> Option<LogWithTxData> {}
