use crate::{
    discovery::{
        ComputeNoteHashAndNullifier, MAX_LOG_CONTENT_LEN,
        partial_notes::process_partial_note_private_log, PRIVATE_LOG_EXPANDED_METADATA_LEN,
        private_notes::process_private_note_log,
    },
    encrypted_logs::{
        log_assembly_strategies::default_aes128::aes128::AES128,
        log_encryption::LogEncryption,
        log_type::{
            PARTIAL_NOTE_PRIVATE_LOG_TYPE_ID, PRIVATE_EVENT_LOG_TYPE_ID, PRIVATE_NOTE_LOG_TYPE_ID,
        },
        metadata_packing::from_expanded_metadata,
    },
    oracle::{logs::store_private_event_log, message_discovery::sync_notes},
    utils::array,
};

use protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    debug_log::{debug_log, debug_log_format},
    traits::FromField,
};

// TODO(#12750): don't make these values assume we're using AES.
use crate::encrypted_logs::log_encryption::PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS;

// Define the log type that matches how logs were stored in TS
struct TxScopedL2LogFields {
    // Original log fields
    log_fields: [Field; PRIVATE_LOG_SIZE_IN_FIELDS],
    // Additional fields added during storage
    tx_hash: Field,
    data_start_index: Field,
    block_number: Field,
    recipient: Field,
}

impl<let N: u32> Deserialize<N> for TxScopedL2LogFields {
    fn deserialize(fields: [Field; N]) -> Self {
        // Deserialize the fields into our struct
        let mut log_fields = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
        for i in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
            log_fields[i] = fields[i];
        }

        Self {
            log_fields,
            tx_hash: fields[PRIVATE_LOG_SIZE_IN_FIELDS],
            data_start_index: fields[PRIVATE_LOG_SIZE_IN_FIELDS + 1],
            block_number: fields[PRIVATE_LOG_SIZE_IN_FIELDS + 2],
            recipient: fields[PRIVATE_LOG_SIZE_IN_FIELDS + 3],
        }
    }
}

/// Searches for private logs that signal new private notes that are then delivered to PXE, or new partial notes that
/// are stored in the PXE capsules so that `fetch_and_process_public_partial_note_completion_logs` can later search for
/// public logs that will complete them.
pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // We will eventually fetch tagged logs, decrypt and process them here, but for now we simply call the `syncNotes`
    // oracle. This has PXE perform tag synchronization, log download, decryption, and finally calls to the the
    // `process_log` contract function with the decrypted payload, which will in turn call `process_log` with a
    // decrypted log, letting us continue the work outside of PXE.
    sync_notes();

    // Get logs from capsules
    let CAPSULE_BASE_SLOT = 8240937;
    let logs_array = CapsuleArray::at(_contract_address, CAPSULE_BASE_SLOT);
    let len = logs_array.len();

    let mut i = 0;
    while i < len {
        let log_fields: TxScopedL2LogFields = logs_array.get(i);

        // Process each log
        process_log(contract_address, compute_note_hash_and_nullifier, log);

        i += 1;
    }
}

/// Processes a log's ciphertext by decrypting it and then searching the plaintext for private notes or partial notes.
///
/// Private notes result in nonce discovery being performed prior to delivery, which requires knowledge of the
/// transaction hash in which the notes would've been created (typically the same transaction in which the log was
/// emitted), along with the list of unique note hashes in said transaction and the `compute_note_hash_and_nullifier`
/// function.
///
/// Partial notes result in a pending partial note entry being stored in a PXE capsule, which will later be retrieved to
/// search for the note's completion public log.
unconstrained fn process_log<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    log: TxScopedL2LogFields,
) {
    debug_log_format("Processing log with tag {0}", [log.get(0)]);

    // The first field of the log is the tag, which we don't need right now, and the rest is all ciphertext.
    let ciphertext = array::subbvec(log, 1);
    let log_plaintext = AES128::decrypt_log(ciphertext, recipient);

    // The first thing to do after decrypting the log is to determine what type of private log we're processing. We
    // have 3 log types: private note logs, partial note logs and event logs.

    let (log_type_id, log_metadata, log_content) = decode_log_plaintext(log_plaintext);

    if log_type_id == PRIVATE_NOTE_LOG_TYPE_ID {
        debug_log("Processing private note log");

        process_private_note_log(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            recipient,
            compute_note_hash_and_nullifier,
            log_metadata,
            log_content,
        );
    } else if log_type_id == PARTIAL_NOTE_PRIVATE_LOG_TYPE_ID {
        debug_log("Processing partial note private log");

        process_partial_note_private_log(contract_address, recipient, log_metadata, log_content);
    } else if log_type_id == PRIVATE_EVENT_LOG_TYPE_ID {
        debug_log("Processing private event log");

        // In the case of event logs, the log metadata is the event selector.
        let event_selector = EventSelector::from_field(log_metadata as Field);

        store_private_event_log(
            contract_address,
            recipient,
            event_selector,
            log_content,
            tx_hash,
            log_index_in_tx,
        );
    } else {
        // TODO(#11569): handle events
        debug_log_format(
            "Unknown log type id {0} (probably belonging to an event log)",
            [log_type_id as Field],
        );
    }
}

/// Decodes a log's plaintext following aztec-nr's standard log encoding.
///
/// The standard private log layout is composed of:
///  - an initial field called the 'expanded metadata'
///  - an arbitrary number of fields following that called the 'log content'
///
/// ```
/// log_plaintext: [ log_expanded_metadata, ...log_content ]
/// ```
///
/// The expanded metadata itself is (currently) interpreted as a u128, of which:
///  - the upper 64 bits are the log type id
///  - the lower 64 bits are called the 'log metadata'
///
/// ```
/// log_expanded_metadata: [  log_type_id    |  log_metadata  ]
///                        <---  64 bits --->|<--- 64 bits --->
/// ```
///
/// The meaning of the log metadata and log content depend on the value of the log type id. Note that there is
/// nothing special about the log metadata, it _can_ be considered part of the content. It just has a different name
/// to make it distinct from the log content given that it is not a full field.
unconstrained fn decode_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>,
) -> (u64, u64, BoundedVec<Field, MAX_LOG_CONTENT_LEN>) {
    assert(
        log_plaintext.len() >= PRIVATE_LOG_EXPANDED_METADATA_LEN,
        f"Invalid log plaintext: all logs must be decrypted into at least {PRIVATE_LOG_EXPANDED_METADATA_LEN} fields",
    );

    // If PRIVATE_LOG_EXPANDED_METADATA_LEN is changed, causing the assertion below to fail, then the destructuring of
    // the log encoding below must be updated as well.
    std::static_assert(
        PRIVATE_LOG_EXPANDED_METADATA_LEN == 1,
        "unexpected value for PRIVATE_LOG_EXPANDED_METADATA_LEN",
    );

    // See the documentation of this function for a description of the log layout
    let expanded_log_metadata = log_plaintext.get(0);
    let (log_metadata, log_type_id) = from_expanded_metadata(expanded_log_metadata);
    let log_content = array::subbvec(log_plaintext, PRIVATE_LOG_EXPANDED_METADATA_LEN);

    (log_type_id, log_metadata, log_content)
}
