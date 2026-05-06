use crate::{HandshakeRegistry, NON_INTERACTIVE_HANDSHAKE};

use aztec::{
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        hash::{compute_log_tag, compute_siloed_private_log_first_field},
        traits::{FromField, ToField},
    },
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
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
unconstrained fn non_interactive_handshake_stores_recipient_bound_note_at_sender() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let note = env.execute_utility(registry.get_handshake(sender, recipient, NON_INTERACTIVE_HANDSHAKE)).expect(
        f"handshake note should be present",
    );
    assert_eq(note.handshake_type, NON_INTERACTIVE_HANDSHAKE);
    assert_eq(note.recipient, recipient);
    // TODO: `secret_hash` is the hash of the raw ECDH point components. Without an storing the raw point in an oracle
    // we
    // can't reconstruct it from the recipient's side here, so we just check that something non-zero was stored.
    assert(note.secret_hash != 0, "secret_hash should be set");
}

#[test]
unconstrained fn handshakes_are_isolated_per_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    assert(
        env.execute_utility(registry.get_handshake(other_sender, recipient, NON_INTERACTIVE_HANDSHAKE)).is_none(),
        "other sender should not see primary sender's handshake",
    );

    env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));

    let sender_note = env.execute_utility(registry.get_handshake(sender, recipient, NON_INTERACTIVE_HANDSHAKE)).expect(
        f"primary sender should see its handshake",
    );
    let other_sender_note = env
        .execute_utility(registry.get_handshake(other_sender, recipient, NON_INTERACTIVE_HANDSHAKE))
        .expect(f"other sender should see its handshake");

    assert(
        sender_note.secret_hash != other_sender_note.secret_hash,
        "senders should not resolve to the same handshake",
    );
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

    env.call_private(sender, registry.non_interactive_handshake(sender, invalid_recipient));
}

// A recipient who knows only their own address can compute the
// expected tag, find the log under it, and recover `eph_pk.x` from the payload.
#[test]
unconstrained fn non_interactive_handshake_emits_recipient_discoverable_log() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

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

#[test]
unconstrained fn two_senders_to_same_recipient_share_tag_with_distinct_payloads() {
    // The handshake tag depends only on the recipient, so multiple senders posting to the same recipient
    // land under one key. Each emitted log carries its own ephemeral key.
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));
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

#[test]
unconstrained fn duplicate_handshake_accumulates_distinct_secrets_and_returns_latest() {
    // Two handshakes from the same sender to the same `(recipient, type)` are not deduplicated.
    // Each call generates a fresh ephemeral key, so the registry accumulates distinct notes and emits
    // distinct logs under the recipient's tag.
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);
    let first = env.execute_utility(registry.get_handshake(sender, recipient, NON_INTERACTIVE_HANDSHAKE)).expect(
        f"first handshake note should be present",
    );

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_second = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_second.len(), 2);
    let latest = env.execute_utility(registry.get_handshake(sender, recipient, NON_INTERACTIVE_HANDSHAKE)).expect(
        f"second handshake note should be present",
    );

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

    assert(first.secret_hash != latest.secret_hash, "should return the most recent note, not the first");
}

#[test]
unconstrained fn different_recipients_have_different_tags() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));
    let logs_a = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_a.len(), 2);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b));
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
unconstrained fn get_handshake_returns_none_for_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    assert(env.execute_utility(registry.get_handshake(other_sender, recipient, NON_INTERACTIVE_HANDSHAKE)).is_none());
}

#[test]
unconstrained fn get_handshake_returns_none_for_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));

    assert(env.execute_utility(registry.get_handshake(sender, recipient_b, NON_INTERACTIVE_HANDSHAKE)).is_none());
}

#[test]
unconstrained fn get_handshake_returns_none_for_wrong_handshake_type() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    // Claim it was something other than the only currently-defined handshake type.
    let unknown_handshake_type: u8 = NON_INTERACTIVE_HANDSHAKE + 1;
    assert(env.execute_utility(registry.get_handshake(sender, recipient, unknown_handshake_type)).is_none());
}
