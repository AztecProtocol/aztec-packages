use aztec::macros::aztec;

#[aztec]
contract OffchainPayment {
    use aztec::{
        capsules::CapsuleArray,
        context::UtilityContext,
        macros::{functions::external, storage::storage},
        messages::{
            discovery::{CustomMessageHandler, process_message::process_message_ciphertext},
            encoding::MESSAGE_CIPHERTEXT_LEN,
            message_delivery::MessageDelivery,
            processing::{MessageContext, validate_and_store_enqueued_notes_and_events},
        },
        protocol::{
            address::AztecAddress,
            constants::MAX_NOTE_HASHES_PER_TX,
            hash::sha256_to_field,
            traits::{Deserialize, Serialize},
        },
        state_vars::Owned,
    };

    use balance_set::BalanceSet;

    pub global OFFCHAIN_INBOX_SLOT: Field =
        sha256_to_field("OFFCHAIN_PAYMENT::OFFCHAIN_INBOX_SLOT".as_bytes());

    #[derive(Serialize, Deserialize)]
    pub struct PendingOffchainMsg {
        pub ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
        pub recipient: AztecAddress,
        // Use 0 as a sentinel for tx-less messages.
        pub tx_hash: Field,
        pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
        pub first_nullifier_in_tx: Field,
    }

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
        unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
        first_nullifier_in_tx: Field,
    ) {
        let addr = UtilityContext::new().this_address();
        CapsuleArray::at(addr, OFFCHAIN_INBOX_SLOT).push(
            PendingOffchainMsg {
                ciphertext,
                recipient,
                tx_hash,
                unique_note_hashes_in_tx,
                first_nullifier_in_tx,
            },
        );
    }

    // Naive inbox sync: processes all pending messages using the stored tx context.
    #[external("utility")]
    unconstrained fn offchain_sync_inbox() {
        let addr = UtilityContext::new().this_address();
        let inbox = CapsuleArray::at(addr, OFFCHAIN_INBOX_SLOT);

        inbox.for_each(|i, msg: PendingOffchainMsg| {
            let message_context = MessageContext {
                tx_hash: msg.tx_hash,
                unique_note_hashes_in_tx: msg.unique_note_hashes_in_tx,
                first_nullifier_in_tx: msg.first_nullifier_in_tx,
                recipient: msg.recipient,
            };

            process_message_ciphertext(
                addr,
                _compute_note_hash_and_nullifier,
                Option::<CustomMessageHandler<()>>::none(),
                msg.ciphertext,
                message_context,
            );

            validate_and_store_enqueued_notes_and_events(addr);
            inbox.remove(i);
        });
    }
}
