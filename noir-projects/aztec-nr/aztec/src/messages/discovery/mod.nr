use crate::logging::{aztecnr_debug_log, aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::address::AztecAddress;

pub(crate) mod nonce_discovery;
pub(crate) mod partial_notes;
pub(crate) mod private_events;
pub mod private_notes;
pub mod process_message;

use crate::{
    messages::{
        discovery::process_message::process_message_ciphertext,
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{
            MessageContext, offchain::OffchainInboxSync, OffchainMessageWithContext,
            pending_tagged_log::PendingTaggedLog, validate_and_store_enqueued_notes_and_events,
        },
    },
    oracle::message_processing,
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

/// A contract's way of computing note hashes.
///
/// Each contract in the network is free to compute their note's hash as they see fit - the hash function itself is not
/// enshrined or standardized. Some aztec-nr functions however do need to know the details of this computation (e.g.
/// when finding new notes), which is what this type represents.
///
/// This function takes a note's packed content, storage slot, note type ID, address of the emitting contract and
/// randomness, and attempts to compute its inner note hash (not siloed by address nor uniqued by nonce).
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
/// `#[contract_library_method]` called `_compute_note_hash`, and it looks something like this:
///
/// ```noir
/// |packed_note, owner, storage_slot, note_type_id, _contract_address, randomness| {
///     if note_type_id == MyNoteType::get_id() {
///         if packed_note.len() != MY_NOTE_TYPE_SERIALIZATION_LENGTH {
///             Option::none()
///         } else {
///             let note = MyNoteType::unpack(aztec::utils::array::subarray(packed_note.storage(), 0));
///             Option::some(note.compute_note_hash(owner, storage_slot, randomness))
///         }
///     } else if note_type_id == MyOtherNoteType::get_id() {
///           ... // Similar to above but calling MyOtherNoteType::unpack
///     } else {
///         Option::none() // Unknown note type ID
///     };
/// }
/// ```
pub type ComputeNoteHash = unconstrained fn(/* packed_note */BoundedVec<Field, MAX_NOTE_PACKED_LEN>, /*
 owner */ AztecAddress, /* storage_slot */ Field, /* note_type_id */ Field, /* contract_address */ AztecAddress, /*
randomness */ Field) -> Option<Field>;

/// A contract's way of computing note nullifiers.
///
/// Like [`ComputeNoteHash`], each contract is free to derive nullifiers as they see fit. This function takes the
/// unique note hash (used as the note hash for nullification for settled notes), plus the note's packed content and
/// metadata, and attempts to compute the inner nullifier (not siloed by address).
///
/// ## Automatic Implementation
///
/// The [`[#aztec]`](crate::macros::aztec::aztec) macro automatically creates a correct implementation of this function
/// for each contract called `_compute_note_nullifier`. It dispatches on `note_type_id` similarly to
/// [`ComputeNoteHash`], then calls the note's
/// [`compute_nullifier_unconstrained`](crate::note::note_interface::NoteHash::compute_nullifier_unconstrained) method.
pub type ComputeNoteNullifier = unconstrained fn(/* unique_note_hash */Field, /* packed_note */ BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
/* owner */ AztecAddress, /* storage_slot */ Field, /* note_type_id */ Field, /* contract_address */ AztecAddress,
/* randomness */ Field) -> Option<Field>;

/// Deprecated: use [`ComputeNoteHash`] and [`ComputeNoteNullifier`] instead.
pub type ComputeNoteHashAndNullifier<Env> = unconstrained fn[Env](/* packed_note */BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
/* owner */ AztecAddress, /* storage_slot */ Field, /* note_type_id */ Field, /* contract_address */ AztecAddress,
/*randomness */ Field, /* note nonce */ Field) -> Option<NoteHashAndNullifier>;

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
/* message_context */ MessageContext,
/* scope */ AztecAddress);

/// Synchronizes the contract's private state with the network.
///
/// As blocks are mined, it is possible for a contract's private state to change (e.g. with new notes being created),
/// but because these changes are private they will be invisible to most actors. This is the function that processes
/// new transactions in order to discover new notes, events, and other kinds of private state changes.
///
/// The private state will be synchronized up to the block that will be used for private transactions (i.e. the anchor
/// block. This will typically be close to the tip of the chain.
pub unconstrained fn do_sync_state<CustomMessageHandlerEnv>(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler<CustomMessageHandlerEnv>>,
    offchain_inbox_sync: Option<OffchainInboxSync<()>>,
    scope: AztecAddress,
) {
    aztecnr_debug_log!("Performing state synchronization");

    // First we process all private logs, which can contain different kinds of messages e.g. private notes, partial
    // notes, private events, etc.
    let logs = message_processing::get_pending_tagged_logs(scope);
    logs.for_each(|_i, pending_tagged_log: PendingTaggedLog| {
        if pending_tagged_log.log.len() == 0 {
            aztecnr_warn_log_format!("Skipping empty log from tx {0}")([pending_tagged_log.context.tx_hash]);
        } else {
            aztecnr_debug_log_format!("Processing log with tag {0}")([pending_tagged_log.log.get(0)]);

            // We remove the tag from the pending tagged log and process the message ciphertext contained in it.
            let message_ciphertext = array::subbvec(pending_tagged_log.log, 1);

            process_message_ciphertext(
                contract_address,
                compute_note_hash,
                compute_note_nullifier,
                process_custom_message,
                message_ciphertext,
                pending_tagged_log.context,
                scope,
            );
        }
    });

    if offchain_inbox_sync.is_some() {
        let msgs = offchain_inbox_sync.unwrap()(contract_address, scope);
        msgs.for_each(|_i, msg: OffchainMessageWithContext| {
            process_message_ciphertext(
                contract_address,
                compute_note_hash,
                compute_note_nullifier,
                process_custom_message,
                msg.message_ciphertext,
                msg.message_context,
                scope,
            );
        });
    }

    // Then we process all pending partial notes, regardless of whether they were found in the current or previous
    // executions.
    partial_notes::fetch_and_process_partial_note_completion_logs(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        scope,
    );

    // Finally we validate all notes and events that were found as part of the previous processes, resulting in them
    // being added to PXE's database and retrievable via oracles (get_notes) and our TS API (PXE::getPrivateEvents).
    validate_and_store_enqueued_notes_and_events(scope);
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::messages::{
        discovery::{CustomMessageHandler, do_sync_state},
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{offchain::OffchainInboxSync, pending_tagged_log::PendingTaggedLog},
    };
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;

    #[test]
    unconstrained fn do_sync_state_does_not_panic_on_empty_logs() {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();

        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            // Mock the oracle call to return a known base slot, then populate an ephemeral
            // array at that slot so do_sync_state processes a non-empty log list.
            let base_slot = 42;
            let mock = std::test::OracleMock::mock("aztec_utl_getPendingTaggedLogs_v2");
            let _ = mock.returns(base_slot);

            let logs: EphemeralArray<PendingTaggedLog> = EphemeralArray::at(base_slot);
            logs.push(PendingTaggedLog { log: BoundedVec::new(), context: std::mem::zeroed() });
            assert_eq(logs.len(), 1);

            let no_handler: Option<CustomMessageHandler<()>> = Option::none();
            let no_inbox_sync: Option<OffchainInboxSync<()>> = Option::none();
            do_sync_state(
                contract_address,
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
                no_handler,
                no_inbox_sync,
                scope,
            );
        });
    }

    unconstrained fn dummy_compute_note_hash(
        _packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        _owner: AztecAddress,
        _storage_slot: Field,
        _note_type_id: Field,
        _contract_address: AztecAddress,
        _randomness: Field,
    ) -> Option<Field> {
        Option::none()
    }

    unconstrained fn dummy_compute_note_nullifier(
        _unique_note_hash: Field,
        _packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        _owner: AztecAddress,
        _storage_slot: Field,
        _note_type_id: Field,
        _contract_address: AztecAddress,
        _randomness: Field,
    ) -> Option<Field> {
        Option::none()
    }
}
