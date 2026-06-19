use crate::{
    messages::delivery::{OnchainDeliveryMode, TaggingSecretSource},
    oracle::{notes::get_app_tagging_secret, resolve_tagging_secret::resolve_tagging_secret},
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::{TestEnvironment, TestEnvironmentOptions},
};

#[test]
unconstrained fn defaults_unconstrained_delivery_to_the_address_derived_shared_secret() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    env.private_context(|_| {
        let resolved = resolve_tagging_secret(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // With no source configured, the default derives the address-based (Diffie-Hellman) shared secret.
        let expected_secret = get_app_tagging_secret(sender, recipient).unwrap();
        assert_eq(resolved, TaggingSecretSource::shared_secret(expected_secret));
    });
}

#[test(should_fail_with = "requires a configured resolveTaggingSecret hook")]
unconstrained fn constrained_delivery_fails_without_a_configured_source() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    env.private_context(|_| {
        let _ = resolve_tagging_secret(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );
    });
}

#[test]
unconstrained fn returns_the_shared_secret_source_set_in_the_options() {
    let source = TaggingSecretSource::shared_secret(42);
    let mut env = TestEnvironment::new_opts(
        TestEnvironmentOptions::new().with_tagging_secret_source(source),
    );
    // The hook path looks up the executing contract's class ID, so run in a deployed contract's context. The recipient
    // is valid, so resolution consults the wallet rather than falling back to a random source.
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_secret(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, source);
    });
}
