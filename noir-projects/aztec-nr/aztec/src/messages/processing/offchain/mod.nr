use crate::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    facts::{
        delete_fact_collection, Fact, FactCollection, get_fact_collections_by_type, OriginBlock,
        record_non_retractable_fact, record_retractable_fact,
    },
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, processing::{MessageContext, OffchainMessageWithContext}},
    oracle::{contract_sync::set_contract_sync_cache_invalid, tx_resolution::{get_resolved_txs, ResolvedTx}},
    protocol::{
        address::AztecAddress,
        constants::MAX_TX_LIFETIME,
        hash::{poseidon2_hash, sha256_to_field},
        traits::{Deserialize, Serialize},
    },
};

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

/// Maximum time-to-live for a tx-bound offchain message.
///
/// After `anchor_block_timestamp + MAX_MSG_TTL`, the message is evicted from the inbox.
/// (7200 == 2 hours)
global MAX_MSG_TTL: u64 = MAX_TX_LIFETIME + 7200;

/// Fact type id of the fact that stores the offchain message body inside a reception collection.
global OFFCHAIN_MESSAGE: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_MESSAGE".as_bytes());

/// Fact type id to mark an offchain message as processed.
///
/// A reception is in "processed state" exactly when its collection carries a fact of this type.
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
    // Offchain reception facts are scoped to the recipient. Note that because offchain messages have no integrity or
    // authenticity checks it is not possible to verify that this is indeed the intended recipient. In this case we're
    // assuming a cooperative environment, which is on par with other offchain delivery expectations.
    messages.for_each(|msg| {
        record_non_retractable_fact(
            contract_address,
            msg.recipient,
            OFFCHAIN_RECEPTION_TYPE_ID,
            fact_collection_id(msg),
            OFFCHAIN_MESSAGE,
            encode_message(msg),
        );
    });

    // Clear cache for message recipients so the next sync runs.
    set_contract_sync_cache_invalid(contract_address, messages.map(|msg| msg.recipient));
}

/// Serializes an `OffchainMessage` into a fact payload.
unconstrained fn encode_message(message: OffchainMessage) -> EphemeralArray<Field> {
    let fields = message.serialize();
    let payload: EphemeralArray<Field> = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}

/// Reads the message body fact back out of a reception collection.
unconstrained fn decode_message(reception: FactCollection) -> OffchainMessage {
    let message_fact = reception.facts.find(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE).unwrap();
    let n = <OffchainMessage as Deserialize>::N;
    let mut fields = [0; <OffchainMessage as Deserialize>::N];
    for i in 0..n {
        fields[i] = message_fact.payload.get(i);
    }
    Deserialize::deserialize(fields)
}

/// Returns `true` if the reception has been marked processed.
unconstrained fn is_processed(reception: FactCollection) -> bool {
    reception.facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED)
}

/// Records the retractable processed marker for a reception, originated at the resolved block.
unconstrained fn mark_processed(reception: FactCollection, block_number: u32, block_hash: Field) {
    let empty_payload: EphemeralArray<Field> = EphemeralArray::empty();
    record_retractable_fact(
        reception.contract_address,
        reception.scope,
        reception.fact_collection_type_id,
        reception.fact_collection_id,
        OFFCHAIN_MESSAGE_PROCESSED,
        empty_payload,
        OriginBlock { block_number, block_hash },
    );
}

/// Terminates a reception by deleting its fact collection.
unconstrained fn terminate(reception: FactCollection) {
    delete_fact_collection(
        reception.contract_address,
        reception.scope,
        reception.fact_collection_type_id,
        reception.fact_collection_id,
    );
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
    reception: FactCollection,
    message: OffchainMessage,
    maybe_resolved: Option<ResolvedTx>,
    now: u64,
) -> Option<OffchainMessageWithContext> {
    // TODO(@mverzilli): we could annotate retractable facts as "final" when their corresponding blocks are below the
    // final tip. Then we could use that as termination condition instead of relying on timestamp arithmetics.
    let expired = now > message.anchor_block_timestamp + MAX_MSG_TTL;
    let already_processed = is_processed(reception);

    if !already_processed & maybe_resolved.is_some() {
        let resolved = maybe_resolved.unwrap();
        mark_processed(reception, resolved.block_number, resolved.block_hash);
        let message_context = MessageContext {
            tx_hash: resolved.tx_hash,
            unique_note_hashes_in_tx: resolved.unique_note_hashes_in_tx,
            first_nullifier_in_tx: resolved.first_nullifier_in_tx,
        };
        Option::some(
            OffchainMessageWithContext { message_ciphertext: message.ciphertext, message_context },
        )
    } else if expired {
        terminate(reception);
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
    let active_receptions = get_fact_collections_by_type(contract_address, scope, OFFCHAIN_RECEPTION_TYPE_ID);
    let messages = active_receptions.map(|reception: FactCollection| decode_message(reception));

    // Ask PXE to resolve each message's originating tx. We pass the tx hashes in reception order, so the resolved txs
    // come back aligned with the reception indices and can be matched back positionally.
    let resolved_txs = get_resolved_txs(
        messages.map(|msg: OffchainMessage| msg.tx_hash.unwrap_or(0)),
    );

    let processable_messages: EphemeralArray<OffchainMessageWithContext> = EphemeralArray::empty();
    let now = UtilityContext::new().timestamp();

    active_receptions.for_each(|i, reception| {
        let maybe_message = process_reception(reception, messages.get(i), resolved_txs.get(i), now);
        if maybe_message.is_some() {
            processable_messages.push(maybe_message.unwrap());
        }
    });

    processable_messages
}

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

/// Fact-collection type id shared by every offchain message reception in the fact store.
global OFFCHAIN_RECEPTION_TYPE_ID: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_RECEPTION_TYPE_ID".as_bytes());

/// Computes the fact-collection id that identifies a message's reception workflow in the fact store.
///
/// The id is a hash over the full serialized message. Re-delivering a byte-identical message therefore is idempotent,
/// and a message differing in any of its fields triggers a completely new reception workflow.
fn fact_collection_id(message: OffchainMessage) -> Field {
    poseidon2_hash(message.serialize())
}

mod test {
    use crate::{
        ephemeral::EphemeralArray,
        facts::{Fact, FactCollection, get_fact_collection, get_fact_collections_by_type},
        oracle::random::random,
        protocol::address::AztecAddress,
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        fact_collection_id, MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, OFFCHAIN_MESSAGE_PROCESSED,
        OFFCHAIN_RECEPTION_TYPE_ID, OffchainMessage, receive, sync_inbox,
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

    /// Returns the collection ids of the receptions currently active for the given scope.
    unconstrained fn messages_in_inbox(contract_address: AztecAddress, scope: AztecAddress) -> EphemeralArray<Field> {
        get_fact_collections_by_type(contract_address, scope, OFFCHAIN_RECEPTION_TYPE_ID).map(|c: FactCollection| {
            c.fact_collection_id
        })
    }

    /// Returns `true` if a reception with the given collection id is currently active.
    unconstrained fn is_in_inbox(contract_address: AztecAddress, scope: AztecAddress, collection_id: Field) -> bool {
        messages_in_inbox(contract_address, scope).any(|k: Field| k == collection_id)
    }

    /// Returns `true` if the reception with the given collection id has been marked processed.
    unconstrained fn is_processed(contract_address: AztecAddress, scope: AztecAddress, collection_id: Field) -> bool {
        let maybe_collection = get_fact_collection(
            contract_address,
            scope,
            OFFCHAIN_RECEPTION_TYPE_ID,
            collection_id,
        );
        if maybe_collection.is_some() {
            maybe_collection.unwrap().facts.any(|f: Fact| f.fact_type_id == OFFCHAIN_MESSAGE_PROCESSED)
        } else {
            false
        }
    }

    #[test]
    unconstrained fn empty_inbox_returns_empty_result() {
        let (env, scope) = setup();
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0);
            assert_eq(messages_in_inbox(address, scope).len(), 0);
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(!is_in_inbox(address, scope, fact_collection_id(msg)), "expired reception should be terminated");
        });
    }

    #[test]
    unconstrained fn tx_bound_msg_not_expired_before_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        // Advance, but not past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(is_in_inbox(address, scope, fact_collection_id(msg)), "not expired reception should stay active");
            assert(!is_processed(address, scope, fact_collection_id(msg)), "should still be unprocessed");
        });
    }

    #[test]
    unconstrained fn tx_less_msg_expires_after_max_msg_ttl() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        // A tx-less message normalizes to tx_hash 0.
        let msg = make_msg(scope, Option::none(), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        // Advance past anchor_ts + MAX_MSG_TTL.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert(!is_in_inbox(address, scope, fact_collection_id(msg)), "expired reception should be terminated");
        });
    }

    #[test]
    unconstrained fn unresolved_tx_stays_in_inbox() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let tx_hash = random();
        let msg = make_msg(scope, Option::some(tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // not resolved, not ready
            assert(is_in_inbox(address, scope, fact_collection_id(msg)), "unresolved reception should stay active");
            assert(!is_processed(address, scope, fact_collection_id(msg)), "should still be unprocessed");
        });
    }

    #[test]
    unconstrained fn multiple_messages_mixed_expiration() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);

        let expired_a_tx_hash = random();
        let survivor_tx_hash = random();

        let expired_a = make_msg(scope, Option::some(expired_a_tx_hash), 0);
        let survivor = make_msg(scope, Option::some(survivor_tx_hash), anchor_ts);
        let expired_b = make_msg(scope, Option::none(), 0);

        env.utility_context(|context| {
            let address = context.this_address();
            let mut msgs: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> = BoundedVec::new();
            // Message 0: tx-bound, anchor=0 so it expires quickly.
            msgs.push(expired_a);
            // Message 1: tx-bound, anchor_ts is recent so it survives.
            msgs.push(survivor);
            // Message 2: tx-less, anchor=0 so it also expires.
            msgs.push(expired_b);
            receive(address, msgs);
        });

        // Advance past MAX_MSG_TTL for anchor=0, but not for anchor_ts.
        let _now = advance_by(env, MAX_MSG_TTL);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0); // all contexts are None
            assert(
                !is_in_inbox(address, scope, fact_collection_id(expired_a)),
                "expired tx-bound reception should be terminated",
            );
            assert(
                !is_in_inbox(address, scope, fact_collection_id(expired_b)),
                "expired tx-less reception should be terminated",
            );
            assert(is_in_inbox(address, scope, fact_collection_id(survivor)), "survivor reception should stay active");
            assert_eq(messages_in_inbox(address, scope).len(), 1);
        });
    }

    // -- Resolved context (ready to process) ------------------------------

    #[test]
    unconstrained fn resolved_msg_is_ready_to_process() {
        let (env, scope) = setup();
        // In TXE, tx hashes equal Fr(blockNumber), so Fr(1) is the tx effect from block 1.
        // We use this as a "known resolvable" tx hash.
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(known_tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        let _now = advance_by(env, 100);

        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            // The message should be ready to process since its tx context was resolved.
            assert_eq(result.len(), 1);

            let ctx = result.get(0).message_context;
            assert_eq(ctx.tx_hash, known_tx_hash);

            // Reception stays active (not expired) and is now marked processed, with a Processed fact recorded.
            assert(
                is_in_inbox(address, scope, fact_collection_id(msg)),
                "processed reception should stay active for reorg safety",
            );
            assert(is_processed(address, scope, fact_collection_id(msg)), "should be processed");
        });
    }

    #[test]
    unconstrained fn already_processed_is_not_re_pushed() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(known_tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        let _now = advance_by(env, 100);

        // First sync: the message resolves, is pushed for processing.
        env.utility_context(|context| {
            let address = context.this_address();
            let first = sync_inbox(address, scope);
            assert_eq(first.len(), 1);
            assert(is_processed(address, scope, fact_collection_id(msg)), "should be processed");
        });

        // Second sync with the same resolvable context the reception remains active (not expired).
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(is_in_inbox(address, scope, fact_collection_id(msg)), "processed reception should still be active");
            assert(is_processed(address, scope, fact_collection_id(msg)), "should remain processed");
        });
    }

    #[test]
    unconstrained fn expired_resolved_msg_is_processed_once_before_termination() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(known_tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        // Advance past anchor_ts + MAX_MSG_TTL so the message is expired on the next sync.
        let _now = advance_by(env, MAX_MSG_TTL + 1);

        // First sync: even though the message is expired, its context resolves, so it is handed off for processing.
        env.utility_context(|context| {
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 1);
            assert(
                is_in_inbox(address, scope, fact_collection_id(msg)),
                "expired-but-resolved reception is processed, not terminated yet",
            );
            assert(is_processed(address, scope, fact_collection_id(msg)), "should be processed");
        });

        // Second sync: still expired and now processed, so the reception is terminated.
        env.utility_context(|context| {
            let address = context.this_address();
            let second = sync_inbox(address, scope);

            assert_eq(second.len(), 0); // already processed, not re-pushed
            assert(
                !is_in_inbox(address, scope, fact_collection_id(msg)),
                "expired processed reception is terminated on the next sync",
            );
        });
    }

    // -- Idempotent re-delivery (first-write-wins fact recording) ---------

    #[test]
    unconstrained fn redelivery_is_idempotent() {
        let (env, scope) = setup();
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(random()), anchor_ts);

        // First delivery, committed as its own job.
        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        // Re-delivering the same content-addressed message must not panic and must not create a second reception.
        env.utility_context(|context| {
            let address = context.this_address();
            receive(address, BoundedVec::from_array([msg]));

            assert(is_in_inbox(address, scope, fact_collection_id(msg)), "reception should be active");
            assert_eq(messages_in_inbox(address, scope).len(), 1);
        });
    }

    #[test]
    unconstrained fn redelivery_after_processing_keeps_processed_guard() {
        let (env, scope) = setup();
        let known_tx_hash: Field = 1;
        let anchor_ts = advance_by(env, 10);
        let msg = make_msg(scope, Option::some(known_tx_hash), anchor_ts);

        env.utility_context(|context| { receive(context.this_address(), BoundedVec::from_array([msg])); });

        let _now = advance_by(env, 100);

        // First sync resolves the message and marks it as processed.
        env.utility_context(|context| {
            let address = context.this_address();
            assert_eq(sync_inbox(address, scope).len(), 1);
            assert(is_processed(address, scope, fact_collection_id(msg)), "should be processed");
        });

        // Re-deliver the same message. The next sync recognizes it as already processed and does not re-push it.
        env.utility_context(|context| {
            let address = context.this_address();
            receive(address, BoundedVec::from_array([msg]));

            assert(
                is_processed(address, scope, fact_collection_id(msg)),
                "re-delivery must preserve the processed guard",
            );
            assert_eq(sync_inbox(address, scope).len(), 0);
        });
    }
}
