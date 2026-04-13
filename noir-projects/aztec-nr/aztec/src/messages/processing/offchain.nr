use crate::{
    capsules::CapsuleArray,
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, processing::OffchainMessageWithContext},
    oracle::contract_sync::set_contract_sync_cache_invalid,
    protocol::{
        address::AztecAddress,
        constants::MAX_TX_LIFETIME,
        hash::sha256_to_field,
        traits::{Deserialize, Serialize},
    },
};

/// Base capsule slot for the persistent inbox of [`PendingOffchainMsg`] entries.
///
/// This is the slot where we accumulate messages received through [`receive`].
global OFFCHAIN_INBOX_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_INBOX_SLOT".as_bytes());

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

/// An offchain message awaiting processing (or re-processing) in the inbox.
///
/// Messages remain in the inbox until they expire, even if they have already been processed. This is necessary to
/// handle reorgs: a processed message may need to be re-processed if the transaction that provided its context is
/// reverted. On each sync, resolved messages are promoted to [`OffchainMessageWithContext`] for processing.
#[derive(Serialize, Deserialize)]
struct PendingOffchainMsg {
    /// The encrypted message payload.
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    recipient: AztecAddress,
    /// The hash of the transaction that produced this message. A value of 0 indicates a tx-less message.
    tx_hash: Field,
    /// Anchor block timestamp at message emission. Used to compute the effective expiration: messages are evicted
    /// after `anchor_block_timestamp + MAX_MSG_TTL`.
    anchor_block_timestamp: u64,
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
        let tx_hash = if msg.tx_hash.is_some() {
            msg.tx_hash.unwrap()
        } else {
            0
        };
        let inbox: CapsuleArray<PendingOffchainMsg> =
            CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT, msg.recipient);
        inbox.push(
            PendingOffchainMsg {
                ciphertext: msg.ciphertext,
                recipient: msg.recipient,
                tx_hash,
                anchor_block_timestamp: msg.anchor_block_timestamp,
            },
        );
        scopes.push(msg.recipient);
        i += 1;
    }

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
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT, scope);
    let context_resolution_requests: EphemeralArray<Field> = EphemeralArray::at(OFFCHAIN_CONTEXT_REQUESTS_SLOT).clear();
    let ready_to_process: EphemeralArray<OffchainMessageWithContext> =
        EphemeralArray::at(OFFCHAIN_READY_MESSAGES_SLOT).clear();

    // Build a request list aligned with the inbox indices.
    let mut i = 0;
    let inbox_len = inbox.len();
    while i < inbox_len {
        let msg = inbox.get(i);
        context_resolution_requests.push(msg.tx_hash);
        i += 1;
    }

    // Ask PXE to resolve contexts for all requested tx hashes. The oracle returns responses in a new
    // ephemeral array.
    let resolved_contexts =
        crate::oracle::message_processing::get_message_contexts_by_tx_hash(context_resolution_requests);

    assert_eq(resolved_contexts.len(), inbox_len);

    let now = UtilityContext::new().timestamp();

    let mut j = inbox_len;
    while j > 0 {
        // This loop decides what to do with each message in the offchain message inbox. We need to handle 3
        // different scenarios for each message.
        //
        // 1. The TX that emitted this message is still not known to PXE: in this case we can't yet process this
        // message, as any notes or events discovered will fail to be validated. So we leave the message in the inbox,
        // awaiting for future syncs to detect that the TX became available.
        //
        // 2. The message is not associated to a TX to begin with. The current version of offchain message processing
        // does not support this case, but in the future it will. Right now, a message without an associated TX will
        // sit in the inbox until it expires.
        //
        // 3. The TX that emitted this message has been found by PXE. That gives us all the information needed to
        // process the message. We add the message to the `ready_to_process` EphemeralArray so that the `sync_state`
        // loop
        // processes it.
        //
        // In all cases, if the message has expired (i.e. `now > anchor_block_timestamp + MAX_MSG_TTL`), we remove it
        // from the inbox.
        //
        // Note: the loop runs backwards because it might call `inbox.remove(j)` to purge expired messages and we also
        // need to align it with `resolved_contexts.get(j)`. Going from last to first simplifies the algorithm as
        // not yet visited element indexes remain stable.
        j -= 1;
        let maybe_ctx = resolved_contexts.get(j);
        let msg = inbox.get(j);

        // Compute the message's effective expiration timestamp to determine if we can purge it from the inbox.
        let effective_expiration = msg.anchor_block_timestamp + MAX_MSG_TTL;

        // Message expired. We remove it from the inbox.
        if now > effective_expiration {
            inbox.remove(j);
        }

        // Scenario 1: associated TX not yet available. We keep the message in the inbox, as it might become
        // processable as new blocks get mined.
        // Scenario 2: no TX associated to message. The message will sit in the inbox until it expires.
        if maybe_ctx.is_none() {
            continue;
        }

        // Scenario 3: Message is ready to process, add to result array. Note we still keep it in the inbox unless we
        // consider it has expired: this is because we need to account for reorgs. If reorg occurs after we processed
        // a message, the effects of processing the message get rewind. However, the associated TX can be included in
        // a subsequent block. Should that happen, the message must be re-processed to ensure consistency.
        let message_context = maybe_ctx.unwrap();
        ready_to_process.push(OffchainMessageWithContext { message_ciphertext: msg.ciphertext, message_context });
    }

    ready_to_process
}

mod test {
    use crate::{
        capsules::CapsuleArray, oracle::random::random, protocol::address::AztecAddress,
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{
        MAX_MSG_TTL, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, OFFCHAIN_INBOX_SLOT, OffchainMessage, PendingOffchainMsg,
        receive, sync_inbox,
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

    #[test]
    unconstrained fn empty_inbox_returns_empty_result() {
        let (env, scope) = setup();
        env.utility_context(|context| {
            let result = sync_inbox(context.this_address(), scope);
            let inbox: CapsuleArray<PendingOffchainMsg> =
                CapsuleArray::at(context.this_address(), OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0);
            assert_eq(inbox.len(), 0);
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(inbox.len(), 0); // expired, removed
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(inbox.len(), 1); // not expired, stays
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0); // context is None, not ready
            assert_eq(inbox.len(), 0); // expired, removed
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0); // not resolved, not ready
            assert_eq(inbox.len(), 1); // not expired, stays
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
            // Message 0: tx-bound, anchor_ts in the past so it expires at
            // anchor_ts + MAX_MSG_TTL. We set anchor to 0 so it expires quickly.
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            assert_eq(result.len(), 0); // all contexts are None
            // Message 0 expired (anchor=0), message 1 survived (anchor=anchor_ts),
            // Message 2 expired (anchor=0).
            assert_eq(inbox.len(), 1);
            assert_eq(inbox.get(0).tx_hash, survivor_tx_hash);
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
            let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT, scope);

            // The message should be ready to process since its tx context was resolved.
            assert_eq(result.len(), 1);

            let ctx = result.get(0).message_context;
            assert_eq(ctx.tx_hash, known_tx_hash);
            assert(ctx.first_nullifier_in_tx != 0, "resolved context must have a first nullifier");

            // Message stays in inbox (not expired) for potential reorg reprocessing.
            assert_eq(inbox.len(), 1);
        });
    }
}
