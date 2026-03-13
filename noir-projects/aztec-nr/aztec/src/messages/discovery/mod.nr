use crate::logging::{aztecnr_debug_log, aztecnr_debug_log_format};
use crate::protocol::address::AztecAddress;

pub(crate) mod nonce_discovery;
pub(crate) mod partial_notes;
pub(crate) mod private_events;
pub mod private_notes;
pub mod process_message;

use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::process_message::process_message_ciphertext,
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{
            get_private_logs, MessageContext, offchain::OffchainInboxSync, OffchainMessageWithContext,
            pending_tagged_log::PendingTaggedLog, validate_and_store_enqueued_notes_and_events,
        },
    },
    utils::array,
};

pub struct NoteHashAndNullifier {
    /// The result of [`crate::note::note_interface::NoteHash::compute_note_hash`].
    pub note_hash: Field,
    /// The result of [`crate::note::note_interface::NoteHash::compute_nullifier_unconstrained`].
    ///
    /// This value is unconstrained, as all of message discovery is unconstrained. It is `None` if the nullifier
    /// cannot be computed (e.g. because the nullifier hiding key is not available).
    pub inner_nullifier: Option<Field>,
}

/// A contract's way of computing note hashes and nullifiers.
///
/// Each contract in the network is free to compute their note's hash and nullifiers as they see fit - the hash
/// function itself and the nullifier derivation are not enshrined or standardized. Some aztec-nr functions however do
/// need to know the details of this computation (e.g. when finding new notes), which is what this type represents.
///
/// This function takes a note's packed content, storage slot, note type ID, address of the emitting contract,
/// randomness and note nonce, and attempts to compute its inner note hash (not siloed by address nor uniqued by nonce)
/// and inner nullifier (not siloed by address).
///
/// ## Transient Notes
///
/// This function is meant to always be used on **settled** notes, i.e. those that have been inserted into the trees
/// and for which the nonce is known. It is never invoked in the context of a transient note, as those are not involved
/// in message processing.
///
/// ## Automatic Implementation
///
/// The [`[#aztec]`](crate::macros::aztec::aztec) macro automatically creates a correct implementation of this function
/// for each contract by inspecting all note types in use and the storage layout. This injected function is a
/// `#[contract_library_method]` called `_compute_note_hash_and_nullifier`, and it looks something like this:
///
/// ```noir
/// |packed_note, owner, storage_slot, note_type_id, contract_address, randomness, note_nonce| {
///     if note_type_id == MyNoteType::get_id() {
///         if packed_note.len() != MY_NOTE_TYPE_SERIALIZATION_LENGTH {
///             Option::none()
///         } else {
///             let note = MyNoteType::unpack(aztec::utils::array::subarray(packed_note.storage(), 0));
///
///             let note_hash = note.compute_note_hash(owner, storage_slot, randomness);
///             let note_hash_for_nullification = aztec::note::utils::compute_note_hash_for_nullification(
///                 HintedNote {
///                     note, contract_address, owner, randomness, storage_slot,
///                     metadata: SettledNoteMetadata::new(note_nonce).into(),
///                 },
///             );
///
///             let inner_nullifier = note.compute_nullifier_unconstrained(owner, note_hash_for_nullification);
///
///             Option::some(
///                 aztec::messages::discovery::NoteHashAndNullifier {
///                     note_hash, inner_nullifier
///                 }
///             )
///         }
///     } else if note_type_id == MyOtherNoteType::get_id() {
///           ... // Similar to above but calling MyOtherNoteType::unpack
///     } else {
///         Option::none() // Unknown note type ID
///     };
/// }
/// ```
pub type ComputeNoteHashAndNullifier<Env> = unconstrained fn[Env](/* packed_note */BoundedVec<Field, MAX_NOTE_PACKED_LEN>, /*
 owner */ AztecAddress, /* storage_slot */ Field, /* note_type_id */ Field, /* contract_address */ AztecAddress, /*
randomness */ Field, /* note nonce */ Field) -> Option<NoteHashAndNullifier>;

/// A handler for custom messages.
///
/// Contracts that emit custom messages (i.e. any with a message type that is not in [`crate::messages::msg_type`])
/// need to use [`crate::macros::AztecConfig::custom_message_handler`] with a function of this type in order to
/// process them. They will otherwise be **silently ignored**.
pub type CustomMessageHandler<Env> = unconstrained fn[Env](
/* contract_address */AztecAddress,
/* msg_type_id */ u64,
/* msg_metadata */ u64,
/* msg_content */ BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
/* message_context */ MessageContext);

/// Synchronizes the contract's private state with the network.
///
/// As blocks are mined, it is possible for a contract's private state to change (e.g. with new notes being created),
/// but because these changes are private they will be invisible to most actors. This is the function that processes
/// new transactions in order to discover new notes, events, and other kinds of private state changes.
///
/// The private state will be synchronized up to the block that will be used for private transactions (i.e. the anchor
/// block. This will typically be close to the tip of the chain.
pub unconstrained fn do_sync_state<ComputeNoteHashAndNullifierEnv, CustomMessageHandlerEnv>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<ComputeNoteHashAndNullifierEnv>,
    process_custom_message: Option<CustomMessageHandler<CustomMessageHandlerEnv>>,
    offchain_inbox_sync: Option<OffchainInboxSync<()>>,
) {
    aztecnr_debug_log!("Performing state synchronization");

    // First we process all private logs, which can contain different kinds of messages e.g. private notes, partial
    // notes, private events, etc.
    let logs = get_private_logs(contract_address);
    logs.for_each(|i, pending_tagged_log: PendingTaggedLog| {
        aztecnr_debug_log_format!("Processing log with tag {0}")([pending_tagged_log.log.get(0)]);

        // We remove the tag from the pending tagged log and process the message ciphertext contained in it.
        let message_ciphertext = array::subbvec(pending_tagged_log.log, 1);

        process_message_ciphertext(
            contract_address,
            compute_note_hash_and_nullifier,
            process_custom_message,
            message_ciphertext,
            pending_tagged_log.context,
        );

        // We need to delete each log from the array so that we won't process them again. `CapsuleArray::for_each`
        // allows deletion of the current element during iteration, so this is safe.
        // Note that this (and all other database changes) will only be committed if contract execution succeeds,
        // including any enqueued validation requests.
        logs.remove(i);
    });

    if offchain_inbox_sync.is_some() {
        let msgs: CapsuleArray<OffchainMessageWithContext> = offchain_inbox_sync.unwrap()(contract_address);
        msgs.for_each(|i, msg| {
            process_message_ciphertext(
                contract_address,
                compute_note_hash_and_nullifier,
                process_custom_message,
                msg.message_ciphertext,
                msg.message_context,
            );
            // The inbox sync returns _a copy_ of messages to process, so we clear them as we do so. This is a
            // volatile array with the to-process message, not the actual persistent storage of them.
            msgs.remove(i);
        });
    }

    // Then we process all pending partial notes, regardless of whether they were found in the current or previous
    // executions.
    partial_notes::fetch_and_process_partial_note_completion_logs(contract_address, compute_note_hash_and_nullifier);

    // Finally we validate all notes and events that were found as part of the previous processes, resulting in them
    // being added to PXE's database and retrievable via oracles (get_notes) and our TS API (PXE::getPrivateEvents).
    validate_and_store_enqueued_notes_and_events(contract_address);
}
