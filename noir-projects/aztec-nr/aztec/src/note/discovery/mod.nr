use dep::protocol_types::{
    address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS, debug_log::debug_log,
};

pub global PUBLIC_LOG_SIZE_IN_FIELDS: u32 = 14; // todo: move to constants

pub mod private_logs;
pub mod partial_notes;
pub mod nonce_discovery;

// We reserve two fields in the note private log that are not part of the note content: one for the storage slot, and
// one for the note type id.
global NOTE_PRIVATE_LOG_RESERVED_FIELDS: u32 = 2;

pub global MAX_NOTE_SERIALIZED_LEN: u32 =
    PRIVATE_LOG_SIZE_IN_FIELDS - NOTE_PRIVATE_LOG_RESERVED_FIELDS;

pub global PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN: u32 = 1;
pub global MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN: u32 =
    MAX_NOTE_SERIALIZED_LEN - PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN;

pub struct NoteHashAndNullifier {
    pub note_hash: Field, // The result of NoteInterface::compute_note_hash
    pub inner_nullifier: Field, // The result of NullifiableNote::compute_nullifier_without_context
}

pub unconstrained fn discover_new_notes<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    debug_log("Performing note discovery");

    private_logs::fetch_and_process_private_tagged_logs(
        contract_address,
        compute_note_hash_and_nullifier,
    );

    partial_notes::fetch_and_process_public_partial_note_completion_logs(
        contract_address,
        compute_note_hash_and_nullifier,
    );
}
