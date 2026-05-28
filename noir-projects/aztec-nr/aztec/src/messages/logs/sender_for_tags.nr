use crate::oracle::notes::get_sender_for_tags;
use crate::protocol::address::AztecAddress;

/// Selects the sender address for discovery tag derivation.
///
/// Discovery tags are derived from a shared secret between sender and recipient. This struct controls which address
/// is used as the sender in that derivation, allowing either an explicit address or the wallet-supplied default.
///
/// This value must be a compile-time constant so that the compiler can perform dead-code elimination.
pub struct SenderForTags {
    pub(crate) variant: u8,
    explicit_sender: AztecAddress,
}

impl Eq for SenderForTags {
    fn eq(self, other: Self) -> bool {
        (self.variant == other.variant) & (self.explicit_sender == other.explicit_sender)
    }
}

impl SenderForTags {
    /// Uses a specific address as the sender for tag derivation.
    ///
    /// This is typically used by account contracts that need to tag notes as coming from themselves, e.g. during
    /// constructor initialization where the wallet-supplied default might not be the contract's own address.
    pub fn explicit(sender: AztecAddress) -> Self {
        Self { variant: 1, explicit_sender: sender }
    }

    /// Uses the wallet-supplied default sender for tag derivation.
    ///
    /// This is the standard choice for application contracts. The wallet sets the default sender (typically the
    /// user's account address) when it prepares the transaction for simulation/proving.
    pub fn tx_default() -> Self {
        Self { variant: 2, explicit_sender: AztecAddress::zero() }
    }

    /// Resolves the sender address to use for tag computation.
    pub(crate) unconstrained fn resolve(self) -> AztecAddress {
        if self.variant == 1 {
            self.explicit_sender
        } else {
            get_sender_for_tags().expect(
                f"Sender for tags is not set when emitting a private log. Ensure the wallet provides a default sender.",
            )
        }
    }
}

mod test {
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use super::SenderForTags;
    use std::test::OracleMock;

    #[test(should_fail_with = "Sender for tags is not set")]
    unconstrained fn tx_default_panics_when_wallet_provides_no_sender() {
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());

        let sender_for_tags = SenderForTags::tx_default();
        let _ = sender_for_tags.resolve();
    }

    #[test]
    unconstrained fn tx_default_uses_wallet_supplied_sender() {
        let wallet_sender = AztecAddress::from_field(42);
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(wallet_sender));

        let sender_for_tags = SenderForTags::tx_default();
        assert_eq(sender_for_tags.resolve(), wallet_sender);
    }

    #[test]
    unconstrained fn explicit_uses_provided_sender() {
        let explicit_sender = AztecAddress::from_field(99);

        let sender_for_tags = SenderForTags::explicit(explicit_sender);
        assert_eq(sender_for_tags.resolve(), explicit_sender);
    }
}
