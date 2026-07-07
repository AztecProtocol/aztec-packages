use crate::{
    messages::delivery::{OnchainDeliveryMode, ResolvedTaggingStrategy},
    oracle::resolve_tagging_strategy::resolve_tagging_strategy,
    protocol::{address::AztecAddress, point::EmbeddedCurvePoint, traits::FromField},
    test::helpers::{
        tagging_secret_strategy::{compute_directional_app_secret, TaggingSecretStrategy},
        test_environment::{TestEnvironment, TestEnvironmentOptions},
    },
};

#[test]
unconstrained fn an_unset_constrained_mode_falls_back_to_the_default_strategy() {
    // Only the unconstrained mode is configured: the constrained mode falls back to the default non-interactive
    // handshake strategy.
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_unconstrained(),
        TaggingSecretStrategy::arbitrary_secret(EmbeddedCurvePoint { x: 7, y: 11 }),
    ));
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
unconstrained fn an_unset_unconstrained_mode_falls_back_to_the_default_strategy() {
    // Only the constrained mode is configured: the unconstrained mode falls back to the default non-interactive
    // handshake strategy for an external recipient.
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_constrained(),
        TaggingSecretStrategy::interactive_handshake(),
    ));
    let app = env.create_contract_account();
    let sender = env.create_light_account();
    let recipient = AztecAddress::from_field(8);

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, ResolvedTaggingStrategy::non_interactive_handshake());
    });
}

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
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy_all_modes(
        TaggingSecretStrategy::non_interactive_handshake(),
    ));
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
unconstrained fn constrained_delivery_succeeds_with_a_configured_interactive_handshake() {
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_constrained(),
        TaggingSecretStrategy::interactive_handshake(),
    ));
    let app = env.create_contract_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );
        assert_eq(resolved, ResolvedTaggingStrategy::interactive_handshake());
    });
}

#[test]
unconstrained fn constrained_mode_arbitrary_secret_resolves_without_rejecting() {
    // Mirrors PXE hooks: strategies are resolved without delivery-mode validation. Runtime rejection is covered by
    // `tag_secret_source::test::unconstrained_secret_cannot_back_constrained_delivery` and
    // `tag::test::constrained_delivery_rejects_a_resolved_unconstrained_secret`.
    let point = EmbeddedCurvePoint { x: 7, y: 11 };
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_constrained(),
        TaggingSecretStrategy::arbitrary_secret(point),
    ));
    let app = env.create_contract_account();
    let recipient = AztecAddress::from_field(8);

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_constrained(),
        );

        let expected_secret = compute_directional_app_secret(point, app, recipient);
        assert_eq(resolved, ResolvedTaggingStrategy::unconstrained_secret(expected_secret));
    });
}

#[test]
unconstrained fn applies_the_strategy_set_in_the_options() {
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_unconstrained(),
        TaggingSecretStrategy::arbitrary_secret(EmbeddedCurvePoint { x: 7, y: 11 }),
    ));
    let app = env.create_contract_account();
    let recipient = AztecAddress::from_field(8);

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
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_unconstrained(),
        TaggingSecretStrategy::arbitrary_secret(point),
    ));
    let app = env.create_contract_account();
    let recipient = AztecAddress::from_field(8);

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        let expected_secret = compute_directional_app_secret(point, app, recipient);
        assert_eq(resolved, ResolvedTaggingStrategy::unconstrained_secret(expected_secret));
    });
}

#[test]
unconstrained fn overrides_a_configured_arbitrary_secret_for_an_unconstrained_self_send() {
    let point = EmbeddedCurvePoint { x: 7, y: 11 };
    let mut env = TestEnvironment::new_opts(TestEnvironmentOptions::new().with_tag_secret_strategy(
        OnchainDeliveryMode::onchain_unconstrained(),
        TaggingSecretStrategy::arbitrary_secret(point),
    ));
    let app = env.create_contract_account();
    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    env.private_context_at(app, |_| {
        let resolved = resolve_tagging_strategy(
            sender,
            recipient,
            OnchainDeliveryMode::onchain_unconstrained(),
        );

        // A self-send forces an address-derived secret even with an arbitrary secret configured. The resolved
        // secret is unconstrained, but not the app-siloed arbitrary point the configured secret would have produced.
        let arbitrary_secret = compute_directional_app_secret(point, app, recipient);
        assert(resolved.is_unconstrained_secret());
        assert(resolved != ResolvedTaggingStrategy::unconstrained_secret(arbitrary_secret));
    });
}
