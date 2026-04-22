use crate::oracle::notes::get_sender_for_tags;
use crate::protocol::{address::AztecAddress, traits::FromField};

/// Selects the sender identity used when deriving a discovery tag for a private log.
///
/// Discovery tags are derived from a shared secret between a sender and a recipient, so every log must pick a
/// sender address. This struct is passed to
/// [`MessageDelivery`](crate::messages::message_delivery::MessageDelivery) constructors.
pub struct SenderForTags {
    variant: u8,
    explicit_sender: AztecAddress,
}

global VARIANT_EXPLICIT: u8 = 0;
global VARIANT_TX_DEFAULT: u8 = 1;

impl SenderForTags {
    /// Uses `sender` for the discovery tag. E.g. account contracts tag notes with their own address.
    pub fn explicit(sender: AztecAddress) -> Self {
        Self { variant: VARIANT_EXPLICIT, explicit_sender: sender }
    }

    /// Uses the default sender selected by the wallet for this transaction (typically the account that sent
    /// the tx). The right choice for most application contracts.
    pub fn tx_default() -> Self {
        Self { variant: VARIANT_TX_DEFAULT, explicit_sender: AztecAddress::from_field(0) }
    }

    /// Resolves the sender identity to use for a discovery tag.
    pub(crate) unconstrained fn resolve(self) -> AztecAddress {
        if self.variant == VARIANT_EXPLICIT {
            self.explicit_sender
        } else {
            get_sender_for_tags().expect(
                f"`SenderForTags::tx_default` was used but the wallet did not supply a sender when building the transaction. Either pass `sendMessagesAs` in the wallet options or pick an explicit sender at the emission site.",
            )
        }
    }
}

mod test {
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use super::SenderForTags;
    use std::test::OracleMock;

    #[test(should_fail_with = "`SenderForTags::tx_default` was used but the wallet did not supply a sender")]
    unconstrained fn tx_default_with_no_wallet_default_panics() {
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());
        let _ = SenderForTags::tx_default().resolve();
    }

    #[test]
    unconstrained fn tx_default_uses_wallet_supplied_sender() {
        let sender = AztecAddress::from_field(1);
        assert_eq(
            unsafe {
                let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
                SenderForTags::tx_default().resolve()
            },
            sender,
        );
    }

    #[test]
    unconstrained fn explicit_uses_provided_sender() {
        let sender = AztecAddress::from_field(7);
        assert_eq(SenderForTags::explicit(sender).resolve(), sender);
    }
}
