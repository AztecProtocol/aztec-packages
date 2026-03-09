use crate::{
    capsules::CapsuleArray,
    context::UtilityContext,
    messages::{
        encoding::MESSAGE_CIPHERTEXT_LEN,
        processing::{MessageContext, MessageTxContext, OffchainMessageWithContext, resolve_message_contexts},
    },
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}},
};

/// Base capsule slot for the persistent inbox of [`PendingOffchainMsg`] entries.
///
/// This is the slot where we accumulate messages received through [`receive`].
global OFFCHAIN_INBOX_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_INBOX_SLOT".as_bytes());

/// Ephemeral capsule slot used by [`default_handler`] to pass tx hash resolution requests to PXE.
global OFFCHAIN_CONTEXT_REQUESTS_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_REQUESTS_SLOT".as_bytes());

/// Ephemeral capsule slot used by [`default_handler`] to read tx context responses from PXE.
global OFFCHAIN_CONTEXT_RESPONSES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_RESPONSES_SLOT".as_bytes());

/// Ephemeral capsule slot used by [`default_handler`] to collect messages ready for processing.
global OFFCHAIN_READY_MESSAGES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_READY_MESSAGES_SLOT".as_bytes());

/// Maximum number of offchain messages accepted by `offchain_receive` in a single call.
pub global MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL: u32 = 16;

/// Minimum time that a message is kept in the inbox before eviction: 24 hours. After 24 hours, the protocol guarantees
/// that the original TX that emitted the message can no longer be included in a block. This gives us a bounded time
/// window within which we need to keep messages around in case we need to reprocess them after reorgs.
global OFFCHAIN_MESSAGE_TTL_SECONDS: u64 = 24 * 3600;

/// A message delivered via the `offchain_receive` utility function.
pub struct OffchainMessage {
    /// The encrypted message payload.
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    pub recipient: AztecAddress,
    /// The hash of the transaction that produced this message. `Option::none` indicates a tx-less message.
    pub tx_hash: Option<Field>,
}

/// An offchain message awaiting processing (or re-processing) in the inbox.
///
/// Messages remain in the inbox until they expire after [`OFFCHAIN_MESSAGE_TTL_SECONDS`], even if they have already
/// been processed. This is necessary to handle reorgs: a processed message may need to be re-processed if the
/// transaction that provided its context is reverted. On each sync, resolved messages are promoted to
/// [`OffchainMessageWithContext`] for processing.
#[derive(Serialize, Deserialize)]
struct PendingOffchainMsg {
    /// The encrypted message payload.
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    /// The intended recipient of the message.
    recipient: AztecAddress,
    /// The hash of the transaction that produced this message. A value of 0 indicates a tx-less message.
    tx_hash: Field,
    /// Timestamp at which the message was received, used for TTL-based eviction.
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
/// Messages are kept in the inbox until the originating transaction can be assumed to have expired. This is necessary
/// to make the mechanism resilient to reorgs.
///
/// Processing order is not guaranteed.
pub unconstrained fn receive(
    contract_address: AztecAddress,
    messages: BoundedVec<OffchainMessage, MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL>,
) {
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT);
    let received_at = UtilityContext::new().timestamp();
    let mut i = 0;
    let messages_len = messages.len();
    while i < messages_len {
        let msg = messages.get(i);
        let tx_hash = if msg.tx_hash.is_some() {
            msg.tx_hash.unwrap()
        } else {
            0
        };
        inbox.push(PendingOffchainMsg { ciphertext: msg.ciphertext, recipient: msg.recipient, tx_hash, received_at });
        i += 1;
    }

    // TODO: Invoke an oracle to invalidate contract sync state cache
}

/// Returns offchain-delivered messages to process during sync.
///
/// Messages remain in the inbox and are reprocessed on each sync until their originating transaction is no longer at
/// risk of being dropped by a reorg.
pub unconstrained fn default_handler(address: AztecAddress) -> CapsuleArray<OffchainMessageWithContext> {
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
        j -= 1;
        let maybe_ctx = resolved_contexts.get(j);
        let msg = inbox.get(j);

        // This loop decides what to do with each message in the offchain message inbox. We need to handle 5
        // different scenarios for each message.
        //
        // 1. The TX that emitted this message has not been included in a block for more than 24 hours. In this
        // scenario it is no longer possible to for it to be included. So we remove the message from the inbox as it is
        // no longer processable.
        //
        // 2. The TX that emitted this message is still not known to PXE: in this case we can't yet process this
        // message, as any notes or events discovered will fail to be validated. So we leave the message in the inbox,
        // awaiting for future syncs to detect that the TX became available.
        //
        // 3. The TX that emitted this message had been included in a block known to PXE, but as result of a reorg,
        // we no longer see it. From the point of view of this handler we're essentially in the same scenario: we need
        // to keep the message in the inbox awaiting for the TX to be available to PXE (or eventually expire).
        //
        // 4. The message is not associated to a TX to begin with. The current version of offchain message processing
        // does not support this case, but in the future it will. Right now, a message without an associated TX will
        // sit in the inbox unprocessed forever (!).
        //
        // 5. The TX that emitted this message has been found by PXE. We have a proper MessageContext, and the message
        // is now processable. We add the message to the `ready_to_process` CapsuleArray and the sync_state loop will
        // process it.

        // Scenario 1: emitting TX expired. After max TTL it is safe to remove the message from the inbox, as it is no
        // longer possible for the original TX that emitted it to be included in a block. We remove the message from
        // the inbox.
        if now > msg.received_at + OFFCHAIN_MESSAGE_TTL_SECONDS {
            inbox.remove(j);
            continue;
        }

        // Scenarios 2, 3: emitting TX not yet available. We keep the message in the inbox. As it might become
        // processable as new blocks get mined.
        // Scenario 4: no TX associated to message, means with this algorithm we will never clear it from the inbox.
        // TODO: decide on a better strategy for scenario 4.
        if maybe_ctx.is_none() {
            continue;
        }

        // Scenario 5: Message is ready to process, add ready_to_process
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
