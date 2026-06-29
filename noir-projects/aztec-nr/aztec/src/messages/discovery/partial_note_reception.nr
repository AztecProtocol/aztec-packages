//! The fact-backed reception machine for a single partial note.
//!
//! A partial note arrives in two parts: a private part (delivered first, carrying the owner, randomness, completion-log
//! tag, note type, and packed private content) and a public *completion log* (storage slot + packed public content).
//! The note can only be discovered and stored once both are combined.
//!
//! Each pending partial note is tracked as a [fact collection](crate::facts::FactCollection) of type
//! `PARTIAL_NOTE_RECEPTION_TYPE_ID`, identified by a hash of its [`DeliveredPendingPartialNote`] content (so
//! re-delivery of the same partial note collapses onto a single reception). The collection holds:
//!
//! - a retractable `PARTIAL_NOTE_DELIVERED` birth fact anchored to the delivery block (so a reorg of that block
//!   auto-prunes the pending note), whose payload is the serialized [`DeliveredPendingPartialNote`];
//! - once the completion log is found, a retractable `PARTIAL_NOTE_COMPLETED` fact anchored to the completion block.
//!
//! Status folds from the canonical fact set: `delivered` only ⇒ Pending; `delivered` + canonical `completed` ⇒
//! Completed. A reorg retracting either fact folds the reception back accordingly. This mirrors
//! [`OffchainReception`](crate::messages::processing::offchain).
use crate::ephemeral::EphemeralArray;
use crate::facts::{
    delete_fact_collection, Fact, FactCollection, get_fact_collections_by_type, OriginBlock, record_retractable_fact,
    RetractableFactOrigin,
};
use crate::logging::aztecnr_debug_log_format;
use crate::messages::{
    discovery::{
        ComputeNoteHash, ComputeNoteNullifier, nonce_discovery::attempt_note_nonce_discovery,
        partial_notes::DeliveredPendingPartialNote,
    },
    processing::{enqueue_note_for_validation, log_retrieval_response::{LogRetrievalResponse, MAX_LOG_CONTENT_LEN}},
};
use crate::protocol::{address::AztecAddress, hash::{poseidon2_hash, sha256_to_field}, traits::{Deserialize, Serialize}};
use crate::utils::array;

/// Fact-collection type id shared by every partial-note reception in the [fact store](crate::facts).
pub(crate) global PARTIAL_NOTE_RECEPTION_TYPE_ID: Field =
    sha256_to_field("AZTEC_NR::PARTIAL_NOTE_RECEPTION_TYPE_ID".as_bytes());

/// Fact type id of the birth fact carrying the delivered private partial note.
global PARTIAL_NOTE_DELIVERED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_DELIVERED".as_bytes());

/// Fact type id marking a partial note as completed (its note has been discovered and enqueued).
global PARTIAL_NOTE_COMPLETED: Field = sha256_to_field("AZTEC_NR::PARTIAL_NOTE_COMPLETED".as_bytes());

/// A single partial note's reception machine, backed by a [`FactCollection`](crate::facts::FactCollection).
#[derive(Deserialize, Serialize)]
pub(crate) struct PartialNoteReception {
    collection: FactCollection,
}

impl PartialNoteReception {
    /// Initializes a reception for a freshly delivered partial note, in the `Pending` state.
    ///
    /// Records the retractable `delivered` birth fact anchored to `origin_block` (the delivery block). Re-initializing
    /// the same partial note is a no-op, which makes redelivery idempotent.
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

    /// Loads every active partial-note reception for the given contract and scope.
    pub(crate) unconstrained fn load_all(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<PartialNoteReception> {
        get_fact_collections_by_type(contract_address, scope, PARTIAL_NOTE_RECEPTION_TYPE_ID)
            .map(|collection: FactCollection| PartialNoteReception { collection })
    }

    /// The fact-collection id identifying a partial note: a hash of its delivered content, so duplicate deliveries
    /// collapse onto a single reception.
    pub(crate) fn id_for(pending: DeliveredPendingPartialNote) -> Field {
        poseidon2_hash(pending.serialize())
    }

    /// Reads and decodes the delivered partial note this reception carries.
    pub(crate) unconstrained fn read_pending(self) -> DeliveredPendingPartialNote {
        let delivered = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_DELIVERED).unwrap();
        let mut fields = [0; <DeliveredPendingPartialNote as Deserialize>::N];
        for i in 0..fields.len() {
            fields[i] = delivered.payload.get(i);
        }
        Deserialize::deserialize(fields)
    }

    /// Returns `true` if this reception has a canonical `completed` fact (i.e. its note was discovered and enqueued).
    pub(crate) unconstrained fn is_completed(self) -> bool {
        self.collection.facts.any(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED)
    }

    /// The `completed` marker's origin (with PXE-injected finality state), if this reception is completed.
    pub(crate) unconstrained fn completed_origin(self) -> Option<RetractableFactOrigin> {
        let maybe_completed = self.collection.facts.find(|f: Fact| f.fact_type_id == PARTIAL_NOTE_COMPLETED);
        if maybe_completed.is_some() {
            maybe_completed.unwrap().origin_block
        } else {
            Option::none()
        }
    }

    /// Records the retractable `completed` marker, anchored to the completion-log block.
    pub(crate) unconstrained fn mark_completed(self, origin_block: OriginBlock) {
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

    /// Terminates this reception by deleting its [fact collection](crate::facts::FactCollection).
    pub(crate) unconstrained fn terminate(self) {
        delete_fact_collection(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
        );
    }

    /// Terminates this reception if it is completed and its completion block has finalized: the resulting note is
    /// then reorg-proof, so there is nothing left to track.
    pub(crate) unconstrained fn terminate_if_finalized(self) {
        if self.is_completed() {
            if self.completed_origin().unwrap().block_state.is_finalized() {
                self.terminate();
            }
        }
    }

    /// Completes a pending reception from its completion log: combines the delivered private content with the log's
    /// public content, discovers the resulting note(s), enqueues them for validation, and records the retractable
    /// `completed` marker anchored to the completion log's block.
    ///
    /// Because the marker is retractable, a reorg of the completion block folds the reception back to pending (the
    /// completion log is then searched for again); the note itself is reorg-handled by the note store.
    pub(crate) unconstrained fn complete_with_log(
        self,
        log: LogRetrievalResponse,
        compute_note_hash: ComputeNoteHash,
        compute_note_nullifier: ComputeNoteNullifier,
    ) {
        let pending = self.read_pending();

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

        self.mark_completed(log.origin_block);
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
    use crate::facts::OriginBlock;
    use crate::messages::discovery::partial_notes::DeliveredPendingPartialNote;
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::PartialNoteReception;

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
    unconstrained fn init_creates_a_pending_reception() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());

            let all = PartialNoteReception::load_all(address, scope);
            assert_eq(all.len(), 1);
            assert(!all.get(0).is_completed(), "freshly delivered reception should be pending");
            assert(all.get(0).completed_origin().is_none());
        });
    }

    #[test]
    unconstrained fn read_pending_round_trips_the_delivered_content() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());

            let pending = PartialNoteReception::load_all(address, scope).get(0).read_pending();
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
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());

            PartialNoteReception::load_all(address, scope).get(0).mark_completed(finalized_block());

            let reloaded = PartialNoteReception::load_all(address, scope).get(0);
            assert(reloaded.is_completed(), "should be completed after mark_completed");
            assert(reloaded.completed_origin().unwrap().block_state.is_finalized());
        });
    }

    #[test]
    unconstrained fn terminate_deletes_the_collection() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());

            PartialNoteReception::load_all(address, scope).get(0).terminate();
            assert_eq(PartialNoteReception::load_all(address, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn re_init_is_idempotent() {
        let (env, scope) = setup();
        env.private_context(|context| {
            let address = context.this_address();
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());
            PartialNoteReception::init(address, scope, make_pending(scope), finalized_block());

            assert_eq(PartialNoteReception::load_all(address, scope).len(), 1);
        });
    }
}
