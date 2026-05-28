//! Tests for the constrained-delivery sender helpers.
//!
//! `calculate_and_return` exercises `calculate_secret_and_index` directly; `emit`, `emit_maybe_note`, and
//! `emit_event` exercise the high-level constrained delivery APIs, which emit the chain nullifier and a
//! constrained-tagged log. The `index > 0` branch of `calculate_secret_and_index` is reachable only once a constrained
//! log has advanced the PXE's per-secret index, so the `index > 0` tests land such a log first.
use crate::ConstrainedDeliveryTest;

use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::{CallPrivateOptions, TestEnvironment}};
use handshake_registry_contract::HandshakeRegistry;

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env.deploy("@handshake_registry_contract/HandshakeRegistry").without_initializer();
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
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );
    assert_eq(first_index, 0);
    assert(first_secret != 0, "bootstrap should return a non-zero secret");

    let stored_secret = env.execute_utility(registry.get_app_siloed_secret(sender, recipient, test_address)).expect(
        f"bootstrap should have stored a handshake siloed for the test contract",
    );
    assert_eq(stored_secret, first_secret);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let (second_secret, second_index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
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

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let app_secret = env.execute_utility(registry.get_app_siloed_secret(sender, recipient, test_address)).expect(
        f"seeded handshake should be siloed for the test contract",
    );

    let (secret, index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );

    assert_eq(index, 0);
    assert_eq(secret, app_secret);
}

// Independent per-secret counters for distinct `(sender, recipient)` pairs. Each starts at 0.
#[test]
unconstrained fn distinct_pairs_have_independent_indexes() {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let recipient_a = env.create_light_account();
    let recipient_b = env.create_light_account();

    let registry_address = env.deploy("@handshake_registry_contract/HandshakeRegistry").without_initializer();
    let test_address = env.deploy("ConstrainedDeliveryTest").without_initializer();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    let (secret_a, index_a) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient_a),
    );
    let (secret_b, index_b) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient_b),
    );

    assert_eq(index_a, 0);
    assert_eq(index_b, 0);
    assert(secret_a != secret_b, "different recipients should yield distinct siloed secrets");
}

// After high-level constrained note delivery lands a tagged log and the chain nullifier in a block, the per-secret
// index advances in the PXE. The next resolution takes the `index > 0` branch, which proves the prior (now settled)
// nullifier exists via `compute_nullifier_existence_request`, and returns index 1.
#[test]
unconstrained fn advances_index_above_zero_when_prior_message_was_emitted() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    // tx1: bootstraps the handshake (index 0), emits the chain nullifier and the constrained log.
    env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.emit(registry_address, sender, recipient),
    );

    // tx2: the emitted log advanced the per-secret index, so resolution returns index 1 and proves the now-settled
    // predecessor nullifier.
    let (_secret, index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );

    assert_eq(index, 1);
}

#[test]
unconstrained fn maybe_note_delivery_advances_index_above_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.emit_maybe_note(registry_address, sender, recipient),
    );

    let (_secret, index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );

    assert_eq(index, 1);
}

#[test]
unconstrained fn event_delivery_advances_index_above_zero() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);

    env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.emit_event(registry_address, sender, recipient),
    );

    let (_secret, index) = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );

    assert_eq(index, 1);
}

// Without a prior chain nullifier the `index > 0` branch cannot prove its predecessor. We advance the per-secret
// index by landing a constrained-tagged log at index 0 without the nullifier, then a resolution at an index above 0
// fails because a preceding nullifier is neither pending nor settled.
#[test(should_fail_with = "reading an unknown nullifier")]
unconstrained fn fails_at_index_above_zero_without_prior_nullifier() {
    let (env, registry_address, test_address, sender, recipient) = setup();
    let test_contract = ConstrainedDeliveryTest::at(test_address);
    let registry = HandshakeRegistry::at(registry_address);

    // Establish a handshake so resolution takes the `Some(secret)` branch. This emits no constrained nullifier.
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let secret = env.execute_utility(registry.get_app_siloed_secret(sender, recipient, test_address)).expect(
        f"handshake should be siloed for the test contract",
    );

    // Advance the per-secret index above 0 by landing a constrained-tagged log at index 0, deliberately skipping the
    // chain nullifier.
    env.call_private(sender, test_contract.emit_constrained_log_without_nullifier(secret, 0));

    // Resolution now takes the `index > 0` branch and fails: the predecessor nullifier was never emitted.
    let _ = env.call_private_opts(
        sender,
        helper_options(registry_address),
        test_contract.calculate_and_return(registry_address, sender, recipient),
    );
}
