//! Thin wrapper around the `calculate_secret_and_index` helper for TXE tests.
use aztec::macros::aztec;

mod test;

#[aztec]
pub contract ConstrainedDeliveryTest {
    use aztec::{
        macros::functions::external, messages::delivery::constrained_delivery::calculate_secret_and_index,
        protocol::address::AztecAddress,
    };

    /// Calls the helper and returns the resolved `(app_siloed_secret, index)` tuple.
    #[external("private")]
    fn calculate_and_return(registry: AztecAddress, sender: AztecAddress, recipient: AztecAddress) -> (Field, u32) {
        calculate_secret_and_index(self.context, registry, sender, recipient)
    }
}
