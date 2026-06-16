//! Thin wrappers around constrained delivery for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        macros::{events::event, functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        oracle::notes::get_next_tagging_index,
        protocol::{
            address::AztecAddress,
            constants::DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
            hash::{compute_log_tag, poseidon2_hash},
        },
        state_vars::{Owned, PrivateSet},
    };
    use balance_set::BalanceSet;
    use field_note::FieldNote;

    #[event]
    struct DeliveryEvent {
        value: Field,
    }

    #[storage]
    struct Storage<Context> {
        notes: Owned<PrivateSet<FieldNote, Context>, Context>,
        balances: Owned<BalanceSet<Context>, Context>,
    }

    #[external("private")]
    fn next_index_for_secret(secret: Field) -> u32 {
        // Safety: test-only observation of the index the PXE hands out next for this secret.
        unsafe {
            get_next_tagging_index(secret, MessageDelivery::onchain_constrained())
        }
    }

    #[external("private")]
    fn emit_note(sender: AztecAddress, recipient: AztecAddress) {
        self.storage.notes.at(recipient).insert(FieldNote { value: 1 }).deliver(MessageDelivery::onchain_constrained()
            .with_sender(sender));
    }

    /// Like `emit_note`, but omits `.with_sender(...)` so the sender falls back to the wallet-provided default tag
    /// sender (`get_sender_for_tags()`). Lets tests exercise the implicit-default and TS `sendMessagesAs` paths.
    #[external("private")]
    fn emit_note_default_sender(recipient: AztecAddress) {
        self.storage.notes.at(recipient).insert(FieldNote { value: 1 }).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn emit_maybe_note(sender: AztecAddress, recipient: AztecAddress) {
        self.storage.balances.at(recipient).add(1).deliver_to(
            recipient,
            MessageDelivery::onchain_constrained().with_sender(sender),
        );
    }

    #[external("private")]
    fn emit_event(sender: AztecAddress, recipient: AztecAddress) {
        self.emit(DeliveryEvent { value: 1 }).deliver_to(
            recipient,
            MessageDelivery::onchain_constrained().with_sender(sender),
        );
    }

    #[external("private")]
    fn emit_two_events(sender: AztecAddress, recipient: AztecAddress) {
        self.emit(DeliveryEvent { value: 1 }).deliver_to(
            recipient,
            MessageDelivery::onchain_constrained().with_sender(sender),
        );
        self.emit(DeliveryEvent { value: 2 }).deliver_to(
            recipient,
            MessageDelivery::onchain_constrained().with_sender(sender),
        );
    }

    /// Test-only: emits a log under the constrained tag for `(secret, index)` WITHOUT the chain nullifier. A landed
    /// constrained-tagged log advances the PXE's per-secret index, so this lets tests reach the `index > 0` branch;
    /// deliberately skipping the nullifier drives the negative test.
    #[external("private")]
    fn emit_constrained_log_without_nullifier(secret: Field, index: u32) {
        let log_tag = compute_log_tag(
            poseidon2_hash([secret, index as Field]),
            DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
        );
        self.context.emit_private_log_unsafe(log_tag, BoundedVec::from_array([secret]));
    }
}
