//! Thin wrappers around the constrained-delivery helpers for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        macros::functions::external,
        messages::delivery::{
            constrained_delivery::{calculate_secret_and_index, compute_constrained_msg_nullifier},
            MessageDelivery,
        },
        oracle::notes::get_next_tagging_index,
        protocol::{
            address::AztecAddress,
            constants::DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
            hash::{compute_log_tag, poseidon2_hash},
        },
    };

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
        let second_index = unsafe { get_next_tagging_index(secret, MessageDelivery::onchain_constrained()) };
        (secret, first_index, second_index)
    }

    /// Emits the chain nullifier for `(sender, recipient, secret)` at `index`.
    ///
    /// Stands in for the forthcoming emit helper's nullifier emission so tests can advance the nullifier chain
    /// without performing a constrained send.
    #[external("private")]
    fn emit_chain_nullifier(sender: AztecAddress, recipient: AztecAddress, secret: Field, index: u32) {
        self.context.push_nullifier_unsafe(compute_constrained_msg_nullifier(sender, recipient, secret, index));
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
