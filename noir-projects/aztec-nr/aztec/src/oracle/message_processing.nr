use protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN, PUBLIC_LOG_PLAINTEXT_LEN},
    hash::compute_siloed_private_log_field,
};

/// Finds new private logs that may have been sent to all registered accounts in PXE in the current contract and makes
/// them available for later processing in Noir by storing them in a capsule array.
pub unconstrained fn fetch_tagged_logs(pending_tagged_log_array_base_slot: Field) {
    fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot);
}

#[oracle(fetchTaggedLogs)]
unconstrained fn fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot: Field) {}

/// The payload of a log (i.e. the content minus the tag, called plaintext for public logs and ciphertext for private),
/// plus contextual information about the transaction in which the log was emitted. This is the data required in order
/// to discover notes that are being delivered in a log.
pub struct LogWithTxData<let N: u32> {
    pub log_payload: BoundedVec<Field, N>,
    pub tx_hash: Field,
    /// The array of new note hashes created by `tx_hash`
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    /// The first nullifier created by `tx_hash`
    pub first_nullifier_in_tx: Field,
}

/// The plaintext of a public log (i.e. the content minus the tag), plus contextual information about the transaction
// in which the log was emitted. This is the data required in order to discover notes that are being delivered in a
// log.
impl<let N: u32> LogWithTxData<N> {
    /// Returns a copy of the original log with payload max length equal to TO_LEN.
    ///
    /// # Arguments
    /// * `log` - The log to convert
    /// * `FROM_LEN` - The max length of the log payload
    /// * `TO_LEN` - The max length of the log payload
    ///
    /// # Panics
    /// If the log's content exceeds TO_LEN
    pub fn update_max_len<let TO_LEN: u32>(self) -> LogWithTxData<TO_LEN> {
        // We need to check that the actual log content is not longer than the max length.
        assert(self.log_payload.len() <= TO_LEN, "Source log payload too long");

        // We copy the log content to the BoundedVec of the correct max length.
        let mut log_payload = BoundedVec::new();
        log_payload.extend_from_bounded_vec(self.log_payload);

        LogWithTxData {
            log_payload,
            tx_hash: self.tx_hash,
            unique_note_hashes_in_tx: self.unique_note_hashes_in_tx,
            first_nullifier_in_tx: self.first_nullifier_in_tx,
        }
    }
}

/// Fetches a public log emitted by `contract_address` that has the corresponding `tag`. Returns `Option::none` if no
/// such log exists. Throws if more than one log with that tag exists.
// TODO(#11627): handle multiple logs with the same tag.
pub unconstrained fn get_public_log_by_tag(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PUBLIC_LOG_PLAINTEXT_LEN>> {
    get_public_log_by_tag_oracle(tag, contract_address)
}

#[oracle(getPublicLogByTag)]
unconstrained fn get_public_log_by_tag_oracle(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PUBLIC_LOG_PLAINTEXT_LEN>> {}

/// Fetches a private log from the node that has the corresponding `tag`. Returns `Option::none` if no such log exists.
/// Throws if more than one log with that tag exists.
// TODO(#11627): handle multiple logs with the same tag.
pub unconstrained fn get_private_log_by_tag(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PRIVATE_LOG_CIPHERTEXT_LEN>> {
    // Note that unlike in the public case, the tag is siloed with the contract address.
    let siloed_tag = compute_siloed_private_log_field(contract_address, tag);

    get_private_log_by_tag_oracle(siloed_tag)
}

#[oracle(getPrivateLogByTag)]
unconstrained fn get_private_log_by_tag_oracle(
    siloed_tag: Field,
) -> Option<LogWithTxData<PRIVATE_LOG_CIPHERTEXT_LEN>> {}

/// Attempts to retrieve a log by its tag from both public and private sources.
///
/// First checks public logs, falling back to private logs if no public log is found.
/// The returned log content is coerced to have max length equal to MAX_LOG_PAYLOAD_LEN.
///
/// # Arguments
/// * `tag` - The tag to search for in both public and private logs
/// * `contract_address` - The contract address to search logs from
///
/// # Returns
/// A log with payload max length equal to MAX_LOG_PAYLOAD_LEN
///
/// # Panics
/// If the found log's content exceeds MAX_LOG_PAYLOAD_LEN
pub unconstrained fn get_log_by_tag<let MAX_LOG_PAYLOAD_LEN: u32>(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<MAX_LOG_PAYLOAD_LEN>> {
    // This function works with both private and public logs and for this reason it's necessary that
    // MAX_LOG_PAYLOAD_LEN is less than or equal to the smaller of the two log sizes. We check this against both log
    // sizes instead of just the smaller one to make this resistant to future log size changes.
    std::static_assert(
        MAX_LOG_PAYLOAD_LEN <= PUBLIC_LOG_PLAINTEXT_LEN,
        "MAX_LOG_PAYLOAD_LEN must be less than PUBLIC_LOG_PLAINTEXT_LEN",
    );
    std::static_assert(
        MAX_LOG_PAYLOAD_LEN <= PRIVATE_LOG_CIPHERTEXT_LEN,
        "MAX_LOG_PAYLOAD_LEN must be less than PRIVATE_LOG_CIPHERTEXT_LEN",
    );

    let maybe_public_log = get_public_log_by_tag(tag, contract_address);
    if maybe_public_log.is_some() {
        let public_log = maybe_public_log.unwrap_unchecked();
        Option::some(public_log.update_max_len())
    } else {
        // We didn't manage to obtain the log from the public log stream, so we try the private one.
        let maybe_private_log = get_private_log_by_tag(tag, contract_address);
        if maybe_private_log.is_some() {
            let private_log = maybe_private_log.unwrap_unchecked();
            Option::some(private_log.update_max_len())
        } else {
            Option::none()
        }
    }
}

// This must be a single oracle and not one for notes and one for events because the entire point is to validate
// all notes and events in one go, minimizing node round-trips.
pub(crate) unconstrained fn validate_enqueued_notes_and_events(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
) {
    validate_enqueued_notes_and_events_oracle(
        contract_address,
        note_validation_requests_array_base_slot,
        event_validation_requests_array_base_slot,
    );
}

#[oracle(validateEnqueuedNotesAndEvents)]
unconstrained fn validate_enqueued_notes_and_events_oracle(
    contract_address: AztecAddress,
    note_validation_requests_array_base_slot: Field,
    event_validation_requests_array_base_slot: Field,
) {}
