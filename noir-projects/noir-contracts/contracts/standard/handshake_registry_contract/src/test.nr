use crate::HandshakeRegistry;
use crate::sync::cursor::SyncCursor;
use crate::sync::discovered_handshakes::origin_block_numbers;

use aztec::{
    messages::delivery::{
        constrained_delivery::VALIDATE_HANDSHAKE_SELECTOR,
        handshake::{
            AppSiloedHandshakeSecrets, forgery_protected_eph_pk, GET_APP_SILOED_SECRETS_SELECTOR,
            GET_NON_INTERACTIVE_HANDSHAKES_SELECTOR, INTERACTIVE_HANDSHAKE_SELECTOR, MAX_HANDSHAKES_PER_PAGE,
            NON_INTERACTIVE_HANDSHAKE_SELECTOR,
        },
    },
    oracle::shared_secret::get_shared_secret,
    protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, PRIVATE_LOG_SIZE_IN_FIELDS},
        hash::{compute_log_tag, compute_siloed_private_log_first_field},
        traits::{FromField, ToField},
    },
    test::helpers::{test_environment::{CallPrivateOptions, ExecuteUtilityOptions, TestEnvironment}, txe_oracles},
};

use std::test::OracleMock;

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

// The constrained-delivery helpers in aztec-nr cannot import this contract because the contract depends on aztec-nr.
// Assert their selector constants match this contract's macro-generated interface so a signature change on either side
// fails here instead of silently drifting.
#[test]
unconstrained fn selectors_match_the_constrained_delivery_helper() {
    let registry = HandshakeRegistry::at(AztecAddress::from_field(1));
    let sender = AztecAddress::from_field(2);
    let recipient = AztecAddress::from_field(3);
    let secrets = AppSiloedHandshakeSecrets { shared: 0, sender_only: 0 };

    assert_eq(registry.get_app_siloed_secrets(sender, recipient).selector, GET_APP_SILOED_SECRETS_SELECTOR);
    assert_eq(registry.non_interactive_handshake(sender, recipient).selector, NON_INTERACTIVE_HANDSHAKE_SELECTOR);
    assert_eq(registry.interactive_handshake(sender, recipient).selector, INTERACTIVE_HANDSHAKE_SELECTOR);
    assert_eq(registry.validate_handshake(sender, recipient, secrets).selector, VALIDATE_HANDSHAKE_SELECTOR);
    assert_eq(registry.get_non_interactive_handshakes(recipient, 0).selector, GET_NON_INTERACTIVE_HANDSHAKES_SELECTOR);
}

#[test]
unconstrained fn non_interactive_handshake_stores_handshake_for_sender_and_recipient() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let returned_secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let utility_secrets = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake secret should be present");
    assert_eq(utility_secrets.shared, returned_secrets.shared);
    assert_eq(utility_secrets.sender_only, returned_secrets.sender_only);
    assert(returned_secrets.shared != 0, "returned app-siloed secret should be non-zero");
    assert(returned_secrets.sender_only != 0, "returned sender-only secret should be non-zero");

    env.call_private(sender, registry.validate_handshake(sender, recipient, returned_secrets));
}

// The DH-direct flow lifts `recipient` to a curve point and fails loud if the address has no
// corresponding point. We deliberately do not replicate AES128's "king of the hill" fallback here: a fallback
// would insert a permanent note recording a handshake with an invalid recipient, polluting registry state.
#[test(should_fail_with = "recipient address is not on the curve")]
unconstrained fn handshake_to_invalid_recipient_panics() {
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    // x = 3 is a non-residue for the curve, so this address has no corresponding address point.
    let invalid_recipient = AztecAddress::from_field(3);
    assert(!invalid_recipient.is_valid());

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, invalid_recipient));
}

#[test(should_fail_with = "recipient address is not on the curve")]
unconstrained fn interactive_handshake_to_invalid_recipient_panics() {
    let (env, registry_address, sender, _, _) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let invalid_recipient = AztecAddress::from_field(3);
    let _ = env.call_private(sender, registry.interactive_handshake(sender, invalid_recipient));
}

// `interactive_handshake` must obtain the recipient's signature from a `resolveCustomRequest` resolver before
// storing anything. The TXE test environment configures no such resolver, so the call fails at the resolver hop.
#[test(should_fail_with = "no resolveCustomRequest hook is configured")]
unconstrained fn interactive_handshake_requires_a_resolver() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.interactive_handshake(sender, recipient));
}

// The handshake tag depends only on the recipient, so multiple senders posting to
// the same recipient land under the same log tag.
#[test]
unconstrained fn two_senders_to_same_recipient_share_tag() {
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

    // The handshake announcement log (index 1) is encrypted and uniformly sized.
    assert_eq(logs_first.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_second.get(1).len(), PRIVATE_LOG_SIZE_IN_FIELDS);
    assert_eq(logs_first.get(1).get(0), expected_siloed_tag);
    assert_eq(logs_second.get(1).get(0), expected_siloed_tag);

    // Different ephemeral keys produce different ciphertexts even under the same tag.
    assert(logs_first.get(1).get(1) != logs_second.get(1).get(1), "ciphertexts should differ across senders");
}

// Re-handshaking for the same `(sender, recipient)` replaces the prior current handshake and produces
// distinct `S` (hence distinct app-siloed secrets when siloed against the same caller).
#[test]
unconstrained fn rehandshake_replaces_previous_secret_and_returns_latest() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets_first = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let logs_first = txe_oracles::get_last_tx_effects().private_logs;
    assert_eq(logs_first.len(), 2);

    let secrets_second = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
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
    assert(
        secrets_first.shared != secrets_second.shared,
        "successive handshakes should produce distinct app-siloed secrets",
    );

    let retrieved = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake secret should be present");
    assert_eq(retrieved.shared, secrets_second.shared);
    assert_eq(retrieved.sender_only, secrets_second.sender_only);

    env.call_private(sender, registry.validate_handshake(sender, recipient, secrets_second));
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn rehandshake_revokes_previous_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets_first = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private(sender, registry.validate_handshake(sender, recipient, secrets_first));
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
unconstrained fn one_sender_can_have_active_handshakes_with_many_recipients() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets_a = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));
    let secrets_b = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b));

    assert(secrets_a.shared != secrets_b.shared, "separate recipient handshakes should produce distinct secrets");

    let retrieved_a = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient_a),
        )
        .expect(f"handshake secret should be present for recipient A");
    let retrieved_b = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient_b),
        )
        .expect(f"handshake secret should be present for recipient B");

    assert_eq(retrieved_a.shared, secrets_a.shared);
    assert_eq(retrieved_a.sender_only, secrets_a.sender_only);
    assert_eq(retrieved_b.shared, secrets_b.shared);
    assert_eq(retrieved_b.sender_only, secrets_b.sender_only);

    env.call_private(sender, registry.validate_handshake(sender, recipient_a, secrets_a));
    env.call_private(sender, registry.validate_handshake(sender, recipient_b, secrets_b));
}

#[test]
unconstrained fn get_app_siloed_secrets_returns_none_for_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    assert(env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(other_sender, recipient),
        )
        .is_none());
}

#[test]
unconstrained fn get_app_siloed_secrets_returns_none_for_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));

    assert(env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient_b),
        )
        .is_none());
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let _ = env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));

    env.call_private_opts(
        sender,
        CallPrivateOptions::new().with_additional_scopes([other_sender]),
        registry.validate_handshake(other_sender, recipient, secrets),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_recipient() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));
    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_b));

    env.call_private(sender, registry.validate_handshake(sender, recipient_b, secrets));
}

// `PrivateMutable`'s init nullifier is derived from the owner's nullifier
// hiding key, so a caller can only initialize the `(recipient, sender)` slot for a `sender`
// whose keys it holds. Passing a different account as the `sender` therefore fails.
#[test(should_fail_with = "Key validation request denied")]
unconstrained fn non_interactive_handshake_rejects_other_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(other_sender, recipient));
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
        registry.non_interactive_handshake(other_sender, recipient),
    );
}

#[test]
unconstrained fn get_app_siloed_secrets_differs_per_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let other_sender_secrets = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(other_sender),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake secret should be present for other caller");

    assert(
        sender_secrets.shared != other_sender_secrets.shared,
        "different callers should receive different siloed secrets",
    );
    assert(
        sender_secrets.sender_only != other_sender_secrets.sender_only,
        "different callers should receive different sender-only secrets",
    );
}

#[test]
unconstrained fn validate_handshake_accepts_secret_siloed_for_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let other_sender_secrets = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(other_sender),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake secret should be present for other caller");

    // `validate_handshake` calls `get_note` on a note owned by `sender`, which nullifies and
    // recreates and therefore needs `sender`'s nsk. Other_sender's PXE gets it via scopes.
    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, other_sender_secrets),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_secret_siloed_for_different_msg_sender() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let sender_secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private_opts(
        other_sender,
        CallPrivateOptions::new().with_additional_scopes([sender]),
        registry.validate_handshake(sender, recipient, sender_secrets),
    );
}

// Tampering with the returned secret must not validate. `+ 1` on a Field is guaranteed to produce a
// different value.
#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private(
        sender,
        registry.validate_handshake(
            sender,
            recipient,
            AppSiloedHandshakeSecrets { shared: secrets.shared + 1, sender_only: secrets.sender_only },
        ),
    );
}

#[test(should_fail_with = "no matching handshake")]
unconstrained fn validate_handshake_rejects_wrong_sender_only_secret() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    env.call_private(
        sender,
        registry.validate_handshake(
            sender,
            recipient,
            AppSiloedHandshakeSecrets { shared: secrets.shared, sender_only: secrets.sender_only + 1 },
        ),
    );
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn validate_handshake_panics_when_no_handshake() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    env.call_private(
        sender,
        registry.validate_handshake(sender, recipient, AppSiloedHandshakeSecrets { shared: 1, sender_only: 1 }),
    );
}

#[test]
unconstrained fn non_interactive_handshake_is_discovered_by_recipient() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let returned_secrets = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let discovered = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));

    assert_eq(discovered.items.len(), 1);
    assert_eq(discovered.total_count, 1);

    // The recipient derives the same app-siloed secret from the discovered eph_pk via ECDH, applying the forgery
    // protection to the ephemeral key before the shared-secret oracle the same way the discovery path does (see
    // [`forgery_protected_eph_pk`]).
    let handshake = discovered.items.get(0);
    let recipient_point = recipient.to_address_point().unwrap().inner;
    let recipient_secret = env.utility_context_at(sender, |_| {
        get_shared_secret(
            recipient,
            forgery_protected_eph_pk(handshake.eph_pk, recipient_point),
            sender,
        )
    });
    assert_eq(recipient_secret.unwrap(), returned_secrets.shared);

    // The custom sync hook falls through to `do_sync_state`, so default note discovery still works.
    let utility_secrets = env
        .execute_utility_opts(
            ExecuteUtilityOptions::new().with_from(sender),
            registry.get_app_siloed_secrets(sender, recipient),
        )
        .expect(f"handshake secret should be present");
    assert_eq(utility_secrets.shared, returned_secrets.shared);
    assert_eq(utility_secrets.sender_only, returned_secrets.sender_only);
}

#[test]
unconstrained fn handshake_to_one_recipient_not_discovered_by_another() {
    let (env, registry_address, sender, recipient_a, recipient_b) = setup_with_two_recipients();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient_a));

    let discovered_a = env.execute_utility(registry.get_non_interactive_handshakes(recipient_a, 0));
    let discovered_b = env.execute_utility(registry.get_non_interactive_handshakes(recipient_b, 0));

    assert_eq(discovered_a.items.len(), 1);
    assert_eq(discovered_b.items.len(), 0);
}

#[test]
unconstrained fn repeated_sync_does_not_refetch_logs() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let after_first = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(after_first.items.len(), 1);

    // Mock the log-retrieval oracle so we can assert it is never called on re-sync.
    let log_oracle = OracleMock::mock("aztec_utl_getLogsByTagV2");
    let _ = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(log_oracle.times_called(), 0);
    log_oracle.clear();
}

#[test]
unconstrained fn later_handshake_appends_after_cursor_advances() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let after_first = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(after_first.items.len(), 1);

    let _ = env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));
    let after_second = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(after_second.items.len(), 2);
}

// All senders to a recipient post under the same recipient-keyed tag, so a single sync discovers every handshake.
#[test]
unconstrained fn multiple_senders_discovered_for_same_recipient() {
    let (env, registry_address, sender, other_sender, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let _ = env.call_private(other_sender, registry.non_interactive_handshake(other_sender, recipient));

    let discovered = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));

    assert_eq(discovered.items.len(), 2);
    assert(
        discovered.items.get(0).eph_pk.x != discovered.items.get(1).eph_pk.x,
        "distinct senders should produce distinct ephemeral public keys",
    );
}

#[test]
unconstrained fn get_non_interactive_handshakes_paginates_across_full_pages() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let total_handshakes = MAX_HANDSHAKES_PER_PAGE + 3;
    for _ in 0..total_handshakes {
        let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    }

    let page_0 = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    let page_1 = env.execute_utility(registry.get_non_interactive_handshakes(recipient, MAX_HANDSHAKES_PER_PAGE));

    assert_eq(page_0.items.len(), MAX_HANDSHAKES_PER_PAGE);
    assert_eq(page_0.total_count, total_handshakes);
    assert_eq(page_1.items.len(), 3);
    assert_eq(page_1.total_count, total_handshakes);
}

#[test]
unconstrained fn get_non_interactive_handshakes_out_of_bounds_offset_returns_empty() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let page = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 999));
    assert_eq(page.items.len(), 0);
    assert_eq(page.total_count, 1);
}

#[test]
unconstrained fn rescan_after_cursor_retraction_does_not_duplicate_handshakes() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));

    let after_first = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(after_first.items.len(), 1);

    // Emulate a reorg that pruned back past every recorded scan but not past the handshake log: scans anchor at the
    // chain tip while handshake facts anchor at their earlier log blocks, so only the cursor facts get retracted.
    env.utility_context_at(registry_address, |_| SyncCursor::at(registry_address, recipient).clear());
    // Advance the anchor so a fact wrongly originated at the sync anchor would get a distinct origin and duplicate.
    env.mine_block();

    // With no cursor the rescan covers the full range again; re-recording the surviving handshake is a no-op.
    let after_rescan = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(after_rescan.items.len(), 1);
    assert_eq(after_rescan.items.get(0).eph_pk.x, after_first.items.get(0).eph_pk.x);
}

#[test]
unconstrained fn handshake_fact_originates_at_the_log_block() {
    let (env, registry_address, sender, _, recipient) = setup();
    let registry = HandshakeRegistry::at(registry_address);

    let _ = env.call_private(sender, registry.non_interactive_handshake(sender, recipient));
    let handshake_block = env.last_block_number();

    // Advance the chain so the sync anchor is later than the block carrying the handshake log.
    env.mine_block();
    env.mine_block();

    let discovered = env.execute_utility(registry.get_non_interactive_handshakes(recipient, 0));
    assert_eq(discovered.items.len(), 1);

    // Ephemeral arrays are frame-scoped, so read the origins and extract the value inside the registry's context.
    let origin_block_number = env.utility_context_at(registry_address, |_| {
        let origins = origin_block_numbers(registry_address, recipient);
        assert_eq(origins.len(), 1);
        origins.get(0)
    });
    // The origin must be the log's block, not the sync anchor, so a reorg retracts exactly the handshakes carried by
    // pruned blocks.
    assert_eq(origin_block_number, handshake_block);
}
