use dep::protocol_types::{
    address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS, debug_log::debug_log,
};

pub mod private_logs;
pub mod partial_notes;
pub mod nonce_discovery;

/// We reserve two fields in the note private log that are not part of the note content: one for the storage slot, and
/// one for the combined log and note type ID.
global NOTE_PRIVATE_LOG_RESERVED_FIELDS: u32 = 2;

/// The maximum length of the packed representation of a note's contents. This is limited by private log size and extra
/// fields in the log (e.g. the combined log and note type ID).
// TODO (#11634): we're assuming here that the entire log is plaintext, which is not true due to headers, encryption
// padding, etc. Notes can't actually be this large.
pub global MAX_NOTE_PACKED_LEN: u32 = PRIVATE_LOG_SIZE_IN_FIELDS - NOTE_PRIVATE_LOG_RESERVED_FIELDS;

pub struct NoteHashAndNullifier {
    /// The result of NoteInterface::compute_note_hash
    pub note_hash: Field,
    /// The result of NullifiableNote::compute_nullifier_without_context
    pub inner_nullifier: Field,
}

/// A function which takes a note's packed content, address of the emitting contract, nonce, storage slot and note type
/// ID and attempts to compute its note hash (not siloed by nonce nor address) and inner nullifier (not siloed by
/// address).
///
/// This function must be user-provided as its implementation requires knowledge of how note type IDs are allocated in a
/// contract. A typical implementation would look like this:
///
/// ```
/// |packed_note_content, contract_address, nonce, storage_slot, note_type_id| {
///     if note_type_id == MyNoteType::get_note_type_id() {
///         assert(packed_note_content.len() == MY_NOTE_TYPE_SERIALIZATION_LENGTH);
///         let hashes = dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
///             MyNoteType::unpack_content,
///             note_header,
///             true,
///             packed_note_content.storage(),
///         )
///
///         Option::some(dep::aztec::oracle::management::NoteHashesAndNullifier {
///             note_hash: hashes[0],
///             inner_nullifier: hashes[3],
///         })
///     } else if note_type_id == MyOtherNoteType::get_note_type_id() {
///           ... // Similar to above but calling MyOtherNoteType::unpack_content
///     } else {
///         Option::none() // Uknown note type ID
///     };
/// }
/// ```
type ComputeNoteHashAndNullifier<Env> = fn[Env](/* packed_note_content */BoundedVec<Field, MAX_NOTE_PACKED_LEN>, /* contract_address */ AztecAddress, /* nonce */ Field, /* storage_slot */ Field, /* note_type_id */ Field) -> Option<NoteHashAndNullifier>;

/// Performs the note discovery process, in which private and public logs are downloaded and inspected to find private
/// notes, partial notes, and their completion. This is the mechanism via which PXE learns of new notes.
///
/// Receives the address of the contract on which discovery is performed (i.e. the contract that emitted the notes)
/// along with its `compute_note_hash_and_nullifier` function.
pub unconstrained fn discover_new_notes<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
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
