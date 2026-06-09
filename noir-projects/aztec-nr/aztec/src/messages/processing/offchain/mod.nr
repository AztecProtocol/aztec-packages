pub mod message;

pub use message::OffchainMessage;

use crate::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::processing::OffchainMessageWithContext,
    oracle::{
        contract_sync::set_contract_sync_cache_invalid,
        entity_store::{Fact, get_entity, NonRetractableEntity, record_retractable_fact, terminate_entity},
    },
    protocol::{address::AztecAddress, constants::MAX_TX_LIFETIME, hash::sha256_to_field},
};

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

/// Tolerance added to the `MAX_TX_LIFETIME` cap for message expiration.
global TX_EXPIRATION_TOLERANCE: u64 = 7200; // 2 hours

/// Maximum time-to-live for a tx-bound offchain message.
///
/// After `anchor_block_timestamp + MAX_MSG_TTL`, the message is evicted from the inbox.
global MAX_MSG_TTL: u64 = MAX_TX_LIFETIME + TX_EXPIRATION_TOLERANCE;

/// A function that manages offchain-delivered messages for processing during sync.
///
/// Offchain messages are messages that are not broadcasted via onchain logs. They are instead delivered to the
/// recipient by calling the `offchain_receive` utility function (injected by the `#[aztec]` macro). Message transport
/// is the app's responsibility. Typical examples of transport methods are: messaging apps, email, QR codes, etc.
///
/// Once offchain messages are delivered to the recipient's private environment via `offchain_receive`, messages are
/// locally stored in a persistent inbox.
///
/// This function determines when each message in said inbox is ready for processing, when it can be safely disposed
/// of, etc.
///
/// The only current implementation of an `OffchainInboxSync` is [`sync_inbox`], which manages an inbox with expiration
/// based eviction and automatic transaction context resolution.
pub type OffchainInboxSync = unconstrained fn(
/* contract_address */AztecAddress, /* scope */ AztecAddress) -> EphemeralArray<OffchainMessageWithContext>;

// ===================== EntityStore data model =====================

/// Entity type id for the offchain reception state machine.
pub(crate) global OFFCHAIN_RECEPTION_ENTITY: Field =
    sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_ENTITY_TYPE".as_bytes());

/// Fact type id for a processed offchain message (retractable; anchored at processing block).
global OFFCHAIN_MESSAGE_PROCESSED: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_MESSAGE_PROCESSED".as_bytes());

/// The computed state of an offchain reception entity, derived by folding its facts.
#[derive(Eq)]
pub struct OffchainReceptionState {
    tag: u8,
}

impl OffchainReceptionState {
    /// The message has been received but not yet processed.
    pub fn received() -> Self {
        Self { tag: 1 }
    }

    /// The message's tx context has been resolved and it has been handed off for processing.
    pub fn processed() -> Self {
        Self { tag: 2 }
    }
}

/// Folds an entity's fact set into an [`OffchainReceptionState`].
///
/// A `OFFCHAIN_MESSAGE_PROCESSED` fact advances the entity to `processed`; with no such fact the entity is `received`.
pub unconstrained fn fold(facts: EphemeralArray<Fact>) -> OffchainReceptionState {
    if facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED) {
        OffchainReceptionState::processed()
    } else {
        OffchainReceptionState::received()
    }
}

// ===================== End EntityStore data model =====================

/// Delivers offchain messages to the given contract's offchain inbox for subsequent processing.
///
/// Offchain messages are transaction effects that are not broadcasted via onchain logs. Instead, the sender shares the
/// message to the recipient through an external channel (e.g. a URL accessible by the recipient). The recipient then
/// calls this function to hand the messages to the contract so they can be processed through the same mechanisms as
/// onchain messages.
///
/// Each message is routed to the inbox scoped to its `recipient` field, so messages for different accounts are
/// automatically isolated.
///
/// Messages are processed when their originating transaction is found onchain (providing the context needed to
/// validate resulting notes and events).
///
/// Messages are kept in the inbox until they expire. The effective expiration is
/// `anchor_block_timestamp + MAX_MSG_TTL`.
///
/// Processing order is not guaranteed.
pub unconstrained fn receive(
    contract_address: AztecAddress,
    messages: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL>,
) {
    messages.for_each(|msg| { let _ = NonRetractableEntity::create(contract_address, msg.recipient, msg); });

    // Clear cache for message recipients so next sync runs
    set_contract_sync_cache_invalid(contract_address, messages.map(|msg| msg.recipient));
}

/// Returns offchain-delivered messages to process during sync.
///
/// Each active reception entity is advanced based on its folded state, its message's expiration, and whether its
/// originating transaction has been resolved by PXE. Resolved-and-unprocessed messages are returned for processing and
/// recorded as `Processed` (anchored at the resolving block, so a reorg of that block retracts the guard and the
/// message is re-processed). Resolution takes precedence over expiration: a message whose context resolves on the same
/// sync it would otherwise be evicted is still handed off for processing, and terminated on a later sync. Messages stay
/// active across syncs until they expire, at which point the entity is terminated to free its storage.
pub unconstrained fn sync_inbox(
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> EphemeralArray<OffchainMessageWithContext> {
    let ready_to_process: EphemeralArray<OffchainMessageWithContext> = EphemeralArray::empty();

    let entities = NonRetractableEntity::<OffchainMessage>::read_all_active(contract_address, scope);
    let entities_len = entities.len();

    // Build a tx-hash request list aligned with the active-entity indices, so the resolved contexts returned by the
    // oracle can be matched back to each entity positionally.
    let context_resolution_requests = entities.map(|key| {
        let entity = get_entity::<OffchainMessage>(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
        entity.payload.tx_hash.unwrap_or(0)
    });

    // Ask PXE to resolve contexts for all requested tx hashes. The oracle returns responses in a new ephemeral array,
    // aligned with the request (and therefore entity) indices.
    let resolved_contexts =
        crate::oracle::message_processing::get_message_contexts_by_tx_hash(context_resolution_requests);

    assert_eq(resolved_contexts.len(), entities_len);

    let now = UtilityContext::new().timestamp();

    for i in 0..entities_len {
        // This loop decides what to do with each active message reception workflow. We check readiness to process
        // before expiration, so a message whose context resolves on the same sync it would otherwise be evicted
        // still gets handed off. We handle the following scenarios:
        //
        // - Received and resolved: the originating TX has been found by PXE, giving us the context needed to
        //   process the message. We add it to `ready_to_process` and record a `Processed` fact anchored at the
        //   resolving block. If the block gets reorg'd, the `Processed` fact is retracted, effectively rewinding
        //   the message's lifecycle. The entity stays active; a later sync evicts it.
        //
        // - Expired (and not processable this sync): the message's effective expiration
        //   (`anchor_block_timestamp + MAX_MSG_TTL`) has passed and it is not being handed off now, so we
        //   terminate the entity to stop tracking it. An expired-but-resolved message is processed this sync and
        //   terminated on the next one, once it has folded to processed.
        //
        // - Received and unresolved: the originating TX is not yet known to PXE (or the message is tx-less, which
        //   never resolves) and it has not expired. We leave the entity active so future syncs can pick it up.
        //
        // - Already processed (and not expired): we skip the message to avoid re-pushing it, but keep it active
        //   until expiration.
        let key = entities.get(i);
        let entity = get_entity::<OffchainMessage>(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
        let msg = entity.payload;
        let state = fold(entity.facts);
        let maybe_ctx = resolved_contexts.get(i);

        let expired = now > msg.anchor_block_timestamp + MAX_MSG_TTL;

        if (state == OffchainReceptionState::received()) & maybe_ctx.is_some() {
            let ctx = maybe_ctx.unwrap();
            ready_to_process.push(
                OffchainMessageWithContext { message_ciphertext: msg.ciphertext, message_context: ctx },
            );
            record_retractable_fact(
                contract_address,
                scope,
                OFFCHAIN_RECEPTION_ENTITY,
                key,
                OFFCHAIN_MESSAGE_PROCESSED,
                [],
                ctx.tx_block_number,
                ctx.tx_block_hash,
            );
        } else if expired {
            terminate_entity(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
        }
    }

    ready_to_process
}

mod test {
    use crate::{
        ephemeral::EphemeralArray,
        messages::encoding::MESSAGE_CIPHERTEXT_LEN,
        oracle::{entity_store::{EntityBody, Fact, get_entity, NonRetractableEntity, RetractableEntity}, random::random},
        protocol::{address::AztecAddress, traits::{Deserialize, FromField, Serialize}},
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        fold, MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, OFFCHAIN_MESSAGE_PROCESSED,
        OFFCHAIN_RECEPTION_ENTITY, OffchainMessage, OffchainReceptionState, receive, sync_inbox,
    };

    global TEST_FACTS_SLOT: Field = 0xfac75;
    global TEST_PAYLOAD_SLOT: Field = 0xfac76;

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        let mut env = TestEnvironment::new();
        let scope = env.create_light_account();
        (env, scope)
    }

    /// Creates an `OffchainMessage` with dummy ciphertext and the given scope as recipient.
    fn make_msg(recipient: AztecAddress, tx_hash: Option<Field>, anchor_block_timestamp: u64) -> OffchainMessage {
        OffchainMessage { ciphertext: BoundedVec::new(), recipient, tx_hash, anchor_block_timestamp }
    }

    /// Advances the TXE block timestamp by `offset` seconds and returns the resulting timestamp.
    unconstrained fn advance_by(env: TestEnvironment, offset: u64) -> u64 {
        env.advance_next_block_timestamp_by(offset);
        env.mine_block();
        env.last_block_timestamp()
    }

    /// Returns the entity ids of the reception entities currently active for the given scope.
    unconstrained fn active_keys(c: AztecAddress, s: AztecAddress) -> EphemeralArray<Field> {
        NonRetractableEntity::<OffchainMessage>::read_all_active(c, s)
    }

    /// Returns `true` if a reception entity with the given entity id is currently active.
    unconstrained fn is_active(c: AztecAddress, s: AztecAddress, key: Field) -> bool {
        let keys = active_keys(c, s);
        let mut found = false;
        let keys_len = keys.len();
        for i in 0..keys_len {
            if keys.get(i) == key {
                found = true;
            }
        }
        found
    }

    /// Folds the fact set of the reception entity with the given entity id into its state.
    unconstrained fn state_of(c: AztecAddress, s: AztecAddress, key: Field) -> OffchainReceptionState {
        let facts = get_entity::<OffchainMessage>(c, s, OFFCHAIN_RECEPTION_ENTITY, key).facts;
        fold(facts)
    }

    #[test]
    unconstrained fn create_makes_an_active_retrievable_entity() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), anchor_ts);

        env.utility_context(|context| {
            let address = context.this_address();
            let _ = NonRetractableEntity::create(address, scope, msg);

            let key = msg.entity_id();
            assert(is_active(address, scope, key), "created entity should be active");

            let stored = get_entity::<OffchainMessage>(address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
            assert_eq(stored.payload.tx_hash, msg.tx_hash);
            assert_eq(stored.payload.anchor_block_timestamp, msg.anchor_block_timestamp);
        });
    }

    #[test]
    unconstrained fn create_retractable_makes_an_active_retrievable_entity() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), anchor_ts);

        let block_number = env.last_block_number();
        let block_hash = random();

        env.utility_context(|context| {
            let address = context.this_address();
            let _ = RetractableEntity::create(address, scope, msg, block_number, block_hash);

            let key = msg.entity_id();
            let active = RetractableEntity::<OffchainMessage>::read_all_active(address, scope);
            assert_eq(active.len(), 1);
            assert_eq(active.get(0), key);

            let stored = get_entity::<OffchainMessage>(address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
            assert_eq(stored.payload.tx_hash, msg.tx_hash);
            assert_eq(stored.payload.anchor_block_timestamp, msg.anchor_block_timestamp);
        });
    }

    #[test]
    unconstrained fn empty_inbox_returns_empty_result() {
        let (env, scope) = setup();
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0);
            assert_eq(active_keys(address, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(tx_hash), anchor_ts).entity_id();

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(!is_active(address, scope, key), "expired entity should be terminated");
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_not_expired_before_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(tx_hash), anchor_ts).entity_id();

        // Advance, but not past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(is_active(address, scope, key), "not expired entity should stay active");
            assert(state_of(address, scope, key) == OffchainReceptionState::received(), "should fold to received");
        });
    }

    #[test]
    unconstrained fn tx_less_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::none(), anchor_ts));
            receive(context.this_address(), msgs);
        });

        // A tx-less message normalizes to tx_hash 0.
        let key = make_msg(scope, Option::none(), anchor_ts).entity_id();

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(!is_active(address, scope, key), "expired entity should be terminated");
        });
    }

    #[test]
    unconstrained fn unresolved_tx_stays_in_inbox() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(tx_hash), anchor_ts).entity_id();

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // not resolved, not ready
            assert(is_active(address, scope, key), "unresolved entity should stay active");
            assert(state_of(address, scope, key) == OffchainReceptionState::received(), "should fold to received");
        });
    }

    #[test]
    unconstrained fn multiple_messages_mixed_expiration() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        let expired_a_tx_hash = random();
        let survivor_tx_hash = random();

        env.utility_context(|context| {
            let address = context.this_address();
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            // Message 0: tx-bound, anchor=0 so it expires quickly.
            msgs.push(make_msg(scope, Option::some(expired_a_tx_hash), 0));
            // Message 1: tx-bound, anchor_ts is recent so it survives.
            msgs.push(make_msg(scope, Option::some(survivor_tx_hash), anchor_ts));
            // Message 2: tx-less, anchor=0 so it also expires.
            msgs.push(make_msg(scope, Option::none(), 0));
            receive(address, msgs);
        });

        let expired_a_key = make_msg(scope, Option::some(expired_a_tx_hash), 0).entity_id();
        let survivor_key = make_msg(scope, Option::some(survivor_tx_hash), anchor_ts).entity_id();
        let expired_b_key = make_msg(scope, Option::none(), 0).entity_id();

        // Advance past MAX_MSG_TTL for anchor=0, but not for anchor_ts.
        let _now = advance_by(env, MAX_MSG_TTL);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // all contexts are None
            assert(!is_active(address, scope, expired_a_key), "expired tx-bound entity should be terminated");
            assert(!is_active(address, scope, expired_b_key), "expired tx-less entity should be terminated");
            assert(is_active(address, scope, survivor_key), "survivor entity should stay active");
            assert_eq(active_keys(address, scope).len(), 1);
        });
    }

    // -- Resolved context (ready to process) ------------------------------

    #[test]
    unconstrained fn resolved_msg_is_ready_to_process() {
        let (env, scope) = setup();
        // TestEnvironment::new() deploys protocol contracts, creating blocks with tx effects.
        // In TXE, tx hashes equal Fr(blockNumber), so Fr(1) is the tx effect from block 1.
        // We use this as a "known resolvable" tx hash.
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(known_tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(known_tx_hash), anchor_ts).entity_id();

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            // The message should be ready to process since its tx context was resolved.
            assert_eq(result.len(), 1);

            let ctx = result.get(0).message_context;
            assert_eq(ctx.tx_hash, known_tx_hash);
            assert(ctx.first_nullifier_in_tx != 0, "resolved context must have a first nullifier");

            // Entity stays active (not expired) and now folds to processed, with a Processed fact recorded.
            assert(is_active(address, scope, key), "processed entity should stay active for reorg safety");
            assert(state_of(address, scope, key) == OffchainReceptionState::processed(), "should fold to processed");
        });
    }

    #[test]
    unconstrained fn already_processed_is_not_re_pushed() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(known_tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(known_tx_hash), anchor_ts).entity_id();

        let _now = advance_by(env, 100);

        // First sync: the message resolves, is pushed for processing, and a Processed fact is recorded.
        env.utility_context(|context| {
            let address = context.this_address();
            let first = sync_inbox(address, scope);
            assert_eq(first.len(), 1);
            assert(state_of(address, scope, key) == OffchainReceptionState::processed(), "should fold to processed");
        });

        // Second sync with the same resolvable context: the Processed guard skips the message (idempotency) while the
        // entity remains active (not expired).
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(is_active(address, scope, key), "processed entity should still be active");
            assert(state_of(address, scope, key) == OffchainReceptionState::processed(), "should remain processed");
        });
    }

    #[test]
    unconstrained fn expired_resolved_msg_is_processed_before_termination() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(known_tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let key = make_msg(scope, Option::some(known_tx_hash), anchor_ts).entity_id();

        // Advance past anchor_ts + MAX_MSG_TTL so the message is expired on the next sync.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        // First sync: even though the message is expired, its context resolves, so it is handed off for processing
        // rather than silently evicted. The entity stays active this sync (now folded to processed).
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 1);
            assert(is_active(address, scope, key), "expired-but-resolved entity is processed, not terminated yet");
            assert(state_of(address, scope, key) == OffchainReceptionState::processed(), "should fold to processed");
        });

        // Second sync: still expired and now processed, so the entity is terminated.
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(!is_active(address, scope, key), "expired processed entity is terminated on the next sync");
        });
    }

    // ---- Pure EntityStore fold/pack tests (no TXE) ----

    #[test]
    unconstrained fn fold_empty_is_received() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let facts = EphemeralArray::<Fact>::empty_at(TEST_FACTS_SLOT);
            assert(fold(facts) == OffchainReceptionState::received());
        });
    }

    #[test]
    unconstrained fn fold_with_processed_is_processed() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let payload = EphemeralArray::<Field>::empty_at(TEST_PAYLOAD_SLOT);
            let facts = EphemeralArray::<Fact>::empty_at(TEST_FACTS_SLOT);
            facts.push(Fact { fact_type_id: OFFCHAIN_MESSAGE_PROCESSED, payload });
            assert(fold(facts) == OffchainReceptionState::processed());
        });
    }

    #[test]
    unconstrained fn pack_unpack_round_trips_offchain_message() {
        let ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN> = BoundedVec::new();
        let msg = OffchainMessage {
            ciphertext,
            recipient: AztecAddress::from_field(42),
            tx_hash: Option::some(99),
            anchor_block_timestamp: 12345,
        };
        let packed = msg.serialize();
        let roundtripped: OffchainMessage = Deserialize::deserialize(packed);
        assert_eq(roundtripped.recipient, msg.recipient);
        assert_eq(roundtripped.tx_hash, msg.tx_hash);
        assert_eq(roundtripped.anchor_block_timestamp, msg.anchor_block_timestamp);
        assert_eq(roundtripped.ciphertext.len(), msg.ciphertext.len());
    }

}
