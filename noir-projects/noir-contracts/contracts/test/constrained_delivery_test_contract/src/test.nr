//! Tests for `calculate_secret_and_index`.
//!
//! TODO(F-670): Coverage here is limited to the bootstrap branch and the `Some(secret)` branch with `index == 0` (which
//! constrains via `HandshakeRegistry::validate_handshake`). The `index > 0` branch of the helper is reachable
//! only after the per-secret index has been advanced in the PXE, which requires a tx to land a private log
//! tagged with `compute_log_tag(poseidon2_hash([secret, index]), DOM_SEP__CONSTRAINED_MSG_LOG_TAG)` AND emit
//! the chained constrained-message nullifier. Both are produced by the forthcoming `emit_constrained_message`
//! helper, so positive and negative `index > 0` tests live with that helper. Add
//! `advances_index_above_zero_when_prior_message_was_emitted` and
//! `fails_at_index_above_zero_without_prior_nullifier` alongside `emit_constrained_message`.
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
