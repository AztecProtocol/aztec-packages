use crate::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, processing::OffchainMessageWithContext},
    oracle::{
        contract_sync::set_contract_sync_cache_invalid,
        fact_base::{
            active_entities, FACT_MAX_ACTIVE_ENTITIES, FACT_MAX_FACTS, FACT_MAX_PAYLOAD, get_entity_facts,
            pack_fact_payload, PackedFact, record_non_retractable_fact, record_retractable_fact, terminate_entity,
            unpack_fact_payload,
        },
    },
    protocol::{
        address::AztecAddress,
        constants::MAX_TX_LIFETIME,
        hash::{poseidon2_hash, sha256_to_field},
        traits::{Deserialize, Serialize},
    },
};

/// Fact store entity type
global OFFCHAIN_RECEPTION_ENTITY_TYPE: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_ENTITY_TYPE".as_bytes());

/// Offchain reception fact types
/// MESSAGE_RECEIVED -> offchain message received via [`offchain_receive`]
/// MESSAGE_PROCESSED -> offchain message transaction found and handed off for processing
global MESSAGE_RECEIVED: Field = 1;
global MESSAGE_PROCESSED: Field = 2;

/// The state of an offchain reception entity, computed by folding its facts.
#[derive(Eq)]
struct OffchainReceptionState {
    tag: u8,
}

impl OffchainReceptionState {
    /// The message has been received but not yet processed.
    fn received() -> Self {
        Self { tag: 1 }
    }

    /// The message's tx context has been resolved and it has been handed off for processing.
    fn processed() -> Self {
        Self { tag: 2 }
    }
}

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
pub(crate) type OffchainInboxSync<Env> = unconstrained fn[Env](
/* contract_address */AztecAddress, /* scope */ AztecAddress) -> EphemeralArray<OffchainMessageWithContext>;

/// A message delivered via the `offchain_receive` utility function.
#[derive(Serialize, Deserialize)]
pub struct OffchainMessage {
    /// The encrypted message payload.
    pub(crate) ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    pub(crate) recipient: AztecAddress,
    /// The hash of the transaction that produced this message. `Option::none` indicates a tx-less message.
    pub tx_hash: Option<Field>,
    /// Anchor block timestamp at message emission.
    pub anchor_block_timestamp: u64,
}

/// A snapshot of one active reception entity.
///
/// Ad-hoc struct for convenience in [`sync-inbox`].
struct ActiveReception {
    msg: OffchainMessage,
    facts: [PackedFact; FACT_MAX_FACTS],
}

/// Number of fields produced by serializing a `BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>`: one field per storage slot
/// plus one trailing length field (see the `BoundedVec` `Serialize` impl).
///
/// Hand-defined rather than `<BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN> as Serialize>::N` because Noir does not
/// resolve trait-associated-const projections at `global` evaluation time.
global SERIALIZED_CIPHERTEXT_LEN: u32 = MESSAGE_CIPHERTEXT_LEN + 1;

/// Number of fields produced by serializing an [`OffchainMessage`] via its derived `Serialize` impl.
///
/// Layout in declaration order: ciphertext (`SERIALIZED_CIPHERTEXT_LEN`) + recipient (1) + tx_hash as
/// `Option<Field>` (2: `[is_some, value]`) + anchor_block_timestamp (1). Must remain `<= FACT_MAX_PAYLOAD`. See
/// [`SERIALIZED_CIPHERTEXT_LEN`] for the rationale behind hand-defining this constant.
global SERIALIZED_OFFCHAIN_MESSAGE_LEN: u32 = SERIALIZED_CIPHERTEXT_LEN + 1 + 2 + 1;

/// Computes the fact correlation key identifying a received offchain message in the fact store.
///
/// The key is a poseidon2 hash over the serialized ciphertext fields and the tx hash, so the same (ciphertext,
/// tx_hash) pair always maps to the same entity. This makes re-delivery of the same message idempotent: a second
/// [`receive`] for the same message records another `Received` fact under the same key rather than creating a new
/// entity.
///
/// Tx-less messages (`tx_hash == None`) are bucketed under a `tx_hash` of `0`, so all tx-less re-deliveries of the
/// same ciphertext fold to a single entity rather than creating a new one each time.
unconstrained fn correlation_key_of(
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    tx_hash: Option<Field>,
) -> Field {
    let serialized_ciphertext = ciphertext.serialize();
    let mut inputs: [Field; SERIALIZED_CIPHERTEXT_LEN + 1] = [0; SERIALIZED_CIPHERTEXT_LEN + 1];
    for i in 0..SERIALIZED_CIPHERTEXT_LEN {
        inputs[i] = serialized_ciphertext[i];
    }
    inputs[SERIALIZED_CIPHERTEXT_LEN] = tx_hash.unwrap_or(0);
    poseidon2_hash(inputs)
}

/// Extracts and decodes the [`OffchainMessage`] stored under an entity's `Received` fact.
unconstrained fn received_message_of(facts: [PackedFact; FACT_MAX_FACTS]) -> OffchainMessage {
    let mut found = false;
    let mut payload: [Field; FACT_MAX_PAYLOAD] = [0; FACT_MAX_PAYLOAD];
    for i in 0..FACT_MAX_FACTS {
        if !found & (facts[i].fact_type_id == MESSAGE_RECEIVED) {
            payload = facts[i].payload;
            found = true;
        }
    }
    if !found {
        panic("received_message_of: no Received fact in loaded set");
    }
    unpack_fact_payload::<OffchainMessage, SERIALIZED_OFFCHAIN_MESSAGE_LEN>(payload)
}

/// Transient fold over an entity's canonical facts.
///
/// A canonical `Processed` fact advances the entity to [`OffchainReceptionState::processed`]; otherwise it stays in
/// [`OffchainReceptionState::received`].
unconstrained fn fold_reception_state(facts: [PackedFact; FACT_MAX_FACTS]) -> OffchainReceptionState {
    let mut processed = false;
    for i in 0..FACT_MAX_FACTS {
        if facts[i].fact_type_id == MESSAGE_PROCESSED {
            processed = true;
        }
    }
    if processed {
        OffchainReceptionState::processed()
    } else {
        OffchainReceptionState::received()
    }
}

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
        let correlation_key = correlation_key_of(msg.ciphertext, msg.tx_hash);
        record_non_retractable_fact(
            contract_address,
            msg.recipient,
            OFFCHAIN_RECEPTION_ENTITY_TYPE,
            MESSAGE_RECEIVED,
            correlation_key,
            pack_fact_payload::<OffchainMessage, SERIALIZED_OFFCHAIN_MESSAGE_LEN>(msg),
        );
        scopes.push(msg.recipient);
        i += 1;
    }

    // TODO: analyze how this behaves under the new fact store approach. Can we be smarter about this?
    set_contract_sync_cache_invalid(contract_address, scopes);
}

/// Returns offchain-delivered messages to process during sync.
///
/// Messages remain in the inbox and are reprocessed on each sync until their originating transaction is no longer at
/// risk of being dropped by a reorg.
pub unconstrained fn sync_inbox(
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> EphemeralArray<OffchainMessageWithContext> {
    let ready_to_process: EphemeralArray<OffchainMessageWithContext> =
        EphemeralArray::at(OFFCHAIN_READY_MESSAGES_SLOT).clear();
    let context_resolution_requests: EphemeralArray<Field> = EphemeralArray::at(OFFCHAIN_CONTEXT_REQUESTS_SLOT).clear();

    let now = UtilityContext::new().timestamp();

    // The active reception entities, one per outstanding offchain message. Everything below is kept aligned with this
    // list by index.
    let active = active_entities(contract_address, scope, OFFCHAIN_RECEPTION_ENTITY_TYPE);

    let mut active_receptions: BoundedVec<ActiveReception, FACT_MAX_ACTIVE_ENTITIES> = BoundedVec::new();
    for i in 0..active.len() {
        let facts = get_entity_facts(
            contract_address,
            scope,
            OFFCHAIN_RECEPTION_ENTITY_TYPE,
            active.get(i),
        );
        let msg = received_message_of(facts);
        context_resolution_requests.push(msg.tx_hash.unwrap_or(0));
        active_receptions.push(ActiveReception { msg, facts });
    }

    // Ask PXE to resolve contexts for all requested tx hashes. The oracle returns responses in a new ephemeral array
    // aligned with `active`.
    let resolved_contexts =
        crate::oracle::message_processing::get_message_contexts_by_tx_hash(context_resolution_requests);

    for i in 0..active.len() {
        // This loop decides what to do with each outstanding offchain message. We determine the state of offchain
        // message by folding the facts we know about it and then act based on that. The scenarios are:
        //
        // 1. The TX that emitted this message is not known to PXE: in this case we can't process the message, as any
        // notes or events discovered will fail to be validated. So we keep the entity active, awaiting future syncs to
        // if the TX became available.
        //
        // 2. The message is not associated to a TX to begin with. The current version of offchain message processing
        // does not support this case, but in the future it will. Right now, a message without an associated TX sits in
        // the inbox until it expires.
        //
        // 3. The TX that emitted this message has been found by PXE. That gives us all the information needed to
        // process the message. We add the message to the `ready_to_process` EphemeralArray so that the `sync_state`
        // loop processes it, and record a `Processed` fact with its origin at the resolving block.
        //
        // In all cases, if the message has expired (i.e. `now > anchor_block_timestamp + MAX_MSG_TTL`), we terminate
        // the entity, which will make it invisible to these workflows thereafter.
        let correlation_key = active.get(i);
        let reception = active_receptions.get(i);
        let state = fold_reception_state(reception.facts);
        let expired = now > reception.msg.anchor_block_timestamp + MAX_MSG_TTL;
        let maybe_ctx = resolved_contexts.get(i);

        // Case analysis on the entity's state.
        if state == OffchainReceptionState::processed() {
            // Already handed off for processing. The entity stays active so it can be re-processed if a reorg
            // removes the `Processed` fact.
        } else if state == OffchainReceptionState::received() {
            if maybe_ctx.is_some() {
                // Scenario 3: ready to process. Hand off the message and advance the entity to PROCESSED.
                let ctx = maybe_ctx.unwrap();
                ready_to_process.push(
                    OffchainMessageWithContext { message_ciphertext: reception.msg.ciphertext, message_context: ctx },
                );
                record_retractable_fact(
                    contract_address,
                    scope,
                    OFFCHAIN_RECEPTION_ENTITY_TYPE,
                    MESSAGE_PROCESSED,
                    correlation_key,
                    [0; FACT_MAX_PAYLOAD],
                    ctx.block_number,
                    ctx.block_hash,
                );
            }
            // Otherwise (Scenarios 1 and 2): wait. Keep the entity active for future syncs unless the expiration
            // check below evicts it.
        }

        // Process termination: regardless of current state, a offchain reception message past its TTL is terminated.
        if expired {
            terminate_entity(
                contract_address,
                scope,
                OFFCHAIN_RECEPTION_ENTITY_TYPE,
                correlation_key,
            );
        }
    }

    ready_to_process
}

mod test {
    use crate::{
        oracle::{
            fact_base::{active_entities, FACT_MAX_FACTS, FACT_MAX_PAYLOAD, get_entity_facts, PackedFact},
            random::random,
        },
        protocol::address::AztecAddress,
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        fold_reception_state, MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, MESSAGE_PROCESSED, MESSAGE_RECEIVED,
        OFFCHAIN_RECEPTION_ENTITY_TYPE, OffchainMessage, OffchainReceptionState, receive, received_message_of,
        sync_inbox,
    };

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

    /// Number of currently-active reception entities for the given scope.
    unconstrained fn active_count(address: AztecAddress, scope: AztecAddress) -> u32 {
        active_entities(address, scope, OFFCHAIN_RECEPTION_ENTITY_TYPE).len()
    }

    // -- Pure fold (no TXE required) --------------------------------------

    #[test]
    unconstrained fn fold_received_only_is_received() {
        let mut facts: [PackedFact; FACT_MAX_FACTS] =
            [PackedFact { fact_type_id: 0, payload: [0; FACT_MAX_PAYLOAD] }; FACT_MAX_FACTS];
        facts[0] = PackedFact { fact_type_id: MESSAGE_RECEIVED, payload: [0; FACT_MAX_PAYLOAD] };

        assert(fold_reception_state(facts) == OffchainReceptionState::received());
    }

    #[test]
    unconstrained fn fold_with_processed_is_processed() {
        let mut facts: [PackedFact; FACT_MAX_FACTS] =
            [PackedFact { fact_type_id: 0, payload: [0; FACT_MAX_PAYLOAD] }; FACT_MAX_FACTS];
        facts[0] = PackedFact { fact_type_id: MESSAGE_RECEIVED, payload: [0; FACT_MAX_PAYLOAD] };
        facts[1] = PackedFact { fact_type_id: MESSAGE_PROCESSED, payload: [0; FACT_MAX_PAYLOAD] };

        assert(fold_reception_state(facts) == OffchainReceptionState::processed());
    }

    // -- Reception lifecycle (TXE-backed) ---------------------------------

    #[test]
    unconstrained fn empty_inbox_returns_empty_result() {
        let (env, scope) = setup();
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0);
            assert_eq(active_count(address, scope), 0);
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(random()), anchor_ts));
            receive(context.this_address(), msgs);
        });

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(active_count(address, scope), 0); // expired, terminated
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_not_expired_before_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(random()), anchor_ts));
            receive(context.this_address(), msgs);
        });

        // Advance, but not past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(active_count(address, scope), 1); // not expired, stays active
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

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(active_count(address, scope), 0); // expired, terminated
        });
    }

    #[test]
    unconstrained fn unresolved_tx_stays_in_inbox() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(random()), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // not resolved, not ready
            assert_eq(active_count(address, scope), 1); // not expired, stays active
        });
    }

    #[test]
    unconstrained fn multiple_messages_mixed_expiration() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        let survivor_tx_hash = random();

        env.utility_context(|context| {
            let address = context.this_address();
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            // Message 0: tx-bound, anchor_ts=0 so it expires quickly.
            msgs.push(make_msg(scope, Option::some(random()), 0));
            // Message 1: tx-bound, anchor_ts is recent so it survives.
            msgs.push(make_msg(scope, Option::some(survivor_tx_hash), anchor_ts));
            // Message 2: tx-less, anchor_ts=0 so it also expires.
            msgs.push(make_msg(scope, Option::none(), 0));
            receive(address, msgs);
        });

        // Advance past MAX_MSG_TTL for anchor_ts=0, but not for anchor_ts=anchor_ts.
        let _now = advance_by(env, MAX_MSG_TTL);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // all contexts are None
            // Message 0 expired (anchor=0) and message 2 expired (anchor=0) were terminated; message 1 survived.
            assert_eq(active_count(address, scope), 1);

            let survivor_key = active_entities(address, scope, OFFCHAIN_RECEPTION_ENTITY_TYPE).get(0);
            let facts = get_entity_facts(address, scope, OFFCHAIN_RECEPTION_ENTITY_TYPE, survivor_key);
            assert_eq(received_message_of(facts).tx_hash, Option::some(survivor_tx_hash));
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

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            // The message should be ready to process since its tx context was resolved.
            assert_eq(result.len(), 1);

            let ctx = result.get(0).message_context;
            assert_eq(ctx.tx_hash, known_tx_hash);
            assert(ctx.first_nullifier_in_tx != 0, "resolved context must have a first nullifier");

            // Entity stays active (not expired) for potential reorg reprocessing, now advanced to PROCESSED.
            assert_eq(active_count(address, scope), 1);
        });
    }

    #[test]
    unconstrained fn resolved_msg_is_processed_once_then_idempotent() {
        let (env, scope) = setup();
        // In TXE, tx hashes equal Fr(blockNumber), so Fr(1) resolves to the tx effect from block 1.
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            msgs.push(make_msg(scope, Option::some(known_tx_hash), anchor_ts));
            receive(context.this_address(), msgs);
        });

        let _now = advance_by(env, 100);

        // First sync: the context resolves, the message is handed off, and a canonical `Processed` fact is recorded.
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 1);
            assert_eq(active_count(address, scope), 1);
        });

        // Second sync: the entity now folds to PROCESSED (its `Processed` fact's origin is a canonical block), so it
        // is skipped rather than re-handed-off. The entity remains active (not expired), available for reprocessing
        // only if a reorg rewinds its origin.
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0);
            assert_eq(active_count(address, scope), 1);
        });
    }
}
