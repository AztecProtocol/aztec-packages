use crate::HandshakeRegistry;

use aztec::{
    messages::message_delivery::{ONCHAIN_CONSTRAINED, ONCHAIN_UNCONSTRAINED},
    protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, PRIVATE_LOG_SIZE_IN_FIELDS},
        hash::{compute_log_tag, compute_siloed_private_log_first_field},
        traits::{FromField, ToField},
    },
    test::helpers::{test_environment::{CallPrivateOptions, TestEnvironment}, txe_oracles},
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let other_sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env.deploy("HandshakeRegistry").without_initializer();

    (env, registry_address, sender, other_sender, recipient)
}

unconstrained fn setup_with_two_recipients() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let recipient_a = env.create_light_account();
    let recipient_b = env.create_light_account();

    let registry_address = env.deploy("HandshakeRegistry").without_initializer();

    (env, registry_address, sender, recipient_a, recipient_b)
}

#[test]
unconstrained fn non_interactive_handshake_stores_handshake_for_sender_and_recipient() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let returned_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    let utility_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_UNCONSTRAINED, sender))
        .expect(f"handshake secret should be present");
    assert_eq(utility_secret, returned_secret);
    assert(returned_secret != 0, "returned app-siloed secret should be non-zero");

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, returned_secret));
}

// The DH-direct flow lifts `recipient` to a curve point and fails loud if the address has no
// corresponding point. We deliberately do not replicate AES128's "king of the hill" fallback here; see
// the doc comment on [`HandshakeRegistry::non_interactive_handshake`] for the rationale.
#[test(should_fail_with = "recipient address is not on the curve")]
unconstrained fn handshake_to_invalid_recipient_panics() {
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    // x = 3 is a non-residue for the curve, so this address has no corresponding address point.
    let invalid_recipient = AztecAddress::from_field(3);
    assert(!invalid_recipient.is_valid());

    let _ =
        env.call_private(sender, registry.non_interactive_handshake(sender, invalid_recipient, ONCHAIN_UNCONSTRAINED));
}

// The handshake tag depends only on the recipient, so multiple senders posting to
// the same recipient land under the same log tag.
#[test]
unconstrained fn two_senders_to_same_recipient_share_tag() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    let _ = env.call_private(
        other_sender,
        registry.non_interactive_handshake(other_sender, recipient, ONCHAIN_UNCONSTRAINED),
    );
    let logs_second = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_second.len(), 2);

    let raw_tag = compute_log_tag(
        recipient.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let expected_siloed_tag = compute_siloed_private_log_first_field(registry_address, raw_tag);

    // The handshake announcement log (index 1) is encrypted and uniformly sized.
    assert_eq(logs_first.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_second.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_first.get(1).get(0), expected_siloed_tag);
    assert_eq(logs_second.get(1).get(0), expected_siloed_tag);

    // Different ephemeral keys produce different ciphertexts even under the same tag.
    assert(logs_first.get(1).get(1) != logs_second.get(1).get(1), "ciphertexts should differ across senders");
}

// Re-handshaking for the same `(sender, recipient, mode)` replaces the prior current handshake and produces
// distinct `S` (hence distinct app-siloed secrets when siloed against the same caller).
#[test]
unconstrained fn rehandshake_replaces_previous_secret_and_returns_latest() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret_first =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    let secret_second =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let logs_second = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_second.len(), 2);

    let raw_tag = compute_log_tag(
        recipient.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let expected_siloed_tag = compute_siloed_private_log_first_field(registry_address, raw_tag);

    // Both handshake announcement logs are encrypted, uniformly sized, and share the same tag.
    assert_eq(logs_first.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_second.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_first.get(1).get(0), expected_siloed_tag);
    assert_eq(logs_second.get(1).get(0), expected_siloed_tag);

    // Different ephemeral keys produce different ciphertexts even under the same tag.
    assert(logs_first.get(1).get(1) != logs_second.get(1).get(1), "ciphertexts should differ across handshakes");

    // Same caller and same `(sender, recipient)`, but two distinct raw `S` produce two distinct silos
    assert(secret_first != secret_second, "successive handshakes should produce distinct app-siloed secrets");

    let retrieved = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_UNCONSTRAINED, sender))
        .expect(f"handshake secret should be present");
    assert_eq(retrieved, secret_second);

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, secret_second));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn rehandshake_revokes_previous_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret_first =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, secret_first));
}

#[test]
unconstrained fn different_recipients_have_different_tags() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a, ONCHAIN_UNCONSTRAINED));
    let logs_a = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_a.len(), 2);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b, ONCHAIN_UNCONSTRAINED));
    let logs_b = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_b.len(), 2);

    let tag_a = compute_log_tag(
        recipient_a.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let tag_b = compute_log_tag(
        recipient_b.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    assert(tag_a != tag_b, "recipient-keyed tags must differ");

    assert(logs_a.get(1).get(0) != logs_b.get(1).get(0), "tags in logs differ");
}

#[test]
unconstrained fn one_sender_can_have_active_handshakes_with_many_recipients() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let secret_a =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a, ONCHAIN_UNCONSTRAINED));
    let secret_b =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b, ONCHAIN_UNCONSTRAINED));

    assert(secret_a != secret_b, "separate recipient handshakes should produce distinct secrets");

    let retrieved_a = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient_a, ONCHAIN_UNCONSTRAINED, sender))
        .expect(f"handshake secret should be present for recipient A");
    let retrieved_b = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient_b, ONCHAIN_UNCONSTRAINED, sender))
        .expect(f"handshake secret should be present for recipient B");

    assert_eq(retrieved_a, secret_a);
    assert_eq(retrieved_b, secret_b);

    env.call_private(sender, registry.validate_handshake(sender, recipient_a, ONCHAIN_UNCONSTRAINED, secret_a));
    env.call_private(sender, registry.validate_handshake(sender, recipient_b, ONCHAIN_UNCONSTRAINED, secret_b));
}

#[test]
unconstrained fn get_app_siloed_secret_returns_none_for_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    assert(env
        .execute_utility(registry.get_app_siloed_secret(other_sender, recipient, ONCHAIN_UNCONSTRAINED, sender))
        .is_none());
}

#[test]
unconstrained fn get_app_siloed_secret_returns_none_for_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a, ONCHAIN_UNCONSTRAINED));

    assert(env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient_b, ONCHAIN_UNCONSTRAINED, sender))
        .is_none());
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let _ = env.call_private(
        other_sender,
        registry.non_interactive_handshake(other_sender, recipient, ONCHAIN_UNCONSTRAINED),
    );

    env.call_private_opts(
        sender,
        CallPrivateOptions::new().with_additional_scopes([other_sender]),
        registry.validate_handshake(other_sender, recipient, ONCHAIN_UNCONSTRAINED, secret),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a, ONCHAIN_UNCONSTRAINED));
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b, ONCHAIN_UNCONSTRAINED));

    env.call_private(sender, registry.validate_handshake(sender, recipient_b, ONCHAIN_UNCONSTRAINED, secret));
}

// `PrivateMutable`'s init nullifier is derived from the owner's nullifier
// hiding key, so a caller can only initialize the `(recipient, sender)` slot for a `sender`
// whose keys it holds. Passing a different account as the `sender` therefore fails.
#[test(should_fail_with = "Key validation request denied")]
unconstrained fn non_interactive_handshake_rejects_other_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ =
        env.call_private(sender, registry.non_interactive_handshake(other_sender, recipient, ONCHAIN_UNCONSTRAINED));
}

// Counterpart with `non_interactive_handshake_rejects_other_sender`: with `other_sender` added to additional scopes,
// the caller has access to that account's nullifier hiding key, the init nullifier is producible,
// and the call succeeds. The gate is key access, not anything in the contract itself.
#[test]
unconstrained fn non_interactive_handshake_accepts_other_sender_in_additional_scopes() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private_opts(
        sender,
        CallPrivateOptions::new().with_additional_scopes([other_sender]),
        registry.non_interactive_handshake(other_sender, recipient, ONCHAIN_UNCONSTRAINED),
    );
}

// TODO(F-671): drop the explicit `caller` arg and exercise real msg_sender via the test env
// once utility context exposes self.msg_sender().
#[test]
unconstrained fn get_app_siloed_secret_differs_per_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let other_sender_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_UNCONSTRAINED, other_sender))
        .expect(f"handshake secret should be present for other caller");

    assert(sender_secret != other_sender_secret, "different callers should receive different siloed secrets");
}

#[test]
unconstrained fn validate_handshake_accepts_secret_siloed_for_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let other_sender_secret = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_UNCONSTRAINED, other_sender))
        .expect(f"handshake secret should be present for other caller");

    // `validate_handshake` calls `get_note` on a note owned by `sender`, which nullifies and
    // recreates and therefore needs `sender`'s nsk. Other_sender's PXE gets it via scopes.
    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, other_sender_secret),
    );
}

// TODO(F-671): drop the explicit `caller` arg used to obtain `other_sender_secret` and exercise
// real msg_sender via the test env once utility context exposes self.msg_sender().
#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_secret_siloed_for_different_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, sender_secret),
    );
}

// Tampering with the returned secret must not validate. `+ 1` on a Field is guaranteed to produce a
// different value.
#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, secret + 1));
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn validate_handshake_panics_when_no_handshake() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, 1));
}

// A handshake can be set to constrained mode, and `get_app_siloed_secret` returns the matching secret for that mode.
#[test]
unconstrained fn non_interactive_handshake_sets_constrained_mode() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));

    let app_siloed = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, sender))
        .expect(f"handshake secret should be present");
    assert_eq(app_siloed, secret);
}

#[test]
unconstrained fn get_app_siloed_secret_returns_none_for_uninitialized_mode() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));

    assert(env.execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, sender)).is_none());
}

#[test]
unconstrained fn same_pair_can_have_active_handshakes_in_both_modes() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let unconstrained_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let constrained_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));

    assert(unconstrained_secret != constrained_secret, "separate mode handshakes should produce distinct secrets");

    let unconstrained_app_siloed = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_UNCONSTRAINED, sender))
        .expect(f"unconstrained handshake secret should be present");
    let constrained_app_siloed = env
        .execute_utility(registry.get_app_siloed_secret(sender, recipient, ONCHAIN_CONSTRAINED, sender))
        .expect(f"constrained handshake secret should be present");

    assert_eq(unconstrained_app_siloed, unconstrained_secret);
    assert_eq(constrained_app_siloed, constrained_secret);

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, unconstrained_secret));
    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_CONSTRAINED, constrained_secret));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_unconstrained_secret_for_constrained_mode() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let unconstrained_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_CONSTRAINED, unconstrained_secret));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_constrained_secret_for_unconstrained_mode() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED));
    let constrained_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient, ONCHAIN_CONSTRAINED));

    env.call_private(sender, registry.validate_handshake(sender, recipient, ONCHAIN_UNCONSTRAINED, constrained_secret));
}

#[test(should_fail_with = "unrecognized delivery mode")]
unconstrained fn non_interactive_handshake_rejects_unknown_mode() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient, 99));
}
