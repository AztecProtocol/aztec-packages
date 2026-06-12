//! Tests for the constrained-delivery sender helpers.
//!
//! `resolve_and_return` exercises `resolve_secret_and_index` directly. The `index > 0` branch only runs once
//! the PXE's per-secret index has advanced, which happens when a constrained-tagged log lands on-chain. The
//! `index > 0` tests land such a log via `emit_constrained_log_without_nullifier` and emit the predecessor chain
//! nullifier via `emit_chain_nullifier`, standing in for a real constrained send at the prior index.
//! Direct helper tests use explicit log/nullifier setup so each branch can be targeted independently.
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

/// Each call passes through the helper's `unsafe` cross-contract utility call to
/// `HandshakeRegistry::get_app_siloed_secret`, which TXE denies by default. We authorize the registry as a
/// utility-call target via `with_authorized_utility_call_targets` on each `call_private_opts`.
unconstrained fn helper_options(registry_address: AztecAddress) -> CallPrivateOptions<0, 1> {
    CallPrivateOptions::new().with_authorized_utility_call_targets([registry_address])
}

// First call has no prior handshake, so the helper performs `non_interactive_handshake` and returns
// `(secret_a, 0)`. The registry's stored note is siloed to the test contract and equal to `secret_a`. A direct
// re-handshake then replaces the note; the next helper call picks up the new secret on the `Some` branch (still
// at index 0 because no constrained tag has advanced the PXE state for either secret).
#[test]
unconstrained fn handshake_returns_fresh_secret_at_index_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let (first_secret, first_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );
    assert_eq(first_index, 0);
    assert(first_secret != 0, "bootstrap should return a non-zero secret");

    let stored_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"bootstrap should have stored a handshake siloed for the test contract");
    assert_eq(stored_secret, first_secret);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));

    let (second_secret, second_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );

    assert(first_secret != second_secret, "re-handshake should produce a distinct secret");
    assert_eq(second_index, 0);
}

// Bootstrap must seed the per-secret index counter, so a second message emitted under the freshly
// bootstrapped handshake within the same tx advances to index 1 instead of resetting to 0 (which would
// collide on `(secret, 0)`). This mirrors the `Some(secret)` branch, which seeds the counter via the same
// oracle call.
#[test]
unconstrained fn bootstrap_seeds_index_counter_for_same_tx_reuse() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    let (secret, first_index, second_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_then_next_index(registry_address, sender, recipient),
    );

    assert(secret != 0, "bootstrap should return a non-zero secret");
    assert_eq(first_index, 0);
    assert_eq(second_index, 1);
}

// Existing-handshake path: when a handshake already exists, the helper takes the `Some(secret)` branch and
// (at index 0) calls `validate_handshake`, which completes here because the secret matches the stored note.
#[test]
unconstrained fn reuses_existing_secret_at_index_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let app_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"seeded handshake should be siloed for the test contract");

    let (secret, index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );

    assert_eq(index, 0);
    assert_eq(secret, app_secret);
}

// After a constrained-tagged log lands in a block, the PXE's per-secret index advances. The next resolution takes
// the `index > 0` branch, proves the prior (now settled) chain nullifier exists, and returns index 1. The log and
// nullifier are emitted explicitly here, standing in for the constrained send at index 0.
#[test]
unconstrained fn advances_index_above_zero_when_prior_nullifier_exists() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    // Bootstrap the handshake, returning `(secret, 0)`.
    let (secret, first_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );
    assert_eq(first_index, 0);

    // Stand in for the constrained send at index 0: land its tagged log (advancing the per-secret index) and its
    // chain nullifier.
    env.call_private(sender, test_contract.emit_constrained_log_without_nullifier(secret, 0));
    env.call_private(sender, test_contract.emit_chain_nullifier(sender, recipient, secret, 0));

    // Resolution now syncs the index to 1 and proves the settled index-0 nullifier exists.
    let (second_secret, second_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );

    assert_eq(second_secret, secret);
    assert_eq(second_index, 1);
}

#[test]
unconstrained fn note_delivery_advances_index_above_zero() {
    let (env, _registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.emit_note(sender, recipient),
    );

    let (secret, index) = env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.resolve_and_return(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, sender, recipient),
    );

    assert(secret != 0, "delivery should bootstrap a non-zero secret");
    assert_eq(index, 1);
}

#[test]
unconstrained fn maybe_note_delivery_advances_index_above_zero() {
    let (env, _registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.emit_maybe_note(sender, recipient),
    );

    let (secret, index) = env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.resolve_and_return(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, sender, recipient),
    );

    assert(secret != 0, "delivery should bootstrap a non-zero secret");
    assert_eq(index, 1);
}

#[test]
unconstrained fn event_delivery_advances_index_above_zero() {
    let (env, _registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.emit_event(sender, recipient),
    );

    let (secret, index) = env.call_private_opts(
        sender,
        helper_options(STANDARD_HANDSHAKE_REGISTRY_ADDRESS),
        test_contract.resolve_and_return(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, sender, recipient),
    );

    assert(secret != 0, "delivery should bootstrap a non-zero secret");
    assert_eq(index, 1);
}

// Without a prior chain nullifier the `index > 0` branch cannot prove its predecessor. We advance the per-secret
// index by landing a constrained-tagged log at index 0 while deliberately skipping the chain nullifier; resolution
// then fails because the predecessor nullifier is neither pending nor settled.
#[test(should_fail_with = "reading an unknown nullifier")]
unconstrained fn fails_at_index_above_zero_without_prior_nullifier() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    // Establish a handshake so resolution takes the `Some(secret)` branch. This emits no constrained nullifier.
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));
    let secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, test_address))
        .expect(f"handshake should be siloed for the test contract");

    // Advance the per-secret index above 0 by landing a constrained-tagged log at index 0.
    env.call_private(sender, test_contract.emit_constrained_log_without_nullifier(secret, 0));

    // Resolution now takes the `index > 0` branch and fails: the predecessor nullifier was never emitted.
    let _ = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient),
    );
}

// Independent per-secret counters for distinct `(sender, recipient)` pairs. Each starts at 0.
#[test]
unconstrained fn distinct_pairs_have_independent_indexes() {
    let (mut env, registry_address, test_address, sender, recipient_a) = setup();
    let recipient_b = env.create_light_account();

    let test_contract = ConstrainedDeliveryTest::at(test_address);

    let (secret_a, index_a) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient_a),
    );
    let (secret_b, index_b) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.resolve_and_return(registry_address, sender, recipient_b),
    );

    assert_eq(index_a, 0);
    assert_eq(index_b, 0);
    assert(secret_a != secret_b, "different recipients should yield distinct siloed secrets");
}
