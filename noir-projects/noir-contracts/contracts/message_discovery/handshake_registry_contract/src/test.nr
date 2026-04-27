use crate::{HandshakeRegistry, NON_INTERACTIVE_HANDSHAKE};

use aztec::{
    protocol::{
        address::AztecAddress, constants::DOM_SEP__HANDSHAKE_SECRET_HASH,
        hash::poseidon2_hash_with_separator, traits::FromField,
    },
    test::helpers::test_environment::TestEnvironment,
};

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let other_sender = env.create_light_account();
    let recipient = env.create_light_account();

    let registry_address = env.deploy("HandshakeRegistry").without_initializer();

    (env, registry_address, sender, other_sender, recipient)
}

unconstrained fn expected_secret_hash(shared_secret: Field) -> Field {
    poseidon2_hash_with_separator([shared_secret], DOM_SEP__HANDSHAKE_SECRET_HASH)
}

#[test]
unconstrained fn non_interactive_handshake_stores_note_for_sender() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let shared_secret = 0x1234abcd;
    env.call_private(sender, registry.non_interactive_handshake(shared_secret, recipient));

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 1);

    let note = notes.get(0);
    assert_eq(note.secret_hash, expected_secret_hash(shared_secret));
    assert_eq(note.handshake_type, NON_INTERACTIVE_HANDSHAKE);
}

#[test]
unconstrained fn multiple_handshakes_from_same_sender_accumulate() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secret_a = 0xaaaa;
    let secret_b = 0xbbbb;
    env.call_private(sender, registry.non_interactive_handshake(secret_a, recipient));
    env.call_private(sender, registry.non_interactive_handshake(secret_b, recipient));

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 2);

    let stored_hashes = [notes.get(0).secret_hash, notes.get(1).secret_hash];
    let expected = [expected_secret_hash(secret_a), expected_secret_hash(secret_b)];
    assert(
        (stored_hashes[0] == expected[0]) & (stored_hashes[1] == expected[1])
            | (stored_hashes[0] == expected[1]) & (stored_hashes[1] == expected[0]),
        "stored secret hashes don't match either ordering of expected hashes",
    );
}

#[test]
unconstrained fn handshakes_are_isolated_per_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secret = 0x1111;
    let other_secret = 0x2222;
    env.call_private(sender, registry.non_interactive_handshake(sender_secret, recipient));
    env.call_private(other_sender, registry.non_interactive_handshake(other_secret, recipient));

    let sender_notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    let other_notes = env.execute_utility(registry.get_handshakes_for_sender(other_sender));

    assert_eq(sender_notes.len(), 1);
    assert_eq(other_notes.len(), 1);
    assert_eq(sender_notes.get(0).secret_hash, expected_secret_hash(sender_secret));
    assert_eq(other_notes.get(0).secret_hash, expected_secret_hash(other_secret));
}

#[test]
unconstrained fn no_handshakes_returns_empty() {
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 0);
}

#[test]
unconstrained fn handshake_to_invalid_recipient_does_not_panic() {
    // The AES128 encryption path tolerates invalid recipient addresses by silently swapping in a random valid
    // address point (see the "king of the hill" comment in `aes128.nr`). The note for the sender is still stored
    // because encryption succeeds. We pin this behavior so a future change to the encryption layer that tightens
    // recipient validation can't silently regress the handshake function.
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    // x = 3 is a non-residue for the curve, so this address has no corresponding address point.
    let invalid_recipient = AztecAddress::from_field(3);
    assert(!invalid_recipient.is_valid());

    let shared_secret = 0xdeadbeef;
    env.call_private(sender, registry.non_interactive_handshake(shared_secret, invalid_recipient));

    let notes = env.execute_utility(registry.get_handshakes_for_sender(sender));
    assert_eq(notes.len(), 1);
    assert_eq(notes.get(0).secret_hash, expected_secret_hash(shared_secret));
}
