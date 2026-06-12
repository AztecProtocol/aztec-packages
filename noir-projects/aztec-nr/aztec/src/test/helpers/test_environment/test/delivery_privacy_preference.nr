use crate::{
    messages::delivery::{DeliveryPrivacyPreference, OnchainDeliveryMode},
    oracle::delivery_privacy_preference::get_delivery_privacy_preference,
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::{TestEnvironment, TestEnvironmentOptions},
};

#[test]
unconstrained fn delivery_privacy_preference_defaults_to_max_privacy() {
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
unconstrained fn reports_the_delivery_privacy_preference_set_in_the_options() {
    let env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_delivery_privacy_preference(
        DeliveryPrivacyPreference::best_effort(),
    ));

    env.private_context(|_| {
        let preference = get_delivery_privacy_preference(
            AztecAddress::from_field(1),
            AztecAddress::from_field(2),
            OnchainDeliveryMode::onchain_constrained(),
        );
        assert_eq(preference, DeliveryPrivacyPreference::best_effort());
    });
}
