use crate::HandshakeRegistry;

use aztec::{
    keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        hash::{compute_log_tag, compute_siloed_private_log_first_field},
        point::Point,
        traits::{FromField, ToField},
    },
    test::helpers::{
        test_environment::{CallPrivateOptions, TestEnvironment, ViewPrivateOptions},
        txe_oracles,
    },
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let other_sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env.deploy("HandshakeRegistry").without_initializer();

    (env, registry_address, sender, other_sender, recipient)
}

unconstrained fn setup_with_two_recipients() -> (
    TestEnvironment,
    AztecAddress,
    AztecAddress,
    AztecAddress,
    AztecAddress,
) {
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
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let retrieved_secret = env
        .view_private(sender, registry.get_app_siloed_secret(sender, recipient))
        .expect(f"handshake secret should be present");
    assert_eq(retrieved_secret, returned_secret);
    assert(returned_secret != 0, "returned app-siloed secret should be non-zero");
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

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, invalid_recipient));
}

// A recipient who knows only their own address can compute the
// expected tag, find the log under it, and recover `eph_pk.x` from the payload.
#[test]
unconstrained fn non_interactive_handshake_emits_recipient_discoverable_log() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    // The function emits two private logs in order: log 0 is the encrypted note delivered via
    // `MessageDelivery.ONCHAIN_UNCONSTRAINED`, log 1 is the recipient-keyed announcement carrying
    // `eph_pk.x` under a recipient-derivable tag.
    let logs = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs.len(), 2);

    let raw_tag = compute_log_tag(
        recipient.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let expected_siloed_tag = compute_siloed_private_log_first_field(registry_address, raw_tag);

    // siloed tag (1) + eph_pk.x (1) = 2 fields.
    let log_data = logs.get(1);
    assert_eq(log_data.len(), 2);
    assert_eq(log_data.get(0), expected_siloed_tag);
    let eph_pk_x = log_data.get(1);
    assert(eph_pk_x != 0, "eph_pk.x should be non-zero");
}

// The handshake tag depends only on the recipient, so multiple senders posting to the same recipient
// land under one key. Each emitted log carries its own ephemeral key.
#[test]
unconstrained fn two_senders_to_same_recipient_share_tag_with_distinct_payloads() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    let _ = env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));
    let logs_second = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_second.len(), 2);

    let raw_tag = compute_log_tag(
        recipient.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let expected_siloed_tag = compute_siloed_private_log_first_field(registry_address, raw_tag);
    assert_eq(logs_first.get(1).get(0), expected_siloed_tag);
    assert_eq(logs_second.get(1).get(0), expected_siloed_tag);

    let eph_pk_x_0 = logs_first.get(1).get(1);
    let eph_pk_x_1 = logs_second.get(1).get(1);
    assert(eph_pk_x_0 != eph_pk_x_1, "ephemeral keys should differ in handshakes from different senders");
}

// Two handshakes from the same sender to the same `(recipient, type)` are not deduplicated, and produce
// distinct `S` (hence distinct app-siloed secrets when siloed against the same caller). Each call emits a
// distinct ephemeral key in its log.
#[test]
unconstrained fn duplicate_handshake_accumulates_distinct_secrets_and_returns_latest() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret_first =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    let secret_second =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_second = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_second.len(), 2);

    let raw_tag = compute_log_tag(
        recipient.to_field(),
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    );
    let expected_siloed_tag = compute_siloed_private_log_first_field(registry_address, raw_tag);
    assert_eq(logs_first.get(1).get(0), expected_siloed_tag);
    assert_eq(logs_second.get(1).get(0), expected_siloed_tag);

    assert(
        logs_first.get(1).get(1) != logs_second.get(1).get(1),
        "ephemeral keys should differ across repeated handshakes",
    );

    // Same caller and same `(sender, recipient)`, but two distinct raw `S` produce two distinct silos
    assert(secret_first != secret_second, "successive handshakes should produce distinct app-siloed secrets");

    let retrieved = env
        .view_private(sender, registry.get_app_siloed_secret(sender, recipient))
        .expect(f"handshake secret should be present");
    assert_eq(retrieved, secret_second);

    env.call_private(sender, registry.validate_handshake(sender, recipient, secret_first));
    env.call_private(sender, registry.validate_handshake(sender, recipient, secret_second));
}

#[test]
unconstrained fn different_recipients_have_different_tags() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));
    let logs_a = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_a.len(), 2);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b));
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
unconstrained fn get_app_siloed_secret_returns_none_for_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    assert(
        env.view_private(sender, registry.get_app_siloed_secret(other_sender, recipient)).is_none(),
    );
}

#[test]
unconstrained fn get_app_siloed_secret_returns_none_for_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));

    assert(
        env.view_private(sender, registry.get_app_siloed_secret(sender, recipient_b)).is_none(),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private(sender, registry.validate_handshake(other_sender, recipient, secret));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));

    env.call_private(sender, registry.validate_handshake(sender, recipient_b, secret));
}

// Round-trip: the secret returned by `non_interactive_handshake` is exactly what retrieval returns and what
// `validate_handshake` accepts from the same `msg_sender`. `msg_sender()` inside the registry equals the `from`
// of `call_private` / `view_private` (execution begins directly in the called function with no entrypoint in
// between).
#[test]
unconstrained fn non_interactive_handshake_returned_secret_round_trips_through_validate() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let retrieved = env
        .view_private(sender, registry.get_app_siloed_secret(sender, recipient))
        .expect(f"handshake secret should be present");
    assert_eq(retrieved, secret);

    env.call_private(sender, registry.validate_handshake(sender, recipient, secret));
}

// Test-only PXE/TXE scope plumbing: other_sender remains msg_sender, but needs visibility into sender-owned notes.
#[test]
unconstrained fn get_app_siloed_secret_differs_per_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let other_sender_secret = env
        .view_private_opts(
            other_sender,
            ViewPrivateOptions::new().with_additional_scopes([sender]),
            registry.get_app_siloed_secret(sender, recipient),
        )
        .expect(f"handshake secret should be present for other caller");

    assert(sender_secret != other_sender_secret, "different callers should receive different siloed secrets");
}

#[test]
unconstrained fn validate_handshake_accepts_secret_siloed_for_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let other_sender_secret = env
        .view_private_opts(
            other_sender,
            ViewPrivateOptions::new().with_additional_scopes([sender]),
            registry.get_app_siloed_secret(sender, recipient),
        )
        .expect(f"handshake secret should be present for other caller");

    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, other_sender_secret),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_secret_siloed_for_different_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, sender_secret),
    );
}

// Tampering with the returned secret must not validate. `+ 1` on a Field is guaranteed to produce a
// different value.
#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private(sender, registry.validate_handshake(sender, recipient, secret + 1));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_panics_when_no_handshake() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.validate_handshake(sender, recipient, 1));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_zero_padded_secret_without_matching_note() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);
    let zero_padded_secret = compute_app_siloed_shared_secret(
        Point { x: 0, y: 0, is_infinite: false },
        sender,
    );

    env.call_private(sender, registry.validate_handshake(sender, recipient, zero_padded_secret));
}

// Regression for the unfiltered-page bug: insert 16 unrelated handshakes (different recipients) before
// the target. Without DB-side `select`, the matching note for `target_recipient` falls outside the 16-note
// page returned to `validate_handshake` and validation spuriously fails.
#[test]
unconstrained fn validate_handshake_finds_match_past_first_page() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let registry_address = env.deploy("HandshakeRegistry").without_initializer();
    let registry = HandshakeRegistry::at(registry_address);

    for _ in 0..16 {
        let noise_recipient = env.create_light_account();
        let _ = env.call_private(sender, registry.non_interactive_handshake(sender, noise_recipient));
    }

    let target_recipient = env.create_light_account();
    let target_secret =
        env.call_private(sender, registry.non_interactive_handshake(sender, target_recipient));

    env.call_private(sender, registry.validate_handshake(sender, target_recipient, target_secret));
}

// Regression for unfiltered-page retrieval. Without DB-side `select`, the matching note for `target_recipient`
// falls outside the 16-note page returned to `get_app_siloed_secret`.
#[test]
unconstrained fn get_app_siloed_secret_finds_match_past_first_page() {
    let mut env = TestEnvironment::new();
    let sender = env.create_light_account();
    let registry_address = env.deploy("HandshakeRegistry").without_initializer();
    let registry = HandshakeRegistry::at(registry_address);

    for _ in 0..16 {
        let noise_recipient = env.create_light_account();
        let _ = env.call_private(sender, registry.non_interactive_handshake(sender, noise_recipient));
    }

    let target_recipient = env.create_light_account();
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, target_recipient));

    assert(
        env.view_private(sender, registry.get_app_siloed_secret(sender, target_recipient)).is_some(),
    );
}
