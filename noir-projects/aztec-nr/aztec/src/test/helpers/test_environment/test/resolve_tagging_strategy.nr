use crate::{
    messages::delivery::{OnchainDeliveryMode, ResolvedTaggingStrategy},
    oracle::resolve_tagging_strategy::resolve_tagging_strategy,
    protocol::{address::AztecAddress, hash::poseidon2_hash, point::EmbeddedCurvePoint, traits::{FromField, ToField}},
    test::helpers::{
        tagging_secret_strategy::TaggingSecretStrategy,
        test_environment::{TestEnvironment, TestEnvironmentOptions},
    },
};

#[test]
unconstrained fn defaults_an_unconstrained_self_send_to_the_address_derived_shared_secret() {
    let mut env = TestEnvironment::new();
    let app = env.create_contract_account();
    let sender = env.create_light_account();
    // The recipient is one of the environment's own accounts, so this is a self-send.
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // An unconstrained self-send resolves to an address-derived secret rather than a non-interactive handshake.
        assert(resolved.is_unconstrained_secret());
    });
}

#[test]
unconstrained fn defaults_an_unconstrained_external_send_to_a_non_interactive_handshake() {
    let mut env = TestEnvironment::new();
    let app = env.create_contract_account();
    let sender = env.create_light_account();
    // A valid address point the environment does not control (never created as an account), i.e. an external recipient.
    let recipient = AztecAddress::from_field(8);

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // An unconstrained send to an external recipient defaults to a non-interactive handshake, since no
        // address-derived secret would be discoverable by a recipient that has not registered the sender.
        assert_eq(resolved, ResolvedTaggingStrategy::non_interactive_handshake());
    });
}

#[test]
unconstrained fn defaults_constrained_delivery_to_a_non_interactive_handshake() {
    let mut env = TestEnvironment::new();
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );

        assert_eq(resolved, ResolvedTaggingStrategy::non_interactive_handshake());
    });
}

#[test]
unconstrained fn constrained_delivery_succeeds_with_a_configured_strategy() {
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tagging_secret_strategy(
        TaggingSecretStrategy::non_interactive_handshake(),
    ));
    // The hook path looks up the executing contract's class ID, so run in a deployed contract's context.
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );
        assert_eq(resolved, ResolvedTaggingStrategy::non_interactive_handshake());
    });
}

#[test]
unconstrained fn applies_the_strategy_set_in_the_options() {
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tagging_secret_strategy(
        TaggingSecretStrategy::arbitrary_secret(EmbeddedCurvePoint { x: 7, y: 11 }),
    ));
    // The hook path looks up the executing contract's class ID, so run in a deployed contract's context.
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert(resolved.is_unconstrained_secret());
    });
}

#[test]
unconstrained fn app_silos_an_arbitrary_secret_point() {
    let point = EmbeddedCurvePoint { x: 7, y: 11 };
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tagging_secret_strategy(
        TaggingSecretStrategy::arbitrary_secret(point),
    ));
    // The hook path looks up the executing contract's class ID, so run in a deployed contract's context.
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // PXE app-silos the raw point before handing it over: poseidon2 over the point and the executing contract,
        // then over the recipient for direction. This mirrors `AppTaggingSecret::compute` on the PXE side.
        let app_secret = poseidon2_hash([point.x, point.y, app.to_field()]);
        let expected_secret = poseidon2_hash([app_secret, recipient.to_field()]);
        assert_eq(resolved, ResolvedTaggingStrategy::unconstrained_secret(expected_secret));
    });
}
