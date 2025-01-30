use crate::note::discovery::MAX_NOTE_PACKED_LEN;
use dep::protocol_types::{address::AztecAddress, log_with_tx_data::LogWithTxData};

/// Finds new notes that may have been sent to all registered accounts in PXE in the current contract and makes them available
/// for later querying via the `get_notes` oracle.
pub fn sync_notes() {
    /// Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    /// call.
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
    content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
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

/// Fetches a log from the node that has the corresponding `tag`. The log can be either a public or a private log, and
/// the tag is the first field in the log's content. Returns `Option::none` if no such log exists. Throws if more than
/// one log with that tag exists.
/// Public logs have an extra field included at the beginning with the address of the contract that emtitted them.
// TODO(#11627): handle multiple logs with the same tag.
// TODO(#10273): improve contract siloing of logs, don't introduce an extra field.
pub unconstrained fn get_log_by_tag(tag: Field) -> Option<LogWithTxData> {
    get_log_by_tag_oracle(tag)
}

#[oracle(deliverNote)]
unconstrained fn deliver_note_oracle(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {}

#[oracle(getLogByTag)]
unconstrained fn get_log_by_tag_oracle(tag: Field) -> Option<LogWithTxData> {}
