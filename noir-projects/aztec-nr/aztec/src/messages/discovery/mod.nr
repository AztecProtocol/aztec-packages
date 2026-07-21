use crate::ephemeral::EphemeralArray;
use crate::logging::{aztecnr_debug_log, aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::messages::{
    delivery::handshake::{get_handshake_secrets, PROVIDED_SECRETS_ARRAY_BASE_SLOT},
    processing::provided_secret::ProvidedSecret,
};
use crate::partial_notes;
use crate::protocol::address::AztecAddress;

pub(crate) mod nonce_discovery;
pub(crate) mod private_events;
pub mod private_notes;
pub mod process_message;

use crate::{
    messages::{
        discovery::process_message::process_message_ciphertext,
        encoding::MAX_MESSAGE_CONTENT_LEN,
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{
            offchain::OffchainInboxSync, OffchainMessageWithTx, pending_tagged_log::PendingTaggedLog, ResolvedTx,
            validate_and_store_enqueued_notes_and_events,
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
pub type CustomMessageHandler = unconstrained fn(
/* contract_address */AztecAddress,
/* msg_type_id */ u64,
/* msg_metadata */ u64,
/* msg_content */ BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
/* resolved_tx */ ResolvedTx,
/* scope */ AztecAddress);

/// Custom state synchronization handler.
///
/// When set via [`crate::macros::AztecConfig::custom_sync_state`], the generated `sync_state` function will call
/// this handler instead of [`do_sync_state`]. It receives all of the same parameters, so it can run custom logic
/// (e.g. fetching and decrypting custom logs) before, after, or instead of calling [`do_sync_state`].
pub type CustomSyncHandler = unconstrained fn(
/* contract_address */AztecAddress,
/* compute_note_hash */ ComputeNoteHash,
/* compute_note_nullifier */ ComputeNoteNullifier,
/* process_custom_message */ Option<CustomMessageHandler>,
/* offchain_inbox_sync */ Option<OffchainInboxSync>,
/* scope */ AztecAddress);

/// Synchronizes the contract's private state with the network.
///
/// As blocks are mined, it is possible for a contract's private state to change (e.g. with new notes being created),
/// but because these changes are private they will be invisible to most actors. This is the function that processes
/// new transactions in order to discover new notes, events, and other kinds of private state changes.
///
/// The private state will be synchronized up to the block that will be used for private transactions (i.e. the anchor
/// block. This will typically be close to the tip of the chain.
pub unconstrained fn do_sync_state(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let provided_secrets = get_handshake_secrets(contract_address, scope);
    sync_state_with_secrets(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
        provided_secrets,
    );
}

/// Variant of [`do_sync_state`] that skips handshake secret discovery. Used by the HandshakeRegistry to avoid
/// infinite recursion (the registry discovers handshakes for other contracts, not for itself).
pub unconstrained fn do_sync_state_without_handshake_discovery(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let provided_secrets = EphemeralArray::<ProvidedSecret>::empty_at(PROVIDED_SECRETS_ARRAY_BASE_SLOT);
    sync_state_with_secrets(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
        provided_secrets,
    );
}

unconstrained fn sync_state_with_secrets(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
    provided_secrets: EphemeralArray<ProvidedSecret>,
) {
    aztecnr_debug_log!("Performing state synchronization");

    let logs = message_processing::get_pending_tagged_logs(scope, provided_secrets);
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
        msgs.for_each(|_i, msg: OffchainMessageWithTx| {
            process_message_ciphertext(
                contract_address,
                compute_note_hash,
                compute_note_nullifier,
                process_custom_message,
                msg.message_ciphertext,
                msg.resolved_tx,
                scope,
            );
        });
    }

    // Then we process all pending partial notes, regardless of whether they were found in the current or previous
    // executions.
    partial_notes::sync(
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
        delivery::handshake::HandshakePage,
        discovery::{CustomMessageHandler, do_sync_state},
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{offchain::OffchainInboxSync, pending_tagged_log::PendingTaggedLog},
    };
    use crate::protocol::{address::AztecAddress, traits::Serialize};
    use crate::test::helpers::test_environment::TestEnvironment;
    use std::test::OracleMock;

    #[test]
    unconstrained fn do_sync_state_does_not_panic_on_empty_logs() {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();

        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            // get_handshake_secrets calls the HandshakeRegistry during sync; return an empty page so
            // no tagging secrets are produced.
            let empty_page = HandshakePage { items: BoundedVec::new(), total_count: 0 };
            let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(empty_page.serialize());

            // Mock the oracle call to return a known base slot, then populate an ephemeral
            // array at that slot so do_sync_state processes a non-empty log list.
            let base_slot = 42;
            let mock = std::test::OracleMock::mock("aztec_utl_getPendingTaggedLogsV2");
            let _ = mock.returns(base_slot);

            let logs: EphemeralArray<PendingTaggedLog> = EphemeralArray::at(base_slot);
            logs.push(PendingTaggedLog { log: BoundedVec::new(), context: std::mem::zeroed() });
            assert_eq(logs.len(), 1);

            let no_handler: Option<CustomMessageHandler> = Option::none();
            let no_inbox_sync: Option<OffchainInboxSync> = Option::none();
            do_sync_state(
                contract_address,
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
                no_handler,
                no_inbox_sync,
                scope,
            );

            // Guards against the mocked oracle name going stale: if sync stops calling it, the crafted empty log
            // above is never consumed and the test silently stops covering the empty-payload path.
            assert_eq(mock.times_called(), 1);
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
