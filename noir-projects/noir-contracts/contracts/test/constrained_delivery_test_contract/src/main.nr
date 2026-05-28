//! Thin wrapper around the `calculate_secret_and_index` helper for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        macros::functions::external,
        messages::delivery::constrained_delivery::calculate_secret_and_index,
        oracle::notes::get_next_constrained_index,
        protocol::address::AztecAddress,
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
        let second_index = unsafe { get_next_constrained_index(secret) };
        (secret, first_index, second_index)
    }
}
