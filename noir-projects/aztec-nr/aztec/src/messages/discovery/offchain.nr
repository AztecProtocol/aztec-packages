use crate::{
    capsules::CapsuleArray,
    context::UtilityContext,
    messages::{
        encoding::MESSAGE_CIPHERTEXT_LEN,
        processing::{MessageContext, MessageContextResponse, OffchainMessage, resolve_message_contexts},
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

/// Minimum time that a message is kept in the inbox before eviction: 24 hours. After 24 hours, the protocol guarantees
/// that the original TX that emitted the message can no longer be included in a block. This gives us a bounded time
/// window within which we need to keep messages around in case we need to reprocess them after reorgs.
global OFFCHAIN_MESSAGE_TTL_SECONDS: u64 = 24 * 3600;

/// An offchain message awaiting processing (or re-processing) in the inbox.
///
/// Messages remain in the inbox until they expire after [`OFFCHAIN_MESSAGE_TTL_SECONDS`], even if they have already
/// been processed. This is necessary to handle reorgs: a processed message may need to be re-processed if the
/// transaction that provided its context is reverted. On each sync, resolved messages are promoted to
/// [`OffchainMessage`] for processing.
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

/// Delivers an offchain message to the given contract's offchain inbox for subsequent processing.
///
/// Offchain messages are transaction effects that are not broadcasted via onchain logs. Instead, the sender shares the
/// message to the recipient through an external channel (e.g. a URL accessible by the recipient). The recipient then
/// calls this function to hand the message to the contract so it can be processed through the same mechanisms as
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
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    recipient: AztecAddress,
    tx_hash: Field,
) {
    CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT).push(
        PendingOffchainMsg { ciphertext, recipient, tx_hash, received_at: UtilityContext::new().timestamp() },
    );
}

/// Returns offchain-delivered messages to process during sync.
///
/// Messages remain in the inbox and are reprocessed on each sync until their originating transaction is no longer at
/// risk of being dropped by a reorg.
pub unconstrained fn default_handler(address: AztecAddress) -> CapsuleArray<OffchainMessage> {
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT);
    let requests: CapsuleArray<Field> = CapsuleArray::at(address, OFFCHAIN_CONTEXT_REQUESTS_SLOT);
    let ready: CapsuleArray<OffchainMessage> = CapsuleArray::at(address, OFFCHAIN_READY_MESSAGES_SLOT);

    // Clear any stale ready messages from a previous run.
    ready.for_each(|i, _| { ready.remove(i); });

    // Clear any stale requests from a previous run.
    requests.for_each(|i, _| { requests.remove(i); });

    // Build a request list aligned with the inbox indices.
    let mut i = 0;
    let inbox_len = inbox.len();
    while i < inbox_len {
        let msg = inbox.get(i);
        requests.push(msg.tx_hash);
        i += 1;
    }

    // Ask PXE to resolve contexts for all requested tx hashes.
    resolve_message_contexts(
        address,
        OFFCHAIN_CONTEXT_REQUESTS_SLOT,
        OFFCHAIN_CONTEXT_RESPONSES_SLOT,
    );

    let responses: CapsuleArray<Option<MessageContextResponse>> =
        CapsuleArray::at(address, OFFCHAIN_CONTEXT_RESPONSES_SLOT);
    assert_eq(responses.len(), inbox_len);

    let now = UtilityContext::new().timestamp();

    let mut j = inbox_len;
    while j > 0 {
        j -= 1;
        let maybe_ctx = responses.get(j);
        // Clear response entry as we go so the array is empty for the next run.
        responses.remove(j);

        let msg = inbox.get(j);
        if now > msg.received_at + OFFCHAIN_MESSAGE_TTL_SECONDS {
            inbox.remove(j);
            continue;
        }
        if maybe_ctx.is_none() {
            // Tx not yet available; keep the message in the inbox.
            continue;
        }

        let ctx = maybe_ctx.unwrap();
        let message_context = MessageContext {
            tx_hash: ctx.tx_hash,
            unique_note_hashes_in_tx: ctx.unique_note_hashes_in_tx,
            first_nullifier_in_tx: ctx.first_nullifier_in_tx,
            recipient: msg.recipient,
        };

        ready.push(OffchainMessage { message_ciphertext: msg.ciphertext, message_context });
    }

    ready
}
