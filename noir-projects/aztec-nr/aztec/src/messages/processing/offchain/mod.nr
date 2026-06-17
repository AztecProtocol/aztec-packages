pub mod message;

pub use message::OffchainMessage;

use crate::{
    context::UtilityContext,
    entities::{Entity, Fact},
    ephemeral::EphemeralArray,
    messages::processing::{MessageContext, OffchainMessageWithContext},
    oracle::{contract_sync::set_contract_sync_cache_invalid, tx_resolution::{get_resolved_txs, ResolvedTx}},
    protocol::{address::AztecAddress, constants::MAX_TX_LIFETIME, hash::sha256_to_field},
};

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

/// Maximum time-to-live for a tx-bound offchain message.
///
/// After `anchor_block_timestamp + MAX_MSG_TTL`, the message is evicted from the inbox.
/// (7200 == 2 hours)
global MAX_MSG_TTL: u64 = MAX_TX_LIFETIME + 7200;

/// Fact type id to mark an offchain message as processed.
///
/// A reception is in "processed state" exactly when it carries a fact of this type.
global OFFCHAIN_MESSAGE_PROCESSED: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_MESSAGE_PROCESSED".as_bytes());

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

/// Delivers offchain messages to the given contract's offchain inbox for subsequent processing.
///
/// Offchain messages are transaction effects that are not broadcasted via onchain logs. Instead, the sender shares the
/// message to the recipient through an external channel (e.g. a URL accessible by the recipient). The recipient then
/// calls this function to hand the messages to the contract so they can be processed through the same mechanisms as
/// onchain messages.
///
/// Messages are processed when their originating transaction is found onchain (providing the context needed to
/// validate resulting notes and events).
///
/// Messages are kept in the inbox until they expire. The expiration is set to `anchor_block_timestamp + MAX_MSG_TTL`
///
/// Processing order is not guaranteed.
pub unconstrained fn receive(
    contract_address: AztecAddress,
    messages: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL>,
) {
    messages.for_each(|msg| { let _ = Entity::create_non_retractable(contract_address, msg.recipient, msg); });

    // Clear cache for message recipients so the next sync runs.
    set_contract_sync_cache_invalid(contract_address, messages.map(|msg| msg.recipient));
}

/// Step function to advance the reception workflow of an offchain message.
///
/// The reception workflow can be in one of the following states:
///
/// - Received and resolved: the TX that originated the message has been found by PXE, giving the context needed to
///   process the message. The message then gets processed, but the workflow remains active because a re-org might undo
//    its effects.
///
/// - Expired: the message's effective expiration (`anchor_block_timestamp + MAX_MSG_TTL`) has passed and it is not
///   being handed off now, so we terminate the reception to stop tracking it.
///
/// - Received-but-unresolved (or tx-less, which never resolves), or already processed: the TX that originated this
///   message is not yet available but might be in the future, so the message stays in the inbox for a future sync.
unconstrained fn process_reception(
    reception: Entity<OffchainMessage>,
    maybe_resolved: Option<ResolvedTx>,
    now: u64,
) -> Option<OffchainMessageWithContext> {
    // TODO(@mverzilli): we could annotate retractable entities and facts as "final" when their corresponding blocks
    // are below the final tip. Then we could use that as termination condition instead of relying on timestamp
    // arithmetics.
    //
    // Alternatively, we could accept a block on `terminate`, which would make the termination itself retractable.
    // The "problem" with that is that we would need some sort of heuristic to cleanup. Maybe the whole
    // retractable/non-retractable distinction is useless at the entity level. We can simply handle entities and
    // if they are started with a block, they are retracted with a block; if they are terminated with a block, they
    // are "unterminated" with a block, but also are removed when a block is final.
    // This, in offchain reception's particular case, would make facts entirely unnecessary (at least at its present
    // functionality).
    let expired = now > reception.body.anchor_block_timestamp + MAX_MSG_TTL;
    let already_processed = reception.facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED);

    if !already_processed & maybe_resolved.is_some() {
        let resolved = maybe_resolved.unwrap();
        reception.log_retractable_fact(OFFCHAIN_MESSAGE_PROCESSED, [], resolved.block_number, resolved.block_hash);
        let message_context = MessageContext {
            tx_hash: resolved.tx_hash,
            unique_note_hashes_in_tx: resolved.unique_note_hashes_in_tx,
            first_nullifier_in_tx: resolved.first_nullifier_in_tx,
        };
        Option::some(
            OffchainMessageWithContext { message_ciphertext: reception.body.ciphertext, message_context },
        )
    } else if expired {
        reception.terminate();
        Option::none()
    } else {
        Option::none()
    }
}

/// Returns offchain-delivered messages to process during sync.
pub unconstrained fn sync_inbox(
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> EphemeralArray<OffchainMessageWithContext> {
    let active_receptions = Entity::<OffchainMessage>::read_all(contract_address, scope);

    // Ask PXE to resolve each message's originating tx. We pass the tx hashes in active-reception order, so the
    // resolved txs come back aligned with the reception indices and can be matched back positionally.
    let resolved_txs = get_resolved_txs(active_receptions.map(|reception: Entity<OffchainMessage>| {
        reception.body.tx_hash.unwrap_or(0)
    }));

    assert_eq(resolved_txs.len(), active_receptions.len());

    let processable_messages: EphemeralArray<OffchainMessageWithContext> = EphemeralArray::empty();
    let now = UtilityContext::new().timestamp();

    active_receptions.for_each(|i, reception| {
        let maybe_message = process_reception(reception, resolved_txs.get(i), now);
        if maybe_message.is_some() {
            processable_messages.push(maybe_message.unwrap());
        }
    });

    processable_messages
}

mod test {
    use crate::{
        entities::{Entity, EntityBody, Fact, get_entity},
        ephemeral::EphemeralArray,
        messages::encoding::MESSAGE_CIPHERTEXT_LEN,
        oracle::random::random,
        protocol::{address::AztecAddress, traits::{Deserialize, FromField, Serialize}},
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, OFFCHAIN_MESSAGE_PROCESSED, OffchainMessage, receive,
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

    /// Wraps a single message in the bounded vec `receive` expects.
    fn one(msg: OffchainMessage) -> BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> {
        let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
        msgs.push(msg);
        msgs
    }

    /// Advances the TXE block timestamp by `offset` seconds and returns the resulting timestamp.
    unconstrained fn advance_by(env: TestEnvironment, offset: u64) -> u64 {
        env.advance_next_block_timestamp_by(offset);
        env.mine_block();
        env.last_block_timestamp()
    }

    /// Returns the entity ids of the reception entities currently active for the given scope.
    unconstrained fn active_keys(c: AztecAddress, s: AztecAddress) -> EphemeralArray<Field> {
        Entity::<OffchainMessage>::read_all(c, s).map(|e: Entity<OffchainMessage>| e.body.entity_id())
    }

    /// Returns `true` if a reception entity with the given entity id is currently active.
    unconstrained fn is_active(c: AztecAddress, s: AztecAddress, key: Field) -> bool {
        active_keys(c, s).any(|k: Field| k == key)
    }

    /// Returns `true` if the reception entity with the given id has been marked processed.
    unconstrained fn is_processed(c: AztecAddress, s: AztecAddress, key: Field) -> bool {
        let facts = get_entity::<OffchainMessage>(c, s, OffchainMessage::entity_type_id(), key).facts;
        facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED)
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
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(tx_hash), anchor_ts)),
            );
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
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(tx_hash), anchor_ts)),
            );
        });

        let key = make_msg(scope, Option::some(tx_hash), anchor_ts).entity_id();

        // Advance, but not past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(is_active(address, scope, key), "not expired entity should stay active");
            assert(!is_processed(address, scope, key), "should still be unprocessed");
        });
    }

    #[test]
    unconstrained fn tx_less_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            receive(
                context.this_address(),
                one(make_msg(scope, Option::none(), anchor_ts)),
            );
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
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(tx_hash), anchor_ts)),
            );
        });

        let key = make_msg(scope, Option::some(tx_hash), anchor_ts).entity_id();

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // not resolved, not ready
            assert(is_active(address, scope, key), "unresolved entity should stay active");
            assert(!is_processed(address, scope, key), "should still be unprocessed");
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
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(known_tx_hash), anchor_ts)),
            );
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

            // Entity stays active (not expired) and is now marked processed, with a Processed fact recorded.
            assert(is_active(address, scope, key), "processed entity should stay active for reorg safety");
            assert(is_processed(address, scope, key), "should be processed");
        });
    }

    #[test]
    unconstrained fn already_processed_is_not_re_pushed() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(known_tx_hash), anchor_ts)),
            );
        });

        let key = make_msg(scope, Option::some(known_tx_hash), anchor_ts).entity_id();

        let _now = advance_by(env, 100);

        // First sync: the message resolves, is pushed for processing, and a Processed fact is recorded.
        env.utility_context(|context| {
            let address = context.this_address();
            let first = sync_inbox(address, scope);
            assert_eq(first.len(), 1);
            assert(is_processed(address, scope, key), "should be processed");
        });

        // Second sync with the same resolvable context: the Processed guard skips the message (idempotency) while the
        // entity remains active (not expired).
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(is_active(address, scope, key), "processed entity should still be active");
            assert(is_processed(address, scope, key), "should remain processed");
        });
    }

    #[test]
    unconstrained fn expired_resolved_msg_is_processed_before_termination() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);

        env.utility_context(|context| {
            receive(
                context.this_address(),
                one(make_msg(scope, Option::some(known_tx_hash), anchor_ts)),
            );
        });

        let key = make_msg(scope, Option::some(known_tx_hash), anchor_ts).entity_id();

        // Advance past anchor_ts + MAX_MSG_TTL so the message is expired on the next sync.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        // First sync: even though the message is expired, its context resolves, so it is handed off for processing
        // rather than silently evicted. The entity stays active this sync (now marked processed).
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 1);
            assert(is_active(address, scope, key), "expired-but-resolved entity is processed, not terminated yet");
            assert(is_processed(address, scope, key), "should be processed");
        });

        // Second sync: still expired and now processed, so the entity is terminated.
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(!is_active(address, scope, key), "expired processed entity is terminated on the next sync");
        });
    }

    // -- Idempotent re-delivery (first-write-wins entity creation) ---------

    #[test]
    unconstrained fn redelivery_is_idempotent() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(random()), anchor_ts);
        let key = msg.entity_id();

        // First delivery, committed as its own job.
        env.utility_context(|context| { receive(context.this_address(), one(msg)); });

        // Re-delivering the same content-addressed message must not panic and must not create a second reception.
        env.utility_context(|context| {
            let address = context.this_address();
            receive(address, one(msg));

            assert(is_active(address, scope, key), "reception should be active");
            assert_eq(active_keys(address, scope).len(), 1);
        });
    }

    #[test]
    unconstrained fn redelivery_after_processing_keeps_processed_guard() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(known_tx_hash), anchor_ts);
        let key = msg.entity_id();

        env.utility_context(|context| { receive(context.this_address(), one(msg)); });

        let _now = advance_by(env, 100);

        // First sync resolves the message and records its Processed guard fact.
        env.utility_context(|context| {
            let address = context.this_address();
            assert_eq(sync_inbox(address, scope).len(), 1);
            assert(is_processed(address, scope, key), "should be processed");
        });

        // Re-deliver the same message. First-write-wins create is a no-op that preserves the Processed fact, so the
        // next sync recognizes it as already processed and does not re-push it.
        env.utility_context(|context| {
            let address = context.this_address();
            receive(address, one(msg));

            assert(is_processed(address, scope, key), "re-delivery must preserve the processed guard");
            assert_eq(sync_inbox(address, scope).len(), 0);
        });
    }

    // ---- Pack/unpack tests (no TXE) ----

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
