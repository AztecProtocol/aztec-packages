//! Thin wrappers around the constrained-delivery helpers for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        event::event_emission::emit_event_in_private,
        macros::{events::event, functions::external, storage::storage},
        messages::delivery::constrained_delivery::{calculate_secret_and_index, compute_constrained_log_tag},
        oracle::notes::get_next_constrained_tagging_index,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateSet},
    };
    use balance_set::BalanceSet;
    use field_note::FieldNote;

    #[event]
    struct ExampleEvent {
        value: Field,
    }

    #[storage]
    struct Storage<Context> {
        notes: Owned<PrivateSet<FieldNote, Context>, Context>,
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /// Calls the helper and returns the resolved `(app_siloed_secret, index)` tuple.
    #[external("private")]
    fn calculate_and_return(registry: AztecAddress, sender: AztecAddress, recipient: AztecAddress) -> (Field, u32) {
        calculate_secret_and_index(self.context, registry, sender, recipient)
    }

    /// Resolves a secret via the helper, then asks the PXE for the next index of that same secret.
    ///
    /// Models a sender emitting a second constrained message under a freshly resolved handshake within one tx.
    /// The returned `(secret, first_index, second_index)` lets a test assert that the second index advances past
    /// the first rather than resetting, which would collide on `(secret, first_index)`.
    #[external("private")]
    fn resolve_then_next_index(
        registry: AztecAddress,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> (Field, u32, u32) {
        let (secret, first_index) = calculate_secret_and_index(self.context, registry, sender, recipient);
        // Safety: test-only observation of the index the PXE hands out next for this secret.
        let second_index = unsafe { get_next_constrained_tagging_index(secret) };
        (secret, first_index, second_index)
    }

    /// Delivers a constrained note message to `recipient` through the high-level note API.
    #[external("private")]
    fn emit(registry: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
        self.storage.notes.at(recipient).insert(FieldNote { value: 1 }).deliver_constrained(registry, sender);
    }

    /// Delivers a constrained maybe-note message through the high-level maybe-note API.
    #[external("private")]
    fn emit_maybe_note(registry: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
        self.storage.balances.at(recipient).add(1).deliver_to_constrained(registry, sender, recipient);
    }

    /// Delivers a constrained event message through the high-level event API.
    #[external("private")]
    fn emit_event(registry: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
        emit_event_in_private(self.context, ExampleEvent { value: 1 }).deliver_to_constrained(
            registry,
            sender,
            recipient,
        );
    }

    /// Test-only: emits a log under the constrained tag for `(secret, index)` WITHOUT the chain nullifier. This
    /// advances the PXE's per-secret index (the recipient discovers the log by tag) while deliberately leaving the
    /// nullifier chain broken, which drives the negative `index > 0` test.
    #[external("private")]
    fn emit_constrained_log_without_nullifier(secret: Field, index: u32) {
        let log_tag = compute_constrained_log_tag(secret, index);
        self.context.emit_private_log_unsafe(log_tag, BoundedVec::from_array([secret]));
    }
}
