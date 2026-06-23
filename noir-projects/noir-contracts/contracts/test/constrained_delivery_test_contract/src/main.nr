//! Thin wrappers around constrained delivery for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        macros::{events::event, functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        note::note_viewer_options::NoteViewerOptions,
        oracle::notes::get_next_tagging_index,
        protocol::{
            address::AztecAddress,
            constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__CONSTRAINED_MSG_NULLIFIER},
            hash::{compute_log_tag, poseidon2_hash, poseidon2_hash_with_separator},
            traits::ToField,
        },
        standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
        state_vars::{Owned, PrivateSet},
    };
    use balance_set::BalanceSet;
    use field_note::FieldNote;
    use handshake_registry_contract::HandshakeRegistry;

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
    fn emit_note(recipient: AztecAddress, value: Field) {
        self.storage.notes.at(recipient).insert(FieldNote { value }).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn emit_maybe_note(recipient: AztecAddress) {
        self.storage.balances.at(recipient).add(1).deliver_to(recipient, MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn emit_event(recipient: AztecAddress, value: Field) {
        self.emit(DeliveryEvent { value }).deliver_to(recipient, MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn emit_two_events(recipient: AztecAddress) {
        self.emit(DeliveryEvent { value: 1 }).deliver_to(recipient, MessageDelivery::onchain_constrained());
        self.emit(DeliveryEvent { value: 2 }).deliver_to(recipient, MessageDelivery::onchain_constrained());
    }

    /// Test reads go through this wrapper so the registry sees this contract as
    /// [HandshakeRegistry::get_app_siloed_secret]'s msg_sender.
    #[external("utility")]
    unconstrained fn get_app_siloed_secret(sender: AztecAddress, recipient: AztecAddress) -> Option<Field> {
        let registry = HandshakeRegistry::at(STANDARD_HANDSHAKE_REGISTRY_ADDRESS);
        self.call(registry.get_app_siloed_secret(sender, recipient))
    }

    /// Returns the values of all `FieldNote`s discovered for `owner`. The e2e test derives both the count and the
    /// sum from this, confirming each delivered note was discovered and decrypted.
    #[external("utility")]
    unconstrained fn get_note_values(owner: AztecAddress) -> BoundedVec<Field, 10> {
        self.storage.notes.at(owner).view_notes(NoteViewerOptions::new()).map(|note| note.value)
    }

    /// Test-only: emits a log under the constrained tag for `(secret, index)` WITHOUT the sequence nullifier. A landed
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

    /// Test-only: models a malicious party that knows only the shared secret emitting the constrained sequence
    /// nullifier for `(sender, recipient, secret, index)`. This is exactly the value a recipient can compute, since
    /// the shared secret is recoverable from the handshake's public ephemeral key. If the sequence nullifier is
    /// bound to a sender-only secret the sender's real nullifier prevents griefing the sequence.
    #[external("private")]
    fn grief_emit_constrained_nullifier(sender: AztecAddress, recipient: AztecAddress, secret: Field, index: u32) {
        let nullifier = poseidon2_hash_with_separator(
            [sender.to_field(), recipient.to_field(), secret, index as Field],
            DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
        );
        self.context.push_nullifier_unsafe(nullifier);
    }
}
