use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_PLAINTEXT_LEN},
};

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and makes
/// them available for later processing in Noir by storing them in a capsule array.
pub unconstrained fn fetch_tagged_logs(pending_tagged_log_array_base_slot: Field) {
    fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot);
}

#[oracle(fetchTaggedLogs)]
unconstrained fn fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot: Field) {}

/// The plaintext of a public log (i.e. the content minus the tag), plus contextual information about the transaction
// in which the log was emitted. This is the data required in order to discover notes that are being delivered in a
// log.
pub struct PublicLogWithTxData {
    pub log_plaintext: BoundedVec<Field, PUBLIC_LOG_PLAINTEXT_LEN>,
    pub tx_hash: Field,
    /// The array of new note hashes created by `tx_hash`
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    /// The first nullifier created by `tx_hash`
    pub first_nullifier_in_tx: Field,
}

/// Fetches a public log emitted by `contract_address` that has the corresponding `tag`. The tag is the first field in the log's content.
/// Returns `Option::none` if no such log exists. Throws if more than one log with that tag exists.
// TODO(#11627): handle multiple logs with the same tag.
// TODO(#10273): improve contract siloing of logs, don't introduce an extra field.
pub unconstrained fn get_public_log_by_tag(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<PublicLogWithTxData> {
    get_public_log_by_tag_oracle(tag, contract_address)
}

#[oracle(getPublicLogByTag)]
unconstrained fn get_public_log_by_tag_oracle(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<PublicLogWithTxData> {}

pub(crate) unconstrained fn validate_enqueued_notes(
    contract_address: AztecAddress,
    base_slot: Field,
) {
    validate_enqueued_notes_oracle(contract_address, base_slot);
}

#[oracle(validateEnqueuedNotes)]
unconstrained fn validate_enqueued_notes_oracle(contract_address: AztecAddress, base_slot: Field) {}
