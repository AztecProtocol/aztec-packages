//! The state machine of a single offchain message reception process.
//!
//! See the [module documentation](super) for the reception state machine that [`OffchainReception`]
//! implements.

use crate::{
    ephemeral::EphemeralArray,
    facts::{
        delete_fact_collection, Fact, FactCollection, get_fact_collections_by_type, OriginBlock,
        record_non_retractable_fact, record_retractable_fact,
    },
    messages::processing::{MessageContext, OffchainMessageWithContext},
    oracle::tx_resolution::ResolvedTx,
    protocol::{
        address::AztecAddress,
        constants::MAX_TX_LIFETIME,
        hash::{poseidon2_hash, sha256_to_field},
        traits::{Deserialize, Serialize},
    },
};
use super::OffchainMessage;

/// Maximum time-to-live for a tx-bound offchain message.
///
/// After `anchor_block_timestamp + MAX_MSG_TTL`, the message is evicted from the inbox.
/// (7200 == 2 hours)
pub(crate) global MAX_MSG_TTL: u64 = MAX_TX_LIFETIME + 7200;

/// Fact type id of the fact that stores the offchain message body inside a reception collection.
global OFFCHAIN_MESSAGE_RECEIVED: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_MESSAGE_RECEIVED".as_bytes());

/// Fact type id to mark an offchain message as processed.
///
/// A reception is in "processed state" exactly when its collection carries a fact of this type.
pub(crate) global OFFCHAIN_MESSAGE_PROCESSED: Field =
    sha256_to_field("AZTEC_NR::OFFCHAIN_MESSAGE_PROCESSED".as_bytes());

/// Fact-collection type id shared by every offchain message reception in the [fact store](crate::facts).
pub(crate) global OFFCHAIN_RECEPTION_TYPE_ID: Field =
    sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_TYPE_ID".as_bytes());

/// A single offchain message reception machine, backed by a [`FactCollection`](crate::facts::FactCollection).
///
/// Wraps the fact collection that tracks one message's progress through the reception state machine (see the
/// [module documentation](super)); the [`OffchainMessage`] it carries is decoded on demand.
#[derive(Deserialize, Serialize)]
pub(crate) struct OffchainReception {
    collection: FactCollection,
}

impl OffchainReception {
    /// Initializes a new reception for a freshly received message, in the `Received` state.
    ///
    /// Re-initializing the same message is a no-op, which makes redelivery idempotent.
    pub(crate) unconstrained fn init(contract_address: AztecAddress, message: OffchainMessage) {
        record_non_retractable_fact(
            contract_address,
            message.recipient,
            OFFCHAIN_RECEPTION_TYPE_ID,
            Self::id_for(message),
            OFFCHAIN_MESSAGE_RECEIVED,
            to_payload(message),
        );
    }

    /// Loads every active reception for the given contract and scope, decoding each message body.
    pub(crate) unconstrained fn load_all(
        contract_address: AztecAddress,
        scope: AztecAddress,
    ) -> EphemeralArray<OffchainReception> {
        get_fact_collections_by_type(contract_address, scope, OFFCHAIN_RECEPTION_TYPE_ID)
            .map(|collection: FactCollection| OffchainReception { collection })
    }

    /// Computes the fact-collection id that identifies a message's reception machine in the [fact store](crate::facts).
    ///
    /// The id is a hash of the message, which makes duplicate receptions of the same message collapse onto a single
    /// reception.
    pub(crate) fn id_for(message: OffchainMessage) -> Field {
        poseidon2_hash(message.serialize())
    }

    /// Decodes and returns the message this reception carries.
    pub(crate) unconstrained fn message(self) -> OffchainMessage {
        read_message(self.collection)
    }

    /// Advances this reception by one step of its state machine. See the [module documentation](super) for the
    /// states, transitions, and expiry rules.
    ///
    /// Returns `Some` with the message and its resolved context when this step determines the message is ready to be
    /// processed.
    pub(crate) unconstrained fn step(
        self,
        maybe_resolved_tx: Option<ResolvedTx>,
        now: u64,
    ) -> Option<OffchainMessageWithContext> {
        // TODO(@mverzilli): we could annotate retractable facts as "final" when their corresponding blocks are below
        // the final tip. Then we could use that as termination condition instead of relying on timestamp arithmetics.
        let message = self.message();
        let expired = now > message.anchor_block_timestamp + MAX_MSG_TTL;
        let already_processed = self.is_processed();

        if !already_processed & maybe_resolved_tx.is_some() {
            let resolved = maybe_resolved_tx.unwrap();
            self.mark_processed(resolved.block_number, resolved.block_hash);
            let message_context = MessageContext {
                tx_hash: resolved.tx_hash,
                unique_note_hashes_in_tx: resolved.unique_note_hashes_in_tx,
                first_nullifier_in_tx: resolved.first_nullifier_in_tx,
            };
            Option::some(
                OffchainMessageWithContext { message_ciphertext: message.ciphertext, message_context },
            )
        } else if expired {
            self.terminate();
            Option::none()
        } else {
            Option::none()
        }
    }

    /// Returns `true` if this reception has been marked processed.
    unconstrained fn is_processed(self) -> bool {
        self.collection.facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED)
    }

    /// Records the retractable processed marker for this reception, originated at the resolved block.
    unconstrained fn mark_processed(self, block_number: u32, block_hash: Field) {
        let empty_payload: EphemeralArray<Field> = EphemeralArray::empty();
        record_retractable_fact(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
            OFFCHAIN_MESSAGE_PROCESSED,
            empty_payload,
            OriginBlock { block_number, block_hash },
        );
    }

    /// Terminates this reception by deleting its [fact collection](crate::facts::FactCollection).
    unconstrained fn terminate(self) {
        delete_fact_collection(
            self.collection.contract_address,
            self.collection.scope,
            self.collection.fact_collection_type_id,
            self.collection.fact_collection_id,
        );
    }
}

/// Serializes an [`OffchainMessage`] into a fact payload.
unconstrained fn to_payload(message: OffchainMessage) -> EphemeralArray<Field> {
    let fields = message.serialize();
    let payload: EphemeralArray<Field> = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}

/// Reads the message body fact back out of a reception collection.
unconstrained fn read_message(collection: FactCollection) -> OffchainMessage {
    let message_fact = collection.facts.find(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_RECEIVED).unwrap();
    let n = <OffchainMessage as Deserialize>::N;
    let mut fields = [0; <OffchainMessage as Deserialize>::N];
    for i in 0..n {
        fields[i] = message_fact.payload.get(i);
    }
    Deserialize::deserialize(fields)
}
