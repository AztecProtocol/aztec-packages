use crate::{
    capsules::CapsuleArray,
    context::UtilityContext,
    messages::{
        encoding::MESSAGE_CIPHERTEXT_LEN,
        processing::{MessageContext, MessageTxContext, OffchainMessageWithContext, resolve_message_contexts},
    },
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

/// Ephemeral capsule slot used by [`sync_inbox`] to pass tx hash resolution requests to PXE.
global OFFCHAIN_CONTEXT_REQUESTS_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_REQUESTS_SLOT".as_bytes());

/// Ephemeral capsule slot used by [`sync_inbox`] to read tx context responses from PXE.
global OFFCHAIN_CONTEXT_RESPONSES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_RESPONSES_SLOT".as_bytes());

/// Ephemeral capsule slot used by [`sync_inbox`] to collect messages ready for processing.
global OFFCHAIN_READY_MESSAGES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_READY_MESSAGES_SLOT".as_bytes());

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

/// Tolerance added to the `MAX_TX_LIFETIME` cap for message expiration.
global TX_EXPIRATION_CAP_TOLERANCE: u64 = 7200; // 2 hours

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
/* contract_address */AztecAddress) -> CapsuleArray<OffchainMessageWithContext>;

/// A message delivered via the `offchain_receive` utility function.
pub struct OffchainMessage {
    /// The encrypted message payload.
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    pub recipient: AztecAddress,
    /// The hash of the transaction that produced this message. `Option::none` indicates a tx-less message.
    pub tx_hash: Option<Field>,
    /// The timestamp after which this message can be evicted from the inbox.
    pub expiration_timestamp: u64,
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
    /// The timestamp after which this message can be evicted from the inbox (as provided by the sender).
    expiration_timestamp: u64,
    /// The timestamp at which this message was received (i.e. added to the inbox via `receive`).
    ///
    /// Used to cap the effective expiration of messages with an associated transaction: since a tx can only live for
    /// `MAX_TX_LIFETIME`, we don't need to keep the message around longer than `received_at + MAX_TX_LIFETIME`,
    /// regardless of the sender-provided `expiration_timestamp`.
    received_at: u64,
}

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
/// Messages are kept in the inbox until their expiration timestamp is reached. For messages with an associated
/// transaction, the effective expiration is capped to `received_at + MAX_TX_LIFETIME`, since there's no point in
/// keeping a message around longer than its originating transaction could possibly live.
///
/// Processing order is not guaranteed.
pub unconstrained fn receive(
    contract_address: AztecAddress,
    messages: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL>,
) {
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT);
    let now = UtilityContext::new().timestamp();
    let mut i = 0;
    let messages_len = messages.len();
    while i < messages_len {
        let msg = messages.get(i);
        let tx_hash = if msg.tx_hash.is_some() {
            msg.tx_hash.unwrap()
        } else {
            0
        };
        inbox.push(
            PendingOffchainMsg {
                ciphertext: msg.ciphertext,
                recipient: msg.recipient,
                tx_hash,
                expiration_timestamp: msg.expiration_timestamp,
                received_at: now,
            },
        );
        i += 1;
    }

    // TODO: Invoke an oracle to invalidate contract sync state cache
}

/// Returns offchain-delivered messages to process during sync.
///
/// Messages remain in the inbox and are reprocessed on each sync until their originating transaction is no longer at
/// risk of being dropped by a reorg.
pub unconstrained fn sync_inbox(address: AztecAddress) -> CapsuleArray<OffchainMessageWithContext> {
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT);
    let context_resolution_requests: CapsuleArray<Field> = CapsuleArray::at(address, OFFCHAIN_CONTEXT_REQUESTS_SLOT);
    let resolved_contexts: CapsuleArray<Option<MessageTxContext>> =
        CapsuleArray::at(address, OFFCHAIN_CONTEXT_RESPONSES_SLOT);
    let ready_to_process: CapsuleArray<OffchainMessageWithContext> =
        CapsuleArray::at(address, OFFCHAIN_READY_MESSAGES_SLOT);

    // Clear any stale ready messages from a previous run.
    ready_to_process.for_each(|i, _| { ready_to_process.remove(i); });

    // Clear any stale context resolution requests/responses from a previous run.
    context_resolution_requests.for_each(|i, _| { context_resolution_requests.remove(i); });
    resolved_contexts.for_each(|i, _| { resolved_contexts.remove(i); });

    // Build a request list aligned with the inbox indices.
    let mut i = 0;
    let inbox_len = inbox.len();
    while i < inbox_len {
        let msg = inbox.get(i);
        context_resolution_requests.push(msg.tx_hash);
        i += 1;
    }

    // Ask PXE to resolve contexts for all requested tx hashes.
    resolve_message_contexts(
        address,
        OFFCHAIN_CONTEXT_REQUESTS_SLOT,
        OFFCHAIN_CONTEXT_RESPONSES_SLOT,
    );

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
        // process the message. We add the message to the `ready_to_process` CapsuleArray so that the `sync_state` loop
        // processes it.
        //
        // In all cases, if the message has expired, or the associated TX is older than than `MAX_TX_LIFETIME`
        // (24 hours), we remove it from the inbox.
        //
        // Note: the loop runs backwards because it might call `inbox.remove(j)` to purge expired messages and we also
        // need to align it with `resolved_contexts.get(j)`. Going from last to first simplifies the algorithm as
        // not yet visited element indexes remain stable.
        j -= 1;
        let maybe_ctx = resolved_contexts.get(j);
        let msg = inbox.get(j);

        // Compute the message's effective expiration timestamp to determine if we can purge it from the inbox.
        let effective_expiration = if msg.tx_hash != 0 {
            // For messages with an associated transaction, we cap the sender-provided expiration timestamp to
            // `received_at + MAX_TX_LIFETIME + 2 hours tolerance`: there's no point in keeping a message once the TX
            // can no longer possibly be included in a block.
            let tx_lifetime_cap = msg.received_at + MAX_TX_LIFETIME + TX_EXPIRATION_CAP_TOLERANCE;
            if msg.expiration_timestamp < tx_lifetime_cap {
                msg.expiration_timestamp
            } else {
                tx_lifetime_cap
            }
        } else {
            // Messages with no associated TX expire on their `expiration_timestamp`
            msg.expiration_timestamp
        };

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
        let ctx = maybe_ctx.unwrap();
        let message_context = MessageContext {
            tx_hash: ctx.tx_hash,
            unique_note_hashes_in_tx: ctx.unique_note_hashes_in_tx,
            first_nullifier_in_tx: ctx.first_nullifier_in_tx,
            recipient: msg.recipient,
        };
        ready_to_process.push(OffchainMessageWithContext { message_ciphertext: msg.ciphertext, message_context });
    }

    ready_to_process
}
