use crate::messages::delivery::{DeliveryPrivacyPreference, OnchainDeliveryMode};
use crate::protocol::address::AztecAddress;

/// Returns the wallet's [`DeliveryPrivacyPreference`] for a message sent from `sender` to `recipient` with the given
/// delivery `mode`.
pub(crate) unconstrained fn get_delivery_privacy_preference(
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> DeliveryPrivacyPreference {
    get_delivery_privacy_preference_oracle(sender, recipient, mode)
}

#[oracle(aztec_prv_getDeliveryPrivacyPreference)]
unconstrained fn get_delivery_privacy_preference_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
    _mode: OnchainDeliveryMode,
) -> DeliveryPrivacyPreference {}

mod test {
    use crate::messages::delivery::{DeliveryPrivacyPreference, OnchainDeliveryMode};
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::get_delivery_privacy_preference;

    #[test]
    unconstrained fn defaults_to_max_privacy() {
        let env = TestEnvironment::new();

        env.private_context(|_| {
            let preference = get_delivery_privacy_preference(
                AztecAddress::from_field(1),
                AztecAddress::from_field(2),
                OnchainDeliveryMode::onchain_unconstrained(),
            );
            assert_eq(preference, DeliveryPrivacyPreference::max_privacy());
        });
    }

    #[test]
    unconstrained fn returns_the_preference_set_in_the_test_environment() {
        let env = TestEnvironment::new();
        env.set_delivery_privacy_preference(DeliveryPrivacyPreference::best_effort());

        env.private_context(|_| {
            let preference = get_delivery_privacy_preference(
                AztecAddress::from_field(1),
                AztecAddress::from_field(2),
                OnchainDeliveryMode::onchain_constrained(),
            );
            assert_eq(preference, DeliveryPrivacyPreference::best_effort());
        });
    }
}
