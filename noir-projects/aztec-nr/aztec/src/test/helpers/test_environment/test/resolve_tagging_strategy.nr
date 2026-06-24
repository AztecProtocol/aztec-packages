use crate::{
    messages::delivery::{OnchainDeliveryMode, ResolvedTaggingStrategy},
    oracle::{notes::get_app_tagging_secret, resolve_tagging_strategy::resolve_tagging_strategy},
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::{
        tagging_secret_strategy::TaggingSecretStrategy,
        test_environment::{TestEnvironment, TestEnvironmentOptions},
    },
};

#[test]
unconstrained fn defaults_unconstrained_delivery_to_the_address_derived_shared_secret() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    env.private_context(|_| {
        let resolved = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // With no strategy configured, the default derives the address-based (Diffie-Hellman) shared secret.
        let expected_secret = get_app_tagging_secret(sender, recipient).unwrap();
        assert_eq(resolved, ResolvedTaggingStrategy::unconstrained_secret(expected_secret));
    });
}

#[test(should_fail_with = "requires a configured resolveTaggingSecretStrategy hook")]
unconstrained fn constrained_delivery_fails_without_a_configured_strategy() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    env.private_context(|_| {
        let _ = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );
    });
}

#[test]
unconstrained fn applies_the_strategy_set_in_the_options() {
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tagging_secret_strategy(
        TaggingSecretStrategy::non_interactive_handshake(),
    ));
    // The hook path looks up the executing contract's class ID, so run in a deployed contract's context. A handshake
    // strategy differs from the unconstrained default (an address-derived secret), proving the wallet was consulted.
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, ResolvedTaggingStrategy::non_interactive_handshake());
    });
}
