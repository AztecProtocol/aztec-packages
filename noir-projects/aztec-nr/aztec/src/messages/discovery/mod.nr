use protocol_types::{address::AztecAddress, debug_log::debug_log};

pub mod nonce_discovery;
pub mod partial_notes;
pub mod pending_tagged_log;
pub mod private_logs;
pub mod private_notes;

use private_notes::MAX_NOTE_PACKED_LEN;

pub struct NoteHashAndNullifier {
    /// The result of NoteHash::compute_note_hash
    pub note_hash: Field,
    /// The result of NoteHash::compute_nullifier_unconstrained (since all of message discovery is unconstrained)
    pub inner_nullifier: Field,
}

/// A function which takes a note's packed content, address of the emitting contract, nonce, storage slot and note type
/// ID and attempts to compute its note hash (not siloed by nonce nor address) and inner nullifier (not siloed by
/// address).
///
/// This function must be user-provided as its implementation requires knowledge of how note type IDs are allocated in a
/// contract. The `#[aztec]` macro automatically creates such a contract library method called
/// `_compute_note_hash_and_nullifier`, which looks something like this:
///
/// ```
/// |packed_note, contract_address, nonce, storage_slot, note_type_id| {
///     if note_type_id == MyNoteType::get_id() {
///         assert(packed_note.len() == MY_NOTE_TYPE_SERIALIZATION_LENGTH);
///
///         let note = MyNoteType::unpack(aztec::utils::array::subarray(packed_note.storage(), 0));
///
///         let note_hash = note.compute_note_hash(storage_slot);
///         let note_hash_for_nullify = aztec::note::utils::compute_note_hash_for_nullify(
///             RetrievedNote{ note, contract_address, metadata: SettledNoteMetadata::new(nonce).into() },
///             storage_slot
///         );
///
///         let inner_nullifier = note.compute_nullifier_unconstrained(note_hash_for_nullify);
///
///         Option::some(
///             aztec::messages::discovery::NoteHashAndNullifier {
///                 note_hash, inner_nullifier
///             }
///         )
///     } else if note_type_id == MyOtherNoteType::get_id() {
///           ... // Similar to above but calling MyOtherNoteType::unpack_content
///     } else {
///         Option::none() // Unknown note type ID
///     };
/// }
/// ```
type ComputeNoteHashAndNullifier<Env> = unconstrained fn[Env](/* packed_note */BoundedVec<Field, MAX_NOTE_PACKED_LEN>, /* storage_slot */ Field, /* note_type_id */ Field, /* contract_address */ AztecAddress, /* nonce */ Field) -> Option<NoteHashAndNullifier>;

/// Performs the message discovery process, in which private are downloaded and inspected to find new private notes,
/// partial notes and events, etc., and pending partial notes are processed to search for their completion logs.
/// This is the mechanism via which a contract updates its knowledge of its private state.
///
/// Receives the address of the contract on which discovery is performed along with its
/// `compute_note_hash_and_nullifier` function.
pub unconstrained fn discover_new_messages<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    debug_log("Performing message discovery");

    private_logs::fetch_and_process_private_tagged_logs(
        contract_address,
        compute_note_hash_and_nullifier,
    );

    partial_notes::fetch_and_process_public_partial_note_completion_logs(
        contract_address,
        compute_note_hash_and_nullifier,
    );
}
