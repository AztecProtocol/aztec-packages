use crate::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, processing::OffchainMessageWithContext},
    oracle::{
        contract_sync::set_contract_sync_cache_invalid,
        fact_store::{
            active_entities, create_non_retractable_entity, Entity, Fact, get_entity, record_retractable_fact,
            terminate_entity,
        },
    },
    protocol::{
        address::AztecAddress,
        constants::MAX_TX_LIFETIME,
        hash::{poseidon2_hash, sha256_to_field},
        traits::{Deserialize, Serialize},
    },
};

/// Ephemeral array slot used by [`sync_inbox`] to pass tx hash resolution requests to PXE.
global OFFCHAIN_CONTEXT_REQUESTS_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_REQUESTS_SLOT".as_bytes());

/// Ephemeral array slot used by [`sync_inbox`] to collect messages ready for processing.
global OFFCHAIN_READY_MESSAGES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_READY_MESSAGES_SLOT".as_bytes());

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

/// A message delivered via the `offchain_receive` utility function.
#[derive(Serialize, Deserialize)]
pub struct OffchainMessage {
    /// The encrypted message payload.
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    pub recipient: AztecAddress,
    /// The hash of the transaction that produced this message. `Option::none` indicates a tx-less message.
    pub tx_hash: Option<Field>,
    /// Anchor block timestamp at message emission.
    pub anchor_block_timestamp: u64,
}

// ===================== FactStore data model =====================

/// Entity type id for the offchain reception state machine.
pub global OFFCHAIN_RECEPTION_ENTITY: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_ENTITY_TYPE".as_bytes());

/// Fact type id for a processed offchain message (retractable; anchored at processing block).
pub global MESSAGE_PROCESSED: Field = sha256_to_field("AZTEC_NR::MESSAGE_PROCESSED".as_bytes());

/// Number of fields produced by serializing a `BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>`.
///
/// A `BoundedVec` serializes as its storage fields followed by a trailing length field, so the total is
/// `MESSAGE_CIPHERTEXT_LEN + 1`.
global SERIALIZED_CIPHERTEXT_LEN: u32 = MESSAGE_CIPHERTEXT_LEN + 1;

/// Number of fields produced by serializing an [`OffchainMessage`].
///
/// Layout: ciphertext (`SERIALIZED_CIPHERTEXT_LEN`) + recipient (1) + tx_hash as `Option<Field>` (2) +
/// anchor_block_timestamp (1).
pub global SERIALIZED_OFFCHAIN_MESSAGE_LEN: u32 = SERIALIZED_CIPHERTEXT_LEN + 1 + 2 + 1;

/// Serializes an [`OffchainMessage`] into a fixed-length field array suitable for the reception entity's payload.
pub unconstrained fn pack_offchain_message(msg: OffchainMessage) -> [Field; SERIALIZED_OFFCHAIN_MESSAGE_LEN] {
    msg.serialize()
}

/// Deserializes an [`OffchainMessage`] from a fixed-length field array read from the reception entity's payload.
pub unconstrained fn unpack_offchain_message(payload: [Field; SERIALIZED_OFFCHAIN_MESSAGE_LEN]) -> OffchainMessage {
    Deserialize::deserialize(payload)
}

/// Computes the per-message correlation key used as the entity identity in the fact store.
///
/// The key is a poseidon2 hash over the serialized ciphertext fields and the normalized tx hash (0 when absent).
/// Re-delivering the same (ciphertext, tx_hash) pair therefore maps to the same entity, making receive idempotent.
pub unconstrained fn correlation_key(
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    tx_hash: Option<Field>,
) -> Field {
    let serialized_ciphertext: [Field; SERIALIZED_CIPHERTEXT_LEN] = ciphertext.serialize();
    let mut inputs: [Field; SERIALIZED_CIPHERTEXT_LEN + 1] = [0; SERIALIZED_CIPHERTEXT_LEN + 1];
    for i in 0..SERIALIZED_CIPHERTEXT_LEN {
        inputs[i] = serialized_ciphertext[i];
    }
    inputs[SERIALIZED_CIPHERTEXT_LEN] = tx_hash.unwrap_or(0);
    poseidon2_hash(inputs)
}

/// Decodes the [`OffchainMessage`] stored as the reception entity's payload.
pub unconstrained fn message_of(entity: Entity) -> OffchainMessage {
    let mut payload: [Field; SERIALIZED_OFFCHAIN_MESSAGE_LEN] = [0; SERIALIZED_OFFCHAIN_MESSAGE_LEN];
    for i in 0..SERIALIZED_OFFCHAIN_MESSAGE_LEN {
        payload[i] = entity.payload.get(i);
    }
    unpack_offchain_message(payload)
}

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
/// A `MESSAGE_PROCESSED` fact advances the entity to `processed`; with no such fact the entity is `received`.
pub unconstrained fn fold(facts: EphemeralArray<Fact>) -> OffchainReceptionState {
    let mut has_processed = false;
    let facts_len = facts.len();
    for i in 0..facts_len {
        if facts.get(i).fact_type_id == MESSAGE_PROCESSED {
            has_processed = true;
        }
    }
    if has_processed {
        OffchainReceptionState::processed()
    } else {
        OffchainReceptionState::received()
    }
}

// ===================== End FactStore data model =====================

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
    // May contain duplicates if multiple messages target the same recipient. This is harmless since
    // cache invalidation on the TS side is idempotent (deleting an already-deleted key is a no-op).
    let mut scopes: BoundedVec<AztecAddress, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
    let mut i = 0;
    let messages_len = messages.len();
    while i < messages_len {
        let msg = messages.get(i);
        // Normalize a tx-less message to tx_hash 0 so the same (ciphertext, tx_hash) pair maps to a stable
        // correlation key and re-delivery is idempotent (records into the same entity).
        let normalized = OffchainMessage {
            ciphertext: msg.ciphertext,
            recipient: msg.recipient,
            tx_hash: Option::some(msg.tx_hash.unwrap_or(0)),
            anchor_block_timestamp: msg.anchor_block_timestamp,
        };
        let key = correlation_key(normalized.ciphertext, normalized.tx_hash);
        let payload = pack_offchain_message(normalized);
        create_non_retractable_entity(
            contract_address,
            msg.recipient,
            OFFCHAIN_RECEPTION_ENTITY,
            key,
            payload,
        );
        scopes.push(msg.recipient);
        i += 1;
    }

    set_contract_sync_cache_invalid(contract_address, scopes);
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
    let context_resolution_requests: EphemeralArray<Field> = EphemeralArray::empty_at(OFFCHAIN_CONTEXT_REQUESTS_SLOT);
    let ready_to_process: EphemeralArray<OffchainMessageWithContext> =
        EphemeralArray::empty_at(OFFCHAIN_READY_MESSAGES_SLOT);

    let entities = active_entities(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY);
    let entities_len = entities.len();

    // Build a tx-hash request list aligned with the active-entity indices, so the resolved contexts returned by the
    // oracle can be matched back to each entity positionally.
    for i in 0..entities_len {
        let key = entities.get(i);
        let entity = get_entity(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
        let msg = message_of(entity);
        context_resolution_requests.push(msg.tx_hash.unwrap_or(0));
    }

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
        let entity = get_entity(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY, key);
        let msg = message_of(entity);
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
                MESSAGE_PROCESSED,
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
        oracle::{fact_store::{active_entities, Entity, Fact, get_entity}, random::random},
        protocol::{address::AztecAddress, traits::FromField},
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        correlation_key, fold, MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, message_of, MESSAGE_PROCESSED,
        OFFCHAIN_RECEPTION_ENTITY, OffchainMessage, OffchainReceptionState, pack_offchain_message, receive,
        SERIALIZED_OFFCHAIN_MESSAGE_LEN, sync_inbox, unpack_offchain_message,
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

    /// Returns the correlation keys of the reception entities currently active for the given scope.
    unconstrained fn active_keys(c: AztecAddress, s: AztecAddress) -> EphemeralArray<Field> {
        active_entities(c, s, OFFCHAIN_RECEPTION_ENTITY)
    }

    /// Returns `true` if a reception entity with the given correlation key is currently active.
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

    /// Folds the fact set of the reception entity with the given correlation key into its state.
    unconstrained fn state_of(c: AztecAddress, s: AztecAddress, key: Field) -> OffchainReceptionState {
        let facts = get_entity(c, s, OFFCHAIN_RECEPTION_ENTITY, key).facts;
        fold(facts)
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

        let key = correlation_key(BoundedVec::new(), Option::some(tx_hash));

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

        let key = correlation_key(BoundedVec::new(), Option::some(tx_hash));

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
        let key = correlation_key(BoundedVec::new(), Option::some(0));

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

        let key = correlation_key(BoundedVec::new(), Option::some(tx_hash));

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

        let expired_a_key = correlation_key(BoundedVec::new(), Option::some(expired_a_tx_hash));
        let survivor_key = correlation_key(BoundedVec::new(), Option::some(survivor_tx_hash));
        let expired_b_key = correlation_key(BoundedVec::new(), Option::some(0));

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

        let key = correlation_key(BoundedVec::new(), Option::some(known_tx_hash));

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

        let key = correlation_key(BoundedVec::new(), Option::some(known_tx_hash));

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

        let key = correlation_key(BoundedVec::new(), Option::some(known_tx_hash));

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

    // ---- Pure FactStore fold/pack tests (no TXE) ----

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
            facts.push(Fact { fact_type_id: MESSAGE_PROCESSED, payload });
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
        let packed = pack_offchain_message(msg);
        let roundtripped = unpack_offchain_message(packed);
        assert_eq(roundtripped.recipient, msg.recipient);
        assert_eq(roundtripped.tx_hash, msg.tx_hash);
        assert_eq(roundtripped.anchor_block_timestamp, msg.anchor_block_timestamp);
        assert_eq(roundtripped.ciphertext.len(), msg.ciphertext.len());
    }

    #[test]
    unconstrained fn message_of_returns_packed_message() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN> = BoundedVec::new();
            let expected = OffchainMessage {
                ciphertext,
                recipient: AztecAddress::from_field(7),
                tx_hash: Option::none(),
                anchor_block_timestamp: 100,
            };
            let packed_fields = pack_offchain_message(expected);

            let payload = EphemeralArray::<Field>::empty_at(TEST_PAYLOAD_SLOT);
            for i in 0..SERIALIZED_OFFCHAIN_MESSAGE_LEN {
                payload.push(packed_fields[i]);
            }
            let facts = EphemeralArray::<Fact>::empty_at(TEST_FACTS_SLOT);

            let retrieved = message_of(Entity { payload, facts });
            assert_eq(retrieved.recipient, expected.recipient);
            assert_eq(retrieved.tx_hash, expected.tx_hash);
            assert_eq(retrieved.anchor_block_timestamp, expected.anchor_block_timestamp);
        });
    }
}
