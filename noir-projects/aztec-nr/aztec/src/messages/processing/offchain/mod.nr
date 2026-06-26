use crate::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::{encoding::MESSAGE_CIPHERTEXT_LEN, processing::OffchainMessageWithContext},
    oracle::{contract_sync::set_contract_sync_cache_invalid, tx_resolution::get_resolved_txs},
    protocol::{address::AztecAddress, traits::{Deserialize, Serialize}},
};

mod reception;
use reception::OffchainReception;

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

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
/// The only current implementation of an [`OffchainInboxSync`] is [`sync_inbox`], which manages an inbox with
/// expiration
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
    messages.for_each(|msg| OffchainReception::init(contract_address, msg));

    // Clear cache for message recipients so the next sync runs.
    set_contract_sync_cache_invalid(contract_address, messages.map(|msg| msg.recipient));
}

/// Returns offchain-delivered messages to process during sync.
pub unconstrained fn sync_inbox(
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> EphemeralArray<OffchainMessageWithContext> {
    let active_receptions = OffchainReception::load_all(contract_address, scope);

    // Ask PXE to resolve each message's originating tx. We pass the tx hashes in reception order, so the resolved txs
    // come back aligned with the reception indices and can be matched back positionally.
    let resolved_txs = get_resolved_txs(active_receptions.map(|reception: OffchainReception| {
        reception.read_message().tx_hash.unwrap_or(0)
    }));

    let processable_messages: EphemeralArray<OffchainMessageWithContext> = EphemeralArray::empty();
    let now = UtilityContext::new().timestamp();

    active_receptions.for_each(|i, reception| {
        let maybe_message = reception.step(resolved_txs.get(i), now);
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

mod test {
    use crate::{
        oracle::random::random, protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
    };
    use super::{MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL, OffchainMessage, receive, sync_inbox};
    use super::reception::{MAX_MSG_TTL, OffchainReception};

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
            let address = context.this_address();
            let result = sync_inbox(address, scope);

            assert_eq(result.len(), 0);
            assert_eq(OffchainReception::load_all(address, scope).len(), 0);
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
                !OffchainReception::is_active(address, scope, expired_a),
                "expired tx-bound reception should be terminated",
            );
            assert(
                !OffchainReception::is_active(address, scope, expired_b),
                "expired tx-less reception should be terminated",
            );
            assert(OffchainReception::is_active(address, scope, survivor), "survivor reception should stay active");
            assert_eq(OffchainReception::load_all(address, scope).len(), 1);
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

            assert(OffchainReception::is_active(address, scope, msg), "reception should be active");
            assert_eq(OffchainReception::load_all(address, scope).len(), 1);
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
            assert(OffchainReception::is_processed(address, scope, msg), "should be processed");
        });

        // Re-deliver the same message. The next sync recognizes it as already processed and does not re-push it.
        env.utility_context(|context| {
            let address = context.this_address();
            receive(address, BoundedVec::from_array([msg]));

            assert(
                OffchainReception::is_processed(address, scope, msg),
                "re-delivery must preserve the processed guard",
            );
            assert_eq(sync_inbox(address, scope).len(), 0);
        });
    }
}
