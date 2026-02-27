use crate::{
    capsules::CapsuleArray,
    context::UtilityContext,
    messages::{
        encoding::MESSAGE_CIPHERTEXT_LEN,
        processing::{MessageContext, MessageContextResponse, OffchainMessage, resolve_message_contexts},
    },
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}},
};

pub global OFFCHAIN_INBOX_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_INBOX_SLOT".as_bytes());
pub global OFFCHAIN_CONTEXT_REQUESTS_SLOT: Field =
    sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_REQUESTS_SLOT".as_bytes());
pub global OFFCHAIN_CONTEXT_RESPONSES_SLOT: Field =
    sha256_to_field("AZTEC_NR::OFFCHAIN_CONTEXT_RESPONSES_SLOT".as_bytes());
pub global OFFCHAIN_READY_MESSAGES_SLOT: Field = sha256_to_field("AZTEC_NR::OFFCHAIN_READY_MESSAGES_SLOT".as_bytes());
pub global OFFCHAIN_MESSAGE_TTL_SECONDS: u64 = 86400;

#[derive(Serialize, Deserialize)]
pub struct PendingOffchainMsg {
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    pub recipient: AztecAddress,
    // Use 0 as a sentinel for tx-less messages.
    pub tx_hash: Field,
    pub enqueued_ts: u64,
}

/// Receive an offchain-delivered message into the contract-owned inbox.
pub unconstrained fn receive(
    contract_address: AztecAddress,
    ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    recipient: AztecAddress,
    tx_hash: Field,
) {
    CapsuleArray::at(contract_address, OFFCHAIN_INBOX_SLOT).push(
        PendingOffchainMsg { ciphertext, recipient, tx_hash, enqueued_ts: UtilityContext::new().timestamp() },
    );
}

/// Returns offchain-delivered messages to process during sync.
///
/// Messages remain in the inbox and are reprocessed on each sync until they expire.
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
        if now > msg.enqueued_ts + OFFCHAIN_MESSAGE_TTL_SECONDS {
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
