//! The finite state machine to process a single partial note.
//!
//! A partial note arrives in two parts: a private part (delivered first, carrying the owner, randomness, completion-log
//! tag, note type, and packed private content) and a public *completion log* (storage slot + packed public content).
//! The note can only be discovered and stored once both are combined. The state chart below summarizes how a single
//! partial note's process unfolds, including how reorgs cause it to rewind.
//!
//! ```text
//!                   init() (partial note delivery message, including tx and block data)
//!                         |
//!                         v
//!                     +-----------+    completion log found         +-----------+
//!                ---- |           | ------------------------------> |           |
//!  log not found |    |           |                                 |           |     discover note(s),
//!                |--> |  PENDING  |                                 | COMPLETED | ~~> enqueue for storage, etc
//!                     |           | <------------------------------ |           |
//!                     |           |  completion log block re-orged  |           |
//!                     +-----------+                                 +-----------+
//!                         |                                               |
//!                         |  delivery message block re-orged              |  completion log block finalized
//!                         v                                               v
//!                   +---------------------------------------------------------+
//!                   |               TERMINATED (process ends)                 |
//!                   +---------------------------------------------------------+
//! ```
//!
//! ## States
//!
//! - **Pending**: the private part has been received but the completion log has not been found yet. While in this
//!   state, message discovery keeps searching for that log on each sync.
//! - **Completed**: the completion log was found, so the note was completed and enqueued for storage. Because the
//!   block containing the completion log can be dropped by a reorg, this state is not terminal until the block
//!   finalizes: a reorg dropping it rewinds the FSM back to `Pending` state.
//! - **Terminated**: nothing else can be done with the partial note, either because its delivery block was re-orged
//!   away (so the delivery itself was reverted) or because its completion block has finalized (so the discovered note
//!   is permanent and reorg-proof). This is the terminal state of this FSM.
//!
//! ## Transitions (each evaluated by [`step`](PartialNoteFsm::step))
//!
//! - **Pending -> Completed** ([`complete_with_log`](PartialNoteFsm::complete_with_log)): the completion log is
//!   found. Its public content is combined with the delivered private content, the resulting note(s) are discovered
//!   and enqueued for storage.
//! - **Completed -> Pending**: the completion log block is re-orged out. The completion log is searched for again.
//! - **Pending -> Terminated**: the delivery block is re-orged out, retracting the `delivered` birth fact. The
//!   delivery was reverted, so there is nothing left to do.
//! - **Completed -> Terminated**: the completion log block finalizes, making the discovered note reorg-proof, so the
//!   reception is complete and its collection is deleted.
//!
//! ## Implementation
//!
//! Each pending partial note is tracked as a [fact collection](crate::facts::FactCollection) of type
//! `PARTIAL_NOTE_RECEPTION_TYPE_ID`, identified by a hash of its [`DeliveredPendingPartialNote`] content (so
//! re-delivery of the same partial note is idempotent). The collection holds:
//!
//! - a retractable `PARTIAL_NOTE_DELIVERED` birth fact tied to a delivery block (so a reorg of that block auto-prunes
//!   the pending note), whose payload is the serialized [`DeliveredPendingPartialNote`];
//! - once the completion log is found, a retractable `PARTIAL_NOTE_COMPLETED` fact tied to the completion log block.
//!
//! Status folds from the canonical fact set:
//!     - `delivered` only ⇒ Pending
//!     - `delivered` + `completed` ⇒ Completed
//!
//! A reorg retracting either fact folds the reception back accordingly.
use crate::ephemeral::EphemeralArray;
use crate::facts::{
    delete_fact_collection, Fact, FactCollection, get_fact_collections_by_type, OriginBlock, record_retractable_fact,
    RetractableFactOrigin,
};
use crate::logging::aztecnr_debug_log_format;
use crate::messages::{
    discovery::{ComputeNoteHash, ComputeNoteNullifier, nonce_discovery::attempt_note_nonce_discovery},
    processing::{enqueue_note_for_validation, log_retrieval_response::{LogRetrievalResponse, MAX_LOG_CONTENT_LEN}},
};
use crate::protocol::{address::AztecAddress, hash::{poseidon2_hash, sha256_to_field}, traits::{Deserialize, Serialize}};
use crate::utils::array;
use super::DeliveredPendingPartialNote;

/// Fact-collection type id shared by every partial-note reception in the [fact store](crate::facts).
global PARTIAL_NOTE_RECEPTION_TYPE_ID: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_RECEPTION_TYPE_ID".as_bytes());

/// Fact type id of the birth fact carrying the delivered private partial note.
global PARTIAL_NOTE_DELIVERED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_DELIVERED".as_bytes());

/// Fact type id marking a partial note as completed (its note has been discovered and enqueued).
global PARTIAL_NOTE_COMPLETED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_COMPLETED".as_bytes());

/// A single partial note's finite state machine, backed by a [`FactCollection`](crate::facts::FactCollection).
#[derive(Deserialize, Serialize)]
pub(crate) struct PartialNoteFsm {
    collection: FactCollection,
}

impl PartialNoteFsm {
    /// Initializes an FSM for a freshly discovered partial note.
    ///
    /// The FSM existence is tied to `origin_block`: if `origin_block` is dropped by a reorg, the FSM is transparently
    /// deleted.
    pub(crate) unconstrained fn init(
        contract_address: AztecAddress,
        scope: AztecAddress,
        pending: DeliveredPendingPartialNote,
        origin_block: OriginBlock,
    ) {
        record_retractable_fact(
            contract_address,
            scope,
            PARTIAL_NOTE_RECEPTION_TYPE_ID,
            Self::id_for(pending),
            PARTIAL_NOTE_DELIVERED,
            to_payload(pending),
            origin_block,
        );
    }

    /// Loads every active partial-note FSM for the given contract and scope.
    pub(crate) unconstrained fn load_all(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<PartialNoteFsm> {
        get_fact_collections_by_type(contract_address, scope, PARTIAL_NOTE_RECEPTION_TYPE_ID)
            .map(|collection: FactCollection| PartialNoteFsm { collection })
    }

    /// The fact-collection id identifying a specific partial note.
    fn id_for(pending: DeliveredPendingPartialNote) -> Field {
        poseidon2_hash(pending.serialize())
    }

    /// Reads and decodes the delivered partial note this FSM processes.
    pub(crate) unconstrained fn read_pending_partial_note(self) -> DeliveredPendingPartialNote {
        let delivered = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_DELIVERED).unwrap();
        let mut fields = [0; <DeliveredPendingPartialNote as Deserialize>::N];
        for i in 0..fields.len() {
            fields[i] = delivered.payload.get(i);
        }
        Deserialize::deserialize(fields)
    }

    /// Whether the partial note FSM is in `completed` state, i.e. its note was completed and stored.
    unconstrained fn is_completed(self) -> bool {
        self.collection.facts.any(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED)
    }

    /// Whether the partial note FSM is in `pending` state, i.e. it hasn't been completed yet.
    pub(crate) unconstrained fn is_pending(self) -> bool {
        !self.is_completed()
    }

    /// Origin block of the partial note completion log, if available.
    unconstrained fn completion_log_origin(self) -> Option<RetractableFactOrigin> {
        let maybe_completed = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED);
        if maybe_completed.is_some() {
            maybe_completed.unwrap().origin_block
        } else {
            Option::none()
        }
    }

    /// Transition the partial note FSM as `completed`, conditional to `origin_block`.
    unconstrained fn mark_completed(self, origin_block: OriginBlock) {
        let empty_payload: EphemeralArray<Field> = EphemeralArray::empty();
        record_retractable_fact(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
            PARTIAL_NOTE_COMPLETED,
            empty_payload,
            origin_block,
        );
    }

    /// Terminates this partial note FSM.
    unconstrained fn terminate(self) {
        delete_fact_collection(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
        );
    }

    /// Advances this partial-note FSM by one step.
    ///
    /// Partial notes can only be completed if completion logs have been found for them. Log discovery and
    /// provisioning is responsibility of the caller.
    ///
    /// `compute_note_hash` and `compute_note_nullifier` are injected dependencies.
    pub(crate) unconstrained fn step(
        self,
        maybe_completion_logs: Option<EphemeralArray<LogRetrievalResponse>>,
        compute_note_hash: ComputeNoteHash,
        compute_note_nullifier: ComputeNoteNullifier,
    ) {
        if self.is_pending() {
            self.step_pending(maybe_completion_logs, compute_note_hash, compute_note_nullifier);
        } else {
            self.step_completed();
        }
    }

    /// Processes a partial note in pending state
    ///
    /// Completes the partial note if its completion log is given. If not, the partial note remains in pending state
    /// and its completion log is searched for again on future syncs.
    unconstrained fn step_pending(
        self,
        maybe_completion_logs: Option<EphemeralArray<LogRetrievalResponse>>,
        compute_note_hash: ComputeNoteHash,
        compute_note_nullifier: ComputeNoteNullifier,
    ) {
        if maybe_completion_logs.is_some() {
            let completion_logs = maybe_completion_logs.unwrap();
            let num_logs = completion_logs.len();
            if num_logs != 0 {
                assert(num_logs == 1, f"Expected at most 1 completion log per partial note, got {num_logs}");
                self.complete_with_log(completion_logs.get(0), compute_note_hash, compute_note_nullifier);
            }
        }
    }

    /// Advances partial note in `completed` state: terminates it once the completion log block finalizes, since the
    /// discovered note is then permanent and there is nothing left to track.
    unconstrained fn step_completed(self) {
        if self.completion_log_origin().unwrap().block_state.is_finalized() {
            self.terminate();
        }
    }

    /// Completes a partial note.
    ///
    /// Combines the delivered private content with the log's public content, discovers the resulting note(s), enqueues
    /// them for validation, and transitions the FSM to `completed` state conditional to the completion log's block.
    ///
    /// Because the completion fact is retractable, a reorg of the completion log's block rewinds the FSM back to
    /// `pending` state (which signals that completion log search should restart).
    unconstrained fn complete_with_log(
        self,
        log: LogRetrievalResponse,
        compute_note_hash: ComputeNoteHash,
        compute_note_nullifier: ComputeNoteNullifier,
    ) {
        let pending = self.read_pending_partial_note();

        // The first field in the completion log payload is the storage slot, followed by the public note content.
        let storage_slot = log.log_payload.get(0);
        let public_note_content: BoundedVec<Field, MAX_LOG_CONTENT_LEN - 1> = array::subbvec(log.log_payload, 1);

        // Public fields are placed at the end of the packed representation, so we combine the private and public
        // packed content to get the complete packed note.
        let complete_packed_note = array::append(pending.packed_private_note_content, public_note_content);

        let discovered_notes = attempt_note_nonce_discovery(
            log.unique_note_hashes_in_tx,
            log.first_nullifier_in_tx,
            compute_note_hash,
            compute_note_nullifier,
            self.collection.contract_address,
            pending.owner,
            storage_slot,
            pending.randomness,
            pending.note_type_id,
            complete_packed_note,
        );

        // TODO(#11627): is there anything reasonable we can do if we get a log but it doesn't result in a note being
        // found?
        if discovered_notes.len() == 0 {
            panic(
                f"A partial note's completion log did not result in any notes being found - this should never happen",
            );
        }

        aztecnr_debug_log_format!("Discovered {0} notes for partial note with tag {1}")([
            discovered_notes.len() as Field,
            pending.note_completion_log_tag,
        ]);

        discovered_notes.for_each(|discovered_note| {
            enqueue_note_for_validation(
                self.collection.contract_address,
                pending.owner,
                storage_slot,
                pending.randomness,
                discovered_note.note_nonce,
                complete_packed_note,
                discovered_note.note_hash,
                discovered_note.inner_nullifier,
                log.tx_hash,
            );
        });

        self.mark_completed(OriginBlock { block_number: log.block_number, block_hash: log.block_hash });
    }
}

/// Serializes a [`DeliveredPendingPartialNote`] into a fact payload.
unconstrained fn to_payload(pending: DeliveredPendingPartialNote) -> EphemeralArray<Field> {
    let fields = pending.serialize();
    let payload: EphemeralArray<Field> = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}

mod test {
    use crate::ephemeral::EphemeralArray;
    use crate::facts::OriginBlock;
    use crate::messages::logs::note::MAX_NOTE_PACKED_LEN;
    use crate::messages::processing::log_retrieval_response::LogRetrievalResponse;
    use crate::partial_notes::DeliveredPendingPartialNote;
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::PartialNoteFsm;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    /// A delivered partial note with simple dummy content.
    unconstrained fn make_pending(owner: AztecAddress) -> DeliveredPendingPartialNote {
        DeliveredPendingPartialNote {
            owner,
            randomness: 0x11,
            note_completion_log_tag: 0x22,
            note_type_id: 0x33,
            packed_private_note_content: BoundedVec::new(),
        }
    }

    /// A low block, which TXE (proven == finalized == latest) reports as finalized.
    fn finalized_block() -> OriginBlock {
        OriginBlock { block_number: 1, block_hash: 0 }
    }

    #[test]
    unconstrained fn init_creates_a_partial_note_fsm_in_pending_state() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            let all = PartialNoteFsm::load_all(address, scope);
            assert_eq(all.len(), 1);
            assert(all.get(0).is_pending(), "freshly delivered reception should be pending");
            assert(all.get(0).completion_log_origin().is_none());
        });
    }

    #[test]
    unconstrained fn read_pending_round_trips_the_delivered_content() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            let pending = PartialNoteFsm::load_all(address, scope).get(0).read_pending_partial_note();
            assert_eq(pending.owner, scope);
            assert_eq(pending.randomness, 0x11);
            assert_eq(pending.note_completion_log_tag, 0x22);
            assert_eq(pending.note_type_id, 0x33);
        });
    }

    #[test]
    unconstrained fn mark_completed_moves_to_completed() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            PartialNoteFsm::load_all(address, scope).get(0).mark_completed(finalized_block());

            let reloaded = PartialNoteFsm::load_all(address, scope).get(0);
            assert(reloaded.is_completed(), "should be completed after mark_completed");
            assert(reloaded.completion_log_origin().unwrap().block_state.is_finalized());
        });
    }

    #[test]
    unconstrained fn terminate_deletes_the_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            PartialNoteFsm::load_all(address, scope).get(0).terminate();
            assert_eq(PartialNoteFsm::load_all(address, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn re_init_is_idempotent() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            assert_eq(PartialNoteFsm::load_all(address, scope).len(), 1);
        });
    }

    #[test]
    unconstrained fn step_leaves_a_pending_reception_untouched_when_it_has_no_completion_log() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());

            // Neither an empty fetched-logs set (`Some(empty)`, the pass-1 "searched, found nothing" case) nor no
            // fetch at all (`None`, the pass-2 case) can complete a pending reception, so it stays pending.
            let no_logs: EphemeralArray<LogRetrievalResponse> = EphemeralArray::empty();
            PartialNoteFsm::load_all(address, scope).get(0).step(
                Option::some(no_logs),
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
            );
            PartialNoteFsm::load_all(address, scope).get(0).step(
                Option::none(),
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
            );

            let all = PartialNoteFsm::load_all(address, scope);
            assert_eq(all.len(), 1);
            assert(all.get(0).is_pending(), "reception without a completion log should stay pending");
        });
    }

    #[test]
    unconstrained fn step_terminates_a_completed_reception_once_its_block_is_finalized() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());
            PartialNoteFsm::load_all(address, scope).get(0).mark_completed(finalized_block());

            // Completed with a finalized completion block: the discovered note is reorg-proof, so step terminates the
            // FSM by deleting its collection.
            PartialNoteFsm::load_all(address, scope).get(0).step(
                Option::none(),
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
            );

            assert_eq(PartialNoteFsm::load_all(address, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn step_keeps_a_completed_reception_while_its_block_is_unfinalized() {
        let (env, scope) = setup();
        // A future block never finalizes here, so the completed reception must survive the step.
        let unfinalized_block = OriginBlock { block_number: env.last_block_number() + 100, block_hash: 0 };
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteFsm::init(address, scope, make_pending(scope), finalized_block());
            PartialNoteFsm::load_all(address, scope).get(0).mark_completed(unfinalized_block);

            // Completed but not yet finalized: step must not terminate it, since a reorg could still fold it back.
            PartialNoteFsm::load_all(address, scope).get(0).step(
                Option::none(),
                dummy_compute_note_hash,
                dummy_compute_note_nullifier,
            );

            let all = PartialNoteFsm::load_all(address, scope);
            assert_eq(all.len(), 1);
            assert(all.get(0).is_completed(), "unfinalized completed reception should survive step");
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
