use crate::messages::discovery::private_notes::MAX_NOTE_PACKED_LEN;
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

/// Informs PXE of a note's existence so that it can later be retrieved by the `getNotes` oracle. The note will be
/// scoped to `contract_address`, meaning other contracts will not be able to access it unless authorized.
///
/// The packed note is what `getNotes` will later return. PXE indexes notes by `storage_slot`, so this value
/// is typically used to filter notes that correspond to different state variables. `note_hash` and `nullifier` are
/// the inner hashes, i.e. the raw hashes returned by `NoteHash::compute_note_hash` and
/// `NoteHash::compute_nullifier`. PXE will verify that the siloed unique note hash was inserted into the tree
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

/// Fetches a public log emitted by `contract_address` that has the corresponding `tag`. Returns `Option::none` if no
/// such log exists. Throws if more than one log with that tag exists.
// TODO(#11627): handle multiple logs with the same tag.
pub unconstrained fn get_public_log_by_tag(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PUBLIC_LOG_PLAINTEXT_LEN>> {
    get_public_log_by_tag_oracle(tag, contract_address)
}

/// Fetches a private log from the node that has the corresponding `tag`. Returns `Option::none` if no such log exists.
/// Throws if more than one log with that tag exists.
pub unconstrained fn get_private_log_by_tag(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PRIVATE_LOG_CIPHERTEXT_LEN>> {
    // Note that unlike in the public case, the tag is siloed with the contract address.
    let siloed_tag = compute_siloed_private_log_field(contract_address, tag);

    get_private_log_by_tag_oracle(siloed_tag)
}

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
pub unconstrained fn get_log_by_tag_from_contract<let MAX_LOG_PAYLOAD_LEN: u32>(
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

        // We need to check that the actual log content is not longer than the max length.
        assert(
            public_log.log_payload.len() <= MAX_LOG_PAYLOAD_LEN,
            "Too long partial note completion log delivered via public log stream",
        );

        // We copy the log content to the BoundedVec of the correct max length.
        let mut log_payload = BoundedVec::new();
        log_payload.extend_from_bounded_vec(public_log.log_payload);

        Option::some(
            LogWithTxData {
                log_payload,
                tx_hash: public_log.tx_hash,
                unique_note_hashes_in_tx: public_log.unique_note_hashes_in_tx,
                first_nullifier_in_tx: public_log.first_nullifier_in_tx,
            },
        )
    } else {
        // We didn't manage to obtain the log from the public log stream, so we try the private one.
        let maybe_private_log = get_private_log_by_tag(tag, contract_address);
        if maybe_private_log.is_some() {
            let private_log = maybe_private_log.unwrap_unchecked();

            // We need to check that the actual log content is not longer than the max length.
            assert(
                private_log.log_payload.len() <= MAX_LOG_PAYLOAD_LEN,
                "Too long partial note completion log delivered via private log stream",
            );

            // We copy the log content to the BoundedVec of the correct max length.
            let mut log_payload = BoundedVec::new();
            log_payload.extend_from_bounded_vec(private_log.log_payload);

            Option::some(
                LogWithTxData {
                    log_payload,
                    tx_hash: private_log.tx_hash,
                    unique_note_hashes_in_tx: private_log.unique_note_hashes_in_tx,
                    first_nullifier_in_tx: private_log.first_nullifier_in_tx,
                },
            )
        } else {
            Option::none()
        }
    }
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

#[oracle(getPublicLogByTag)]
unconstrained fn get_public_log_by_tag_oracle(
    tag: Field,
    contract_address: AztecAddress,
) -> Option<LogWithTxData<PUBLIC_LOG_PLAINTEXT_LEN>> {}

#[oracle(getPrivateLogByTag)]
unconstrained fn get_private_log_by_tag_oracle(
    siloed_tag: Field,
) -> Option<LogWithTxData<PRIVATE_LOG_CIPHERTEXT_LEN>> {}
