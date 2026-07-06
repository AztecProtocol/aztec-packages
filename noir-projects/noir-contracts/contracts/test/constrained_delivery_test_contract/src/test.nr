//! Tests for constrained delivery through the public message-delivery API.
//!
//! These tests exercise the sender-side helper flow indirectly via constrained note/event delivery: resolve or
//! bootstrap the app-siloed handshake secret, reserve the next per-secret index, constrain that index, emit the
//! sequence nullifier, then emit the tagged private log. The malformed-log test lands a constrained tag without its
//! sequence nullifier so the next real delivery must reject the broken sequence.
use crate::ConstrainedDeliveryTest;

use aztec::{
    keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
    protocol::{address::AztecAddress, hash::poseidon2_hash, point::EmbeddedCurvePoint, traits::{FromField, ToField}},
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    test::helpers::{
        tagging_secret_strategy::TaggingSecretStrategy,
        test_environment::{
            CallPrivateOptions, DeployOptions, ExecuteUtilityOptions, TestEnvironment, TestEnvironmentOptions,
        },
        txe_oracles,
    },
};
use handshake_registry_contract::HandshakeRegistry;

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    setup_opts(TestEnvironmentOptions::new())
}

unconstrained fn setup_opts(
    options: TestEnvironmentOptions,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new_opts(options);

    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env
        .deploy_opts(DeployOptions::new().with_salt(1).with_secret(0), "@handshake_registry_contract/HandshakeRegistry")
        .without_initializer();
    assert_eq(registry_address, STANDARD_HANDSHAKE_REGISTRY_ADDRESS);

    let test_address = env.deploy("ConstrainedDeliveryTest").without_initializer();

    (env, registry_address, test_address, sender, recipient)
}

/// Constrained delivery resolves the current app secret through `HandshakeRegistry::get_app_siloed_secrets`, which TXE
/// denies by default. Authorize the registry as a utility-call target for calls that emit constrained messages.
unconstrained fn authorizing(registry_address: AztecAddress) -> CallPrivateOptions<0, 1> {
    CallPrivateOptions::new().with_authorized_utility_call_targets([registry_address])
}

unconstrained fn external_recipient() -> AztecAddress {
    AztecAddress::from_field(8)
}

unconstrained fn arbitrary_secret_point() -> EmbeddedCurvePoint {
    EmbeddedCurvePoint {
        x: 0x15d55a5b3b2caa6a6207f313f05c5113deba5da9927d6421bcaa164822b911bc,
        y: 0x0974c3d0825031ae933243d653ebb1a0b08b90ee7f228f94c5c74739ea3c871e,
    }
}

#[test]
unconstrained fn unconstrained_delivery_uses_configured_arbitrary_secret() {
    let point = arbitrary_secret_point();
    let options =
        TestEnvironmentOptions::new().with_tagging_secret_strategy(TaggingSecretStrategy::arbitrary_secret(point));
    let (env, registry_address, test_address, sender, _) = setup_opts(options);
    let recipient = external_recipient();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, test_contract.emit_unconstrained_event(recipient, 1));

    let effects = txe_oracles::get_last_tx_effects();
    assert_eq(effects.private_logs.len(), 1);

    let app_secret = compute_app_siloed_shared_secret(point, test_address);
    let expected_secret = poseidon2_hash([app_secret, recipient.to_field()]);
    let next_unconstrained_index =
        env.call_private(sender, test_contract.next_unconstrained_index_for_secret(expected_secret));
    let next_constrained_index = env.call_private(sender, test_contract.next_index_for_secret(expected_secret));
    assert_eq(next_unconstrained_index, 1);
    assert_eq(next_constrained_index, 0);

    let maybe_handshake = env.execute_utility_opts(
        ExecuteUtilityOptions::new().with_from(test_address),
        registry.get_app_siloed_secrets(sender, recipient),
    );
    assert(maybe_handshake.is_none());
}

#[test]
unconstrained fn unconstrained_delivery_uses_address_derived_secret() {
    let options = TestEnvironmentOptions::new().with_tagging_secret_strategy(TaggingSecretStrategy::address_derived());
    let (env, _, test_address, sender, _) = setup_opts(options);
    let recipient = external_recipient();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let secret = env.call_private(sender, test_contract.address_derived_secret(sender, recipient));

    env.call_private(sender, test_contract.emit_unconstrained_event(recipient, 1));

    let private_logs = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(private_logs.len(), 1);

    let next_unconstrained_index = env.call_private(sender, test_contract.next_unconstrained_index_for_secret(secret));
    let next_constrained_index = env.call_private(sender, test_contract.next_index_for_secret(secret));
    assert_eq(next_unconstrained_index, 1);
    assert_eq(next_constrained_index, 0);
}

#[test]
unconstrained fn tagging_secret_strategy_can_differ_by_delivery_mode() {
    let point = arbitrary_secret_point();
    let options = TestEnvironmentOptions::new().with_tagging_secret_strategies_by_delivery_mode(
        TaggingSecretStrategy::arbitrary_secret(point),
        TaggingSecretStrategy::non_interactive_handshake(),
    );
    let (env, registry_address, test_address, sender, _) = setup_opts(options);
    let recipient = external_recipient();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, test_contract.emit_unconstrained_event(recipient, 1));

    let app_secret = compute_app_siloed_shared_secret(point, test_address);
    let expected_unconstrained_secret = poseidon2_hash([app_secret, recipient.to_field()]);
    let next_unconstrained_index =
        env.call_private(sender, test_contract.next_unconstrained_index_for_secret(expected_unconstrained_secret));
    assert_eq(next_unconstrained_index, 1);

    let maybe_handshake = env.execute_utility_opts(
        ExecuteUtilityOptions::new().with_from(test_address),
        registry.get_app_siloed_secrets(sender, recipient),
    );
    assert(maybe_handshake.is_none());

    env.call_private_opts(sender, authorizing(registry_address), test_contract.emit_event(recipient, 1));

    let handshake = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(test_address),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"constrained delivery should have stored a handshake");
    assert(handshake.shared != expected_unconstrained_secret);

    let next_constrained_index = env.call_private(sender, test_contract.next_index_for_secret(handshake.shared));
    assert_eq(next_constrained_index, 1);
}

#[test]
unconstrained fn rehandshake_replaces_registry_secret_for_future_delivery() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, authorizing(registry_address), test_contract.emit_event(recipient, 1));
    let first_secret = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(test_address),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"first delivery should have stored a handshake")
        .shared;

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let second_secret = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(test_address),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"re-handshake should have stored a replacement handshake")
        .shared;
    assert(first_secret != second_secret, "re-handshake should produce a distinct secret");

    env.call_private_opts(sender, authorizing(registry_address), test_contract.emit_event(recipient, 1));

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(second_secret));
    assert_eq(next_index, 1);
}

#[test(should_fail_with = "reading an unknown nullifier")]
unconstrained fn fails_at_index_above_zero_without_prior_nullifier() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let secret = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(test_address),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake should be siloed for the test contract")
        .shared;

    env.call_private(sender, test_contract.emit_constrained_log_without_nullifier(secret, 0));

    let _ = env.call_private_opts(sender, authorizing(registry_address), test_contract.emit_event(recipient, 1));
}
