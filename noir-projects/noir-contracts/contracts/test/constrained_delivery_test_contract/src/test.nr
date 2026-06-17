//! Tests for constrained delivery through the public message-delivery API.
//!
//! These tests exercise the sender-side helper flow indirectly via constrained note/event delivery: resolve or
//! bootstrap the app-siloed handshake secret, reserve the next per-secret index, constrain that index, emit the chain
//! nullifier, then emit the tagged private log. The malformed-log test lands a constrained tag without its chain
//! nullifier so the next real delivery must reject the broken chain.
use crate::ConstrainedDeliveryTest;

use aztec::{
    messages::delivery::{MessageDelivery, OnchainDeliveryMode},
    protocol::address::AztecAddress,
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    test::helpers::test_environment::{CallPrivateOptions, DeployOptions, TestEnvironment},
};
use handshake_registry_contract::HandshakeRegistry;

// Modes have no public constructors, so the tests derive them through the delivery builder API.
global ONCHAIN_CONSTRAINED: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env
        .deploy_opts(DeployOptions::new().with_salt(1).with_secret(0), "@handshake_registry_contract/HandshakeRegistry")
        .without_initializer();
    assert_eq(registry_address, STANDARD_HANDSHAKE_REGISTRY_ADDRESS);

    let test_address = env.deploy("ConstrainedDeliveryTest").without_initializer();

    (env, registry_address, test_address, sender, recipient)
}

/// Constrained delivery resolves the current app secret through `HandshakeRegistry::get_app_siloed_secret`, which TXE
/// denies by default. Authorize the registry as a utility-call target for calls that emit constrained messages.
unconstrained fn helper_options(registry_address: AztecAddress) -> CallPrivateOptions<0, 1> {
    CallPrivateOptions::new().with_authorized_utility_call_targets([registry_address])
}

#[test]
unconstrained fn delivery_bootstraps_handshake_and_advances_index() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));

    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"delivery should have stored a handshake siloed for the test contract");
    assert(secret != 0, "delivery should bootstrap a non-zero secret");

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(secret));
    assert_eq(next_index, 1);
}

#[test]
unconstrained fn rehandshake_replaces_registry_secret_for_future_delivery() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));
    let first_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"first delivery should have stored a handshake");

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let second_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"re-handshake should have stored a replacement handshake");
    assert(first_secret != second_secret, "re-handshake should produce a distinct secret");

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(second_secret));
    assert_eq(next_index, 1);
}

#[test]
unconstrained fn delivery_reuses_existing_secret_at_index_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let app_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"seeded handshake should be siloed for the test contract");

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(app_secret));
    assert_eq(next_index, 1);
}

#[test]
unconstrained fn second_delivery_proves_prior_nullifier_exists() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));
    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"first delivery should have stored a handshake");

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(secret));
    assert_eq(next_index, 2);
}

#[test]
unconstrained fn same_tx_delivery_reuse_proves_pending_prior_nullifier() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"seeded handshake should be siloed for the test contract");

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_two_events(recipient));

    let next_index = env.call_private(sender, test_contract.next_index_for_secret(secret));
    assert_eq(next_index, 2);
}

#[test]
unconstrained fn note_delivery_advances_index_above_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_note(recipient));

    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"note delivery should have stored a handshake");
    let next_index = env.call_private(sender, test_contract.next_index_for_secret(secret));

    assert(secret != 0, "delivery should bootstrap a non-zero secret");
    assert_eq(next_index, 1);
}

#[test]
unconstrained fn maybe_note_delivery_advances_index_above_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_maybe_note(recipient));

    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"maybe-note delivery should have stored a handshake");
    let next_index = env.call_private(sender, test_contract.next_index_for_secret(secret));

    assert(secret != 0, "delivery should bootstrap a non-zero secret");
    assert_eq(next_index, 1);
}

#[test(should_fail_with = "reading an unknown nullifier")]
unconstrained fn fails_at_index_above_zero_without_prior_nullifier() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"handshake should be siloed for the test contract");

    env.call_private(sender, test_contract.emit_constrained_log_without_nullifier(secret, 0));

    let _ = env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient));
}

#[test]
unconstrained fn distinct_pairs_have_independent_indexes() {
    let (mut env, registry_address, test_address, sender, recipient_a) = setup();
    let recipient_b = env.create_light_account();

    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient_a));
    env.call_private_opts(sender, helper_options(registry_address), test_contract.emit_event(recipient_b));

    let secret_a = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient_a, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"first recipient should have a handshake");
    let secret_b = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient_b, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"second recipient should have a handshake");

    let next_index_a = env.call_private(sender, test_contract.next_index_for_secret(secret_a));
    let next_index_b = env.call_private(sender, test_contract.next_index_for_secret(secret_b));

    assert_eq(next_index_a, 1);
    assert_eq(next_index_b, 1);
    assert(secret_a != secret_b, "different recipients should yield distinct siloed secrets");
}
