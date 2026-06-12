use crate::protocol::{traits::{Deserialize, Serialize}, utils::reader::Reader};

/// A wallet-owned policy that selects the tag-secret derivation used by message delivery when the contract does not
/// pin one.
///
/// Max privacy never leaks information and instead relies on sender-recipient coordination for delivery. Best effort
/// accepts a privacy leak so that delivery requires no sender-recipient coordination at all.
///
/// ## Who configures what
///
/// Each party involved in message delivery owns a different knob:
///
/// - **Contracts** choose a delivery mode and can optionally pin a tag-secret derivation via the `via_*` methods on
///   the [`MessageDelivery`](crate::messages::delivery::MessageDelivery) builders (see
///   [`OnchainUnconstrainedDelivery`](crate::messages::delivery::OnchainUnconstrainedDelivery) and
///   [`OnchainConstrainedDelivery`](crate::messages::delivery::OnchainConstrainedDelivery)). When they pin nothing,
///   the decision is delegated to the wallet, which is the recommended default.
/// - **Wallets** answer that delegation with this preference, reported through the
///   [`get_delivery_privacy_preference`](crate::oracle::delivery_privacy_preference::get_delivery_privacy_preference)
///   oracle.
///
/// ## Privacy
///
/// The two variants trade off as follows:
///
/// - [`max_privacy`](Self::max_privacy): nothing that could link sender and recipient is published, and delivery
///   relies on sender-recipient coordination. Unconstrained delivery uses the address-pair (ECDH) secret, which is
///   derived locally and leaves no on-chain trace, but the recipient only finds the message if they registered the
///   sender. Constrained delivery requires an interactive handshake with the recipient, and fails when none exists.
/// - [`best_effort`](Self::best_effort): tags are derived from a non-interactive handshake, reusing an existing one
///   or establishing it on the fly, letting the recipient discover the message without any prior sender-recipient
///   coordination. Establishing it publishes an on-chain handshake that reveals information about the recipient.
#[derive(Eq, Serialize)]
pub struct DeliveryPrivacyPreference {
    inner: u8,
}

impl DeliveryPrivacyPreference {
    /// Never leak information to obtain a tagging secret.
    ///
    /// Delivery relies on sender-recipient coordination instead: unconstrained messages are only found by recipients
    /// who registered the sender, and constrained delivery requires an interactive handshake.
    pub fn max_privacy() -> Self {
        Self { inner: 1 }
    }

    /// Accept a privacy leak to deliver without sender-recipient coordination.
    ///
    /// Tags are derived from a non-interactive handshake, reused when one exists and otherwise established on the
    /// fly. The handshake is published on-chain and reveals information about the recipient. In exchange, the
    /// recipient discovers the message without coordinating with the sender in advance.
    pub fn best_effort() -> Self {
        Self { inner: 2 }
    }

    /// Validates a raw discriminant, as deserialization must always reject unknown values.
    fn from_u8(inner: u8) -> Self {
        let preference = Self { inner };
        assert(
            (preference == Self::max_privacy()) | (preference == Self::best_effort()),
            f"unrecognized delivery privacy preference: {inner}",
        );
        preference
    }
}

impl Deserialize for DeliveryPrivacyPreference {
    let N: u32 = <u8 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Deserialize>::deserialize(fields))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self::from_u8(reader.read() as u8)
    }
}

mod test {
    use crate::protocol::traits::{Deserialize, Serialize};
    use super::DeliveryPrivacyPreference;

    #[test]
    fn preference_roundtrips_through_serialization() {
        let max_privacy = DeliveryPrivacyPreference::max_privacy();
        let best_effort = DeliveryPrivacyPreference::best_effort();

        assert(DeliveryPrivacyPreference::deserialize(max_privacy.serialize()) == max_privacy);
        assert(DeliveryPrivacyPreference::deserialize(best_effort.serialize()) == best_effort);
    }

    #[test(should_fail_with = "unrecognized delivery privacy preference")]
    fn deserializing_invalid_preference_fails() {
        let _ = DeliveryPrivacyPreference::deserialize([99]);
    }
}
