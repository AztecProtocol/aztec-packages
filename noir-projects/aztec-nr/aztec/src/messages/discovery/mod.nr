use crate::logging::{aztecnr_debug_log, aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::address::AztecAddress;

pub mod nonce_discovery;
pub mod partial_notes;
pub mod private_events;
pub mod private_notes;
pub mod process_message;

use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::process_message::process_message_ciphertext,
        logs::note::MAX_NOTE_PACKED_LEN,
        processing::{
            get_private_logs, offchain::OffchainInboxSync, OffchainMessageWithContext,
            pending_tagged_log::PendingTaggedLog, validate_and_store_enqueued_notes_and_events,
        },
    },
    utils::array,
};

pub struct NoteHashAndNullifier {
    /// The result of NoteHash::compute_note_hash
    pub note_hash: Field,
    /// The result of NoteHash::compute_nullifier_unconstrained (since all of message discovery is unconstrained).
    /// This is `None` if the nullifier cannot be computed (e.g., because the nullifier hiding key is not available).
    pub inner_nullifier: Option<Field>,
}

/// A function which takes a note's packed content, address of the emitting contract, note nonce, storage slot and note
/// type ID and attempts to compute its note hash (not hashed by note nonce nor siloed by address) and inner nullifier
/// (not siloed by address).
///
/// This function must be user-provided as its implementation requires knowledge of how note type IDs are allocated in
/// a contract. The `#[aztec]` macro automatically creates such a contract library method called
/// `_compute_note_hash_and_nullifier`, which looks something like this:
///
/// ```
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

/// Performs the state synchronization process, in which private logs are downloaded and inspected to find new private
/// notes, partial notes and events, etc., and pending partial notes are processed to search for their completion logs.
/// This is the mechanism via which a contract updates its knowledge of its private state.
///
/// Note that the state is synchronized up to the latest block synchronized by PXE (referred to as "anchor block").
/// That should be close to the chain tip as block synchronization is performed before contract function simulation is
/// done.
///
/// Receives the address of the contract on which discovery is performed along with its
/// `compute_note_hash_and_nullifier` function.
pub unconstrained fn do_sync_state<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    offchain_inbox_sync: Option<OffchainInboxSync<()>>,
) {
    aztecnr_debug_log!("Performing state synchronization");

    // First we process all private logs, which can contain different kinds of messages e.g. private notes, partial
    // notes, private events, etc.
    let mut logs = get_private_logs(contract_address);
    logs.for_each(|i, pending_tagged_log: PendingTaggedLog| {
        if pending_tagged_log.log.len() == 0 {
            aztecnr_warn_log_format!("Skipping empty log from tx {0}")([pending_tagged_log.context.tx_hash]);
        } else {
            aztecnr_debug_log_format!("Processing log with tag {0}")([pending_tagged_log.log.get(0)]);

            // We remove the tag from the pending tagged log and process the message ciphertext contained in it.
            let message_ciphertext = array::subbvec(pending_tagged_log.log, 1);

            process_message_ciphertext(
                contract_address,
                compute_note_hash_and_nullifier,
                message_ciphertext,
                pending_tagged_log.context,
            );
        }

        // We need to delete each log from the array so that we won't process them again.
        // `CapsuleArray::for_each` allows deletion of the current element during iteration,
        // so this is safe.
        // Note that this (and all other database changes) will only be committed if contract
        // execution succeeds, including any enqueued validation requests.
        logs.remove(i);
    });

    if offchain_inbox_sync.is_some() {
        let msgs: CapsuleArray<OffchainMessageWithContext> = offchain_inbox_sync.unwrap()(contract_address);
        msgs.for_each(|i, msg| {
            process_message_ciphertext(
                contract_address,
                compute_note_hash_and_nullifier,
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

mod test {
    use crate::{
        capsules::CapsuleArray,
        messages::{
            discovery::{do_sync_state, NoteHashAndNullifier},
            logs::note::MAX_NOTE_PACKED_LEN,
            processing::{
                offchain::OffchainInboxSync, pending_tagged_log::PendingTaggedLog, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT,
            },
        },
        test::helpers::test_environment::TestEnvironment,
    };
    use crate::protocol::address::AztecAddress;

    #[test]
    unconstrained fn do_sync_state_does_not_panic_on_empty_logs() {
        let env = TestEnvironment::new();

        let contract_address = AztecAddress { inner: 0xdeadbeef };

        env.utility_context_at(contract_address, |_| {
            let base_slot = PENDING_TAGGED_LOG_ARRAY_BASE_SLOT;

            let logs: CapsuleArray<PendingTaggedLog> = CapsuleArray::at(contract_address, base_slot);
            logs.push(PendingTaggedLog { log: BoundedVec::new(), context: std::mem::zeroed() });
            assert_eq(logs.len(), 1);

            let no_inbox_sync: Option<OffchainInboxSync<()>> = Option::none();
            do_sync_state(contract_address, dummy_compute_nhnn, no_inbox_sync);

            assert_eq(logs.len(), 0);
        });
    }

    unconstrained fn dummy_compute_nhnn(
        _packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        _owner: AztecAddress,
        _storage_slot: Field,
        _note_type_id: Field,
        _contract_address: AztecAddress,
        _randomness: Field,
        _note_nonce: Field,
    ) -> Option<NoteHashAndNullifier> {
        Option::none()
    }
}
