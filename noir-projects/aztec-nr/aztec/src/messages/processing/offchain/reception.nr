//! The state machine of a single offchain message reception process.
//!
//! Offchain processing needs to handle some complexity, including the possibility of reorgs reverting message effects,
//! and the need to reprocess messages in that case. The state chart below summarizes the current behavior.
//!
//! ```text
//!                   offchain_receive() (process starts)
//!                         |
//!                         v
//!                     +-----------+     tx found onchain        +-----------+
//!                ---- |           | --------------------------> |           |
//!  tx not found  |    |           |                             |           |     discover notes,
//!                |--> | RECEIVED  |                             | PROCESSED | ~~> events, etc
//!                     |           | <-------------------------- |           |
//!                     |           |   tx block re-orged         |           |
//!                     +-----------+                             +-----------+
//!                         |                                         |
//!                         |  TTL expired                            |  TTL expired
//!                         v                                         v
//!                   +---------------------------------------------------------+
//!                   |               TERMINATED (process ends)                 |
//!                   +---------------------------------------------------------+
//! ```
//!
//! ## States
//!
//! - **Received**: the message is stored but its originating transaction has not been found onchain yet (or the
//!   message is tx-less; see below). While the reception process is in this state, it keeps looking for the
//    transaction onchain.
//! - **Processed**: the message has been handed off for processing. If there weren't reorgs, reaching this state would
//!   be equivalent to terminating the reception process. Since reorgs are a possibility, this state is not terminal.
//! - **Terminated**: the message has reached its TTL which means nothing else can be done with it. This is the
//!   terminal state of this process.
//!
//! ## Transitions (each evaluated by [`OffchainReception::step`])
//!
//! - **Received -> Processed**: the originating transaction is found onchain. The message (packaged with its
//!   transaction context) is queued to have its actual contents processed (which can lead for example to the discovery
//!   of notes and events).
//! - **Processed -> Received**: the block where the message transaction was originally found is re-orged out.
//! - **Received -> Terminated**: the message TTL has elapsed (see below), so the message is no longer processable.
//! - **Processed -> Terminated**: the message TTL has elapsed (see below), so the effects of its processing are
//!   permanent.
//!
//! # Message reception lifecycle and the TTL
//!
//! A reception expires once `now > anchor_block_timestamp + MAX_MSG_TTL`, where `MAX_MSG_TTL = MAX_TX_LIFETIME + 2h`.
//! A transaction anchored at a given block can only be mined within
//! [`MAX_TX_LIFETIME`](crate::protocol::constants::MAX_TX_LIFETIME) of that block, so once that
//! window (plus a safety margin of 2 hours) has elapsed the originating transaction can no longer appear, and it is
//! safe to stop looking for it.
//!
//! Already-processed receptions reuse the same TTL: we could instead wait for the block that included the transaction
//! to finalize, but we currently do not have the primitives to reliably get that information.
//!
//! # Current limitations, future plans
//!
//! - Tx-less messages never reach `Processed` and are only ever removed by expiry. This will be supported in the
//!   future.
//! - Already-processed receptions stay active longer than needed. As discussed, we need access to block finality
//!   information to properly implement that case, which will be added in the future.
//!
//! # Implementation
//!
//! [`OffchainReception::init`] creates a [fact collection](crate::facts::FactCollection) of type
//! `OFFCHAIN_RECEPTION_TYPE_ID`. The fact collection is identified by a hash of the `OffchainMessage` it tracks, which
//! makes duplicate calls to `init` idempotent.
//!
//! Upon reception, an `OFFCHAIN_MESSAGE_RECEIVED` [non-retractable fact](crate::facts::record_non_retractable_fact) is
//! recorded. The fact's payload is the `OffchainMessage` itself, which persists it to be subsequently processed.
//! A fact collection with just an `OFFCHAIN_MESSAGE_RECEIVED` fact represents an active reception process in the
//! RECEIVED state from our state chart above.
//!
//! The message reception state machine is driven externally, advancing one step at a time each time
//! [`OffchainReception::step`] is invoked. [`OffchainReception::step`] implements the rest of the reception state
//! machine described above.
//!
//! When stepping, if the transaction to the message is found onchain, an `OFFCHAIN_MESSAGE_PROCESSED`
//! [retractable fact](crate::facts::record_retractable_fact) associated to the block where the transaction was found is
//! recorded.
//! Note that since this fact is retractable, a reorg dropping said block would result in the fact being automatically
//! removed by PXE, effectively pushing the reception process back to `RECEIVED` state.
//!
//! To determine in which state of the reception process we are we just need to analyze the recorded facts available
//! in combination with the TTL:
//!
//! - If the TTL has elapsed, we reached the end of the process and the [fact collection](crate::facts::FactCollection)
//! can (and should) be deleted.
//! - Otherwise:
//!     - If there is an `OFFCHAIN_MESSAGE_PROCESSED` fact we are in PROCESSED state and there is nothing to do.
//!     - If there is only an `OFFCHAIN_MESSAGE_RECEIVED` fact we are in RECEIVED state, so we need to check if the
//!       message transaction is now available onchain, and if so, exercise the RECEIVED->PROCESSED transition.
//!
//! The PROCESSED->RECEIVED transition is transparently handled by PXE: if a re-org caused the message transaction to
//! fall off the chain, the `OFFCHAIN_MESSAGE_PROCESSED` fact disappears, taking us back to the RECEIVED state.

use crate::{
    ephemeral::EphemeralArray,
    facts::{
        delete_fact_collection, Fact, FactCollection, get_fact_collection, get_fact_collections_by_type, OriginBlock,
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

    /// Reads and returns the message this reception carries, decoding it from its fact collection.
    pub(crate) unconstrained fn read_message(self) -> OffchainMessage {
        let message_fact = self.collection.facts.find(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_RECEIVED).unwrap();
        let n = <OffchainMessage as Deserialize>::N;
        let mut fields = [0; <OffchainMessage as Deserialize>::N];
        for i in 0..n {
            fields[i] = message_fact.payload.get(i);
        }
        Deserialize::deserialize(fields)
    }

    /// Computes the fact-collection id that identifies a message's reception machine in the [fact store](crate::facts).
    ///
    /// The id is a hash of the message, which makes duplicate receptions of the same message collapse onto a single
    /// reception.
    pub(crate) fn id_for(message: OffchainMessage) -> Field {
        poseidon2_hash(message.serialize())
    }

    /// Returns `true` if a reception for `message` is currently active for the given contract and scope.
    pub(crate) unconstrained fn is_active(
        contract_address: AztecAddress,
        scope: AztecAddress,
        message: OffchainMessage,
    ) -> bool {
        get_fact_collection(
            contract_address,
            scope,
            OFFCHAIN_RECEPTION_TYPE_ID,
            Self::id_for(message),
        )
            .is_some()
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
        let message = self.read_message();
        let expired = now > message.anchor_block_timestamp + MAX_MSG_TTL;
        let already_processed = self.collection.facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED);

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

    /// Returns `true` if the reception for `message` has been marked processed.
    pub(crate) unconstrained fn is_processed(
        contract_address: AztecAddress,
        scope: AztecAddress,
        message: OffchainMessage,
    ) -> bool {
        let maybe_collection = get_fact_collection(
            contract_address,
            scope,
            OFFCHAIN_RECEPTION_TYPE_ID,
            Self::id_for(message),
        );
        if maybe_collection.is_some() {
            maybe_collection.unwrap().facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED)
        } else {
            false
        }
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

mod test {
    use crate::{
        messages::processing::offchain::OffchainMessage,
        oracle::{random::random, tx_resolution::ResolvedTx},
        protocol::address::AztecAddress,
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{MAX_MSG_TTL, OffchainReception};

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    /// Creates an `OffchainMessage` with dummy ciphertext and the given scope as recipient.
    fn make_msg(recipient: AztecAddress, tx_hash: Option<Field>, anchor_block_timestamp: u64) -> OffchainMessage {
        OffchainMessage { ciphertext: BoundedVec::new(), recipient, tx_hash, anchor_block_timestamp }
    }

    /// Builds the resolved-tx context PXE would return for `tx_hash`.
    fn resolved_tx(tx_hash: Field) -> ResolvedTx {
        ResolvedTx {
            tx_hash,
            unique_note_hashes_in_tx: BoundedVec::new(),
            first_nullifier_in_tx: 0,
            block_number: 1,
            block_hash: 0,
        }
    }

    #[test]
    unconstrained fn expired_reception_is_terminated() {
        let (env, scope) = setup();
        let msg = make_msg(scope, Option::some(random()), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            OffchainReception::init(address, msg);
            let reception = OffchainReception::load_all(address, scope).get(0);

            // Past the TTL with no resolved tx: the reception is terminated.
            assert(reception.step(Option::none(), MAX_MSG_TTL + 1).is_none());
            assert(!OffchainReception::is_active(address, scope, msg), "expired reception should be terminated");
        });
    }

    #[test]
    unconstrained fn unresolved_reception_stays_active() {
        let (env, scope) = setup();
        let msg = make_msg(scope, Option::some(random()), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            OffchainReception::init(address, msg);
            let reception = OffchainReception::load_all(address, scope).get(0);

            // Within the TTL with no resolved tx: nothing to process, the reception stays.
            assert(reception.step(Option::none(), 100).is_none());
            assert(OffchainReception::is_active(address, scope, msg), "unresolved reception should stay active");
            assert(!OffchainReception::is_processed(address, scope, msg), "should still be unprocessed");
        });
    }

    #[test]
    unconstrained fn resolved_reception_is_ready_to_process() {
        let (env, scope) = setup();
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            OffchainReception::init(address, msg);
            let reception = OffchainReception::load_all(address, scope).get(0);

            // A resolved tx within the TTL: the message is handed off with its tx context attached.
            let processable = reception.step(Option::some(resolved_tx(tx_hash)), 100);
            assert(processable.is_some());
            assert_eq(processable.unwrap().message_context.tx_hash, tx_hash);

            // It stays active for reorg safety and is now marked processed.
            assert(OffchainReception::is_active(address, scope, msg), "processed reception should stay active");
            assert(OffchainReception::is_processed(address, scope, msg), "should be processed");
        });
    }

    #[test]
    unconstrained fn already_processed_reception_is_not_re_pushed() {
        let (env, scope) = setup();
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            OffchainReception::init(address, msg);

            // First step processes the message.
            let reception = OffchainReception::load_all(address, scope).get(0);
            assert(reception.step(Option::some(resolved_tx(tx_hash)), 100).is_some());
            assert(OffchainReception::is_processed(address, scope, msg), "should be processed");

            // Second step (still resolved, not expired) recognizes it as processed and does not re-push it.
            let reloaded = OffchainReception::load_all(address, scope).get(0);
            assert(reloaded.step(Option::some(resolved_tx(tx_hash)), 100).is_none(), "already processed");
            assert(OffchainReception::is_active(address, scope, msg), "processed reception should still be active");
        });
    }

    #[test]
    unconstrained fn expired_resolved_reception_is_processed_once_before_termination() {
        let (env, scope) = setup();
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            OffchainReception::init(address, msg);

            // Expired but resolved: the message is processed once (not terminated yet).
            let reception = OffchainReception::load_all(address, scope).get(0);
            assert(reception.step(Option::some(resolved_tx(tx_hash)), MAX_MSG_TTL + 1).is_some());
            assert(OffchainReception::is_processed(address, scope, msg), "should be processed");

            // Next step: still expired and now processed, so the reception is terminated.
            let reloaded = OffchainReception::load_all(address, scope).get(0);
            assert(reloaded.step(Option::some(resolved_tx(tx_hash)), MAX_MSG_TTL + 1).is_none());
            assert(
                !OffchainReception::is_active(address, scope, msg),
                "expired processed reception is terminated on the next step",
            );
        });
    }
}
