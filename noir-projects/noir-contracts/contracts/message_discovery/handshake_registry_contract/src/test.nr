use crate::{HandshakeRegistry, NON_INTERACTIVE_HANDSHAKE};

use aztec::{
    keys::ecdh_shared_secret::derive_shared_secret_field_mask,
    oracle::shared_secret::get_shared_secret,
    protocol::{
        address::AztecAddress,
        constants::{
            DOM_SEP__HANDSHAKE_SECRET_HASH, DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
            PRIVATE_LOG_SIZE_IN_FIELDS,
        },
        hash::{compute_log_tag, poseidon2_hash_with_separator},
        traits::{FromField, ToField},
    },
    test::helpers::test_environment::TestEnvironment,
    utils::point::point_from_x_coord_and_sign,
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

unconstrained fn expected_secret_hash(s_app: Field) -> Field {
    poseidon2_hash_with_separator([s_app], DOM_SEP__HANDSHAKE_SECRET_HASH)
}

/// Extract the DH-direct payload `[eph_pk.x, masked_sender]` from a private log. `log_data[0]` is the siloed tag.
/// Recipient-side discovery does the same slice before recovering the shared secret.
unconstrained fn extract_dh_payload(
    log_data: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
) -> (Field, Field) {
    (log_data.get(1), log_data.get(2))
}

#[test]
unconstrained fn non_interactive_handshake_stores_recipient_bound_note_for_sender() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 1);

    let note = notes.get(0);
    assert_eq(note.secret_hash, expected_secret_hash(s_app));
    assert_eq(note.handshake_type, NON_INTERACTIVE_HANDSHAKE);
    assert_eq(note.recipient, recipient);
}

#[test]
unconstrained fn multiple_handshakes_from_same_sender_accumulate() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app_a = env.call_private(sender, registry.non_interactive_handshake(recipient));
    let s_app_b = env.call_private(sender, registry.non_interactive_handshake(recipient));

    // Two fresh ephemeral keypairs -> different shared secrets with overwhelming probability.
    assert(s_app_a != s_app_b, "two handshakes should produce distinct shared secrets");

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 2);

    let stored = [notes.get(0), notes.get(1)];
    let expected = [expected_secret_hash(s_app_a), expected_secret_hash(s_app_b)];
    assert(
        (stored[0].secret_hash == expected[0]) & (stored[1].secret_hash == expected[1])
            | (stored[0].secret_hash == expected[1]) & (stored[1].secret_hash == expected[0]),
        "stored secret hashes don't match either ordering of expected hashes",
    );
    assert_eq(stored[0].recipient, recipient);
    assert_eq(stored[1].recipient, recipient);
}

#[test]
unconstrained fn handshakes_are_isolated_per_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));
    let other_s_app =
        env.call_private(other_sender, registry.non_interactive_handshake(recipient));

    let sender_notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    let other_notes = env.execute_utility(registry.get_handshakes_for_sender(other_sender));

    assert_eq(sender_notes.len(), 1);
    assert_eq(other_notes.len(), 1);
    assert_eq(sender_notes.get(0).secret_hash, expected_secret_hash(sender_s_app));
    assert_eq(sender_notes.get(0).recipient, recipient);
    assert_eq(other_notes.get(0).secret_hash, expected_secret_hash(other_s_app));
    assert_eq(other_notes.get(0).recipient, recipient);
}

#[test(should_fail_with = "recipient address is not on the curve")]
unconstrained fn handshake_to_invalid_recipient_panics() {
    // The DH-direct flow lifts `recipient` to a curve point and fails loud if the address has no corresponding
    // point. We deliberately do not replicate AES128's "king of the hill" fallback here; see the doc comment on
    // [`HandshakeRegistry::non_interactive_handshake`] for the rationale.
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    // x = 3 is a non-residue for the curve, so this address has no corresponding address point.
    let invalid_recipient = AztecAddress::from_field(3);
    assert(!invalid_recipient.is_valid());

    let _ = env.call_private(sender, registry.non_interactive_handshake(invalid_recipient));
}

#[test]
unconstrained fn non_interactive_handshake_emits_recipient_discoverable_log() {
    // Load-bearing emission + discovery + secret-recovery + sender-attribution roundtrip. This is the spec's
    // "constrained delivery" promise in miniature: sender's `s_app` and recipient's recovered `s_app` must agree,
    // and recipient must be able to attribute the handshake to its sender.
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app_sender =
        env.call_private(sender, registry.non_interactive_handshake(recipient));

    // Discovery: recipient computes the deterministic recipient-keyed tag and finds the log under it.
    let raw_tag =
        compute_log_tag(recipient.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
    let logs = env.private_logs_by_tag(raw_tag, registry_address);
    assert_eq(logs.len(), 1);

    // Log-size sanity: siloed tag (1) + DH payload (2) = 3 fields.
    assert_eq(logs.get(0).len(), 1 + 2);

    let (eph_pk_x, masked_sender) = extract_dh_payload(logs.get(0));

    // Reconstruct eph_pk from x. The contract uses `generate_positive_ephemeral_key_pair`, so y is positive.
    let eph_pk = point_from_x_coord_and_sign(eph_pk_x, true).unwrap();

    // The `getSharedSecret` oracle requires the running context's `this_address()` to equal `contract_address`,
    // so we enter the registry's context to query the recipient-side shared secret.
    env.private_context_at(registry_address, |_context| {
        // Secret recovery: recipient's view of the ECDH agrees with sender's.
        let s_app_recipient = get_shared_secret(recipient, eph_pk, registry_address);
        assert_eq(s_app_recipient, s_app_sender);

        // Sender attribution: unmasking the second payload field with s_app yields the original sender address.
        let unmasked_sender = masked_sender - derive_shared_secret_field_mask(s_app_recipient, 0);
        assert_eq(unmasked_sender, sender.to_field());
    });
}

#[test]
unconstrained fn two_senders_to_same_recipient_share_tag_with_distinct_payloads() {
    // The handshake tag depends only on the recipient, so multiple senders posting to the same recipient land
    // under one key. Each emitted log carries its own ephemeral key + masked sender. Pins that "find every
    // handshake addressed to me" works when several senders are active and that the recipient can attribute
    // each payload to its sender.
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app_sender =
        env.call_private(sender, registry.non_interactive_handshake(recipient));
    let s_app_other =
        env.call_private(other_sender, registry.non_interactive_handshake(recipient));

    let raw_tag =
        compute_log_tag(recipient.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
    let logs = env.private_logs_by_tag(raw_tag, registry_address);
    assert_eq(logs.len(), 2);

    let (eph_pk_x_0, masked_sender_0) = extract_dh_payload(logs.get(0));
    let (eph_pk_x_1, masked_sender_1) = extract_dh_payload(logs.get(1));

    let eph_pk_0 = point_from_x_coord_and_sign(eph_pk_x_0, true).unwrap();
    let eph_pk_1 = point_from_x_coord_and_sign(eph_pk_x_1, true).unwrap();

    env.private_context_at(registry_address, |_context| {
        let s_app_0 = get_shared_secret(recipient, eph_pk_0, registry_address);
        let s_app_1 = get_shared_secret(recipient, eph_pk_1, registry_address);
        let unmasked_0 = masked_sender_0 - derive_shared_secret_field_mask(s_app_0, 0);
        let unmasked_1 = masked_sender_1 - derive_shared_secret_field_mask(s_app_1, 0);

        assert_eq(s_app_0, s_app_sender);
        assert_eq(unmasked_0, sender.to_field());
        assert_eq(s_app_1, s_app_other);
        assert_eq(unmasked_1, other_sender.to_field());
    });
}

#[test]
unconstrained fn different_recipients_have_different_tags() {
    // Tag derivation depends only on the recipient address; pin that two handshakes from the same sender to
    // different recipients land under disjoint tags so each recipient sees only their own log.
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app_a = env.call_private(sender, registry.non_interactive_handshake(recipient_a));
    let s_app_b = env.call_private(sender, registry.non_interactive_handshake(recipient_b));

    let tag_a = compute_log_tag(recipient_a.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
    let tag_b = compute_log_tag(recipient_b.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
    assert(tag_a != tag_b, "recipient-keyed tags must differ");

    let logs_a = env.private_logs_by_tag(tag_a, registry_address);
    let logs_b = env.private_logs_by_tag(tag_b, registry_address);
    assert_eq(logs_a.len(), 1);
    assert_eq(logs_b.len(), 1);

    let (eph_pk_x_a, _) = extract_dh_payload(logs_a.get(0));
    let (eph_pk_x_b, _) = extract_dh_payload(logs_b.get(0));
    let eph_pk_a = point_from_x_coord_and_sign(eph_pk_x_a, true).unwrap();
    let eph_pk_b = point_from_x_coord_and_sign(eph_pk_x_b, true).unwrap();

    env.private_context_at(registry_address, |_context| {
        // Each recipient recovers their own s_app, matching the sender-side return value for that handshake.
        assert_eq(get_shared_secret(recipient_a, eph_pk_a, registry_address), s_app_a);
        assert_eq(get_shared_secret(recipient_b, eph_pk_b, registry_address), s_app_b);
    });
}

#[test]
unconstrained fn assert_handshake_exists_succeeds_for_correct_inputs() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));

    env.view_private(
        sender,
        registry.assert_handshake_exists(sender, recipient, s_app, NON_INTERACTIVE_HANDSHAKE),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn assert_handshake_exists_fails_for_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));

    // The note was inserted under `sender`'s slot; querying it under `other_sender`'s slot should not find it.
    env.view_private(
        sender,
        registry.assert_handshake_exists(
            other_sender,
            recipient,
            s_app,
            NON_INTERACTIVE_HANDSHAKE,
        ),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn assert_handshake_exists_fails_for_wrong_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));

    env.view_private(
        sender,
        registry.assert_handshake_exists(sender, recipient, s_app + 1, NON_INTERACTIVE_HANDSHAKE),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn assert_handshake_exists_fails_for_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient_a));

    env.view_private(
        sender,
        registry.assert_handshake_exists(
            sender,
            recipient_b,
            s_app,
            NON_INTERACTIVE_HANDSHAKE,
        ),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn same_sender_secret_for_recipient_a_does_not_match_recipient_b() {
    // Regression: recipient is bound into the handshake proof. Without `recipient` in the note preimage this
    // assertion would succeed, since (sender, s_app, type) alone matches.
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient_a));

    env.view_private(
        sender,
        registry.assert_handshake_exists(
            sender,
            recipient_b,
            s_app,
            NON_INTERACTIVE_HANDSHAKE,
        ),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn assert_handshake_exists_fails_for_wrong_handshake_type() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let s_app = env.call_private(sender, registry.non_interactive_handshake(recipient));

    // Claim it was an interactive handshake instead of non-interactive.
    env.view_private(
        sender,
        registry.assert_handshake_exists(sender, recipient, s_app, crate::INTERACTIVE_HANDSHAKE),
    );
}
