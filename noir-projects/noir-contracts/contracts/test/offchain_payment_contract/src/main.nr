use aztec::{
    capsules::CapsuleArray,
    messages::{
        encoding::MESSAGE_CIPHERTEXT_LEN,
        processing::{
            MessageContext, MessageContextResponse, OffchainMessage, resolve_message_contexts,
        },
    },
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::{Deserialize, Serialize}},
};

pub global OFFCHAIN_INBOX_SLOT: Field =
    sha256_to_field("OFFCHAIN_PAYMENT::OFFCHAIN_INBOX_SLOT".as_bytes());
pub global OFFCHAIN_CONTEXT_REQUESTS_SLOT: Field = sha256_to_field(
    "OFFCHAIN_PAYMENT::OFFCHAIN_CONTEXT_REQUESTS_SLOT".as_bytes(),
);
pub global OFFCHAIN_CONTEXT_RESPONSES_SLOT: Field = sha256_to_field(
    "OFFCHAIN_PAYMENT::OFFCHAIN_CONTEXT_RESPONSES_SLOT".as_bytes(),
);
pub global OFFCHAIN_READY_MESSAGES_SLOT: Field =
    sha256_to_field("OFFCHAIN_PAYMENT::OFFCHAIN_READY_MESSAGES_SLOT".as_bytes());

#[derive(Serialize, Deserialize)]
pub struct PendingOffchainMsg {
    pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    pub recipient: AztecAddress,
    // Use 0 as a sentinel for tx-less messages.
    pub tx_hash: Field,
}

unconstrained fn offchain_sync_inbox(address: AztecAddress) -> CapsuleArray<OffchainMessage> {
    let inbox: CapsuleArray<PendingOffchainMsg> = CapsuleArray::at(address, OFFCHAIN_INBOX_SLOT);
    let requests: CapsuleArray<Field> = CapsuleArray::at(address, OFFCHAIN_CONTEXT_REQUESTS_SLOT);
    let ready: CapsuleArray<OffchainMessage> =
        CapsuleArray::at(address, OFFCHAIN_READY_MESSAGES_SLOT);

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

    let mut j = inbox_len;
    while j > 0 {
        j -= 1;
        let maybe_ctx = responses.get(j);
        // Clear response entry as we go so the array is empty for the next run.
        responses.remove(j);

        let msg = inbox.get(j);
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
        inbox.remove(j);
    }

    ready
}

use aztec::macros::aztec;

#[aztec(::aztec::macros::AztecConfig::new().discover_offchain_messages(crate::offchain_sync_inbox))]
contract OffchainPayment {
    use aztec::{
        capsules::CapsuleArray,
        context::UtilityContext,
        macros::{functions::external, storage::storage},
        messages::{encoding::MESSAGE_CIPHERTEXT_LEN, message_delivery::MessageDelivery},
        protocol::address::AztecAddress,
        state_vars::Owned,
    };

    use crate::{OFFCHAIN_INBOX_SLOT, PendingOffchainMsg};
    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
    }

    #[external("private")]
    fn mint(amount: u128, recipient: AztecAddress) {
        // Minted notes are delivered onchain to ensure the recipient can always discover them.
        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    #[external("private")]
    fn transfer_offchain(amount: u128, recipient: AztecAddress) {
        let sender = self.msg_sender();

        // Sender change note and recipient note are both delivered offchain.
        self.storage.balances.at(sender).sub(amount).deliver(MessageDelivery.OFFCHAIN);

        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery.OFFCHAIN);
    }

    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> u128 {
        self.storage.balances.at(owner).balance_of()
    }

    // Enqueue an offchain-delivered message into the contract-owned inbox.
    #[external("utility")]
    unconstrained fn offchain_enqueue(
        ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
        tx_hash: Field,
    ) {
        let addr = UtilityContext::new().this_address();
        CapsuleArray::at(addr, OFFCHAIN_INBOX_SLOT).push(
            PendingOffchainMsg { ciphertext, recipient, tx_hash },
        );
    }
}
