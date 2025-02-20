use crate::discovery::MAX_NOTE_PACKED_LEN;
use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_DATA_SIZE_IN_FIELDS},
};

/// Finds new notes that may have been sent to all registered accounts in PXE in the current contract and makes them
/// available for later querying via the `get_notes` oracle.
pub unconstrained fn sync_notes() {
    sync_notes_oracle();
}

#[oracle(syncNotes)]
unconstrained fn sync_notes_oracle() {}

/// Informs PXE of a note's existence so that it can later be retrieved by the `getNotes` oracle. The note will be
/// scoped to `contract_address`, meaning other contracts will not be able to access it unless authorized.
///
/// The packed note is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value
/// is typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are
/// the inner hashes, i.e. the raw hashes returned by `NoteInterface::compute_note_hash` and
/// `NullifiableNote::compute_nullifier`. PXE will verify that the siloed unique note hash was inserted into the tree
/// at `tx_hash`, and will store the nullifier to later check for nullification.
///
/// `recipient` is the account to which the note was sent to. Other accounts will not be able to access this note (e.g.
/// other accounts will not be able to see one another's token balance notes, even in the same PXE) unless authorized.
///
/// Returns true if the note was successfully delivered and added to PXE's database.
pub unconstrained fn deliver_note(
    contract_address: AztecAddress,
    storage_slot: Field,
    nonce: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {
    deliver_note_oracle(
        contract_address,
        storage_slot,
        nonce,
        packed_note,
        note_hash,
        nullifier,
        tx_hash,
        recipient,
    )
}

/// The contents of a public log, plus contextual information about the transaction in which the log was emitted. This
/// is the data required in order to discover notes that are being delivered in a log.
// TODO(#11639): this could also be used to fetch private logs, but the `BoundedVec` maximum length is that of a public
// log.
pub struct LogWithTxData {
    pub log_content: BoundedVec<Field, PUBLIC_LOG_DATA_SIZE_IN_FIELDS>,
    pub tx_hash: Field,
    /// The array of new note hashes created by `tx_hash`
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    /// The first nullifier created by `tx_hash`
    pub first_nullifier_in_tx: Field,
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
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
    recipient: AztecAddress,
) -> bool {}

#[oracle(getLogByTag)]
unconstrained fn get_log_by_tag_oracle(tag: Field) -> Option<LogWithTxData> {}
