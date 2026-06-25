use crate::components::previous_kernel_for_tail_validator::validate_previous_kernel_for_tail;
use super::TestBuilder;
use protocol_test_utils::{assert_array_eq, pad_end};
use types::{address::AztecAddress, traits::FromField};

#[test]
fn squashing_and_siloing_and_ordering() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.set_protocol_nullifier();

    builder.previous_kernel.append_note_hashes_with_logs(1);
    builder.previous_kernel.append_private_logs(1); // Log at index 1 is a non-note log.
    builder.previous_kernel.append_note_hashes_with_logs(2);
    builder.previous_kernel.append_private_logs(1); // Log at index 4 is a non-note log.
    builder.previous_kernel.append_note_hashes(1);
    builder.previous_kernel.append_nullifiers(4);

    // Get ordered items before shuffling.
    let note_hashes = builder.previous_kernel.note_hashes.storage();
    let nullifiers = builder.previous_kernel.nullifiers.storage();
    let private_logs = builder.previous_kernel.private_logs.storage();
    // Shuffle.
    builder.previous_kernel.note_hashes = BoundedVec::from_parts_unchecked(
        pad_end(
            [note_hashes[2], note_hashes[0], note_hashes[3], note_hashes[1]],
        ),
        4,
    );
    builder.previous_kernel.nullifiers = BoundedVec::from_parts_unchecked(
        pad_end([nullifiers[1], nullifiers[2], nullifiers[0], nullifiers[3]]),
        4,
    );
    builder.previous_kernel.private_logs = BoundedVec::from_parts_unchecked(
        pad_end([
            private_logs[4],
            private_logs[0],
            private_logs[3],
            private_logs[1],
            private_logs[2],
        ]),
        5,
    );

    // The nullifier at index 1 (original index 2) is nullifying the note hash at index 3 (original index 1).
    builder.nullify_pending_note_hash(1, 3);

    let pi = builder.execute_with_siloing();

    // The note hash at index 1 is squashed.
    assert_array_eq(
        pi.end.note_hashes.array,
        builder.compute_output_note_hashes([note_hashes[0], note_hashes[2], note_hashes[3]]),
    );
    assert_eq(pi.end.note_hashes.length, 3);

    // The nullifier at index 2 is squashed.
    assert_array_eq(
        pi.end.nullifiers.array,
        builder.compute_output_nullifiers([nullifiers[0], nullifiers[1], nullifiers[3]]),
    );
    assert_eq(pi.end.nullifiers.length, 3);

    // The note log at index 2 is squashed along with the note hash at index 1.
    assert_array_eq(
        pi.end.private_logs.array,
        builder.compute_output_private_logs([
            private_logs[0],
            private_logs[1],
            private_logs[3],
            private_logs[4],
        ]),
    );
    assert_eq(pi.end.private_logs.length, 4);
}

#[test]
fn siloing_for_private_only_tx_with_only_protocol_nullifier() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.is_private_only = true;
    builder.previous_kernel.set_protocol_nullifier();

    builder.previous_kernel.append_note_hashes(1);

    let note_hash = builder.previous_kernel.note_hashes.get(0);

    let pi = builder.execute_with_siloing();

    let unique_note_hash = builder.compute_output_unique_siloed_note_hash(note_hash, 0);
    assert_array_eq(pi.end.note_hashes.array, [unique_note_hash]);
}

#[test]
fn siloing_for_private_only_tx_with_non_zero_revertible_counter() {
    let mut builder = TestBuilder::new();

    // The tx is private-only, so we must uniquify all note hashes with nonces.
    builder.previous_kernel.is_private_only = true;
    // The claimed counter is set to a non-zero value, which would make the note hash revertible if the tx was not private-only.
    builder.previous_kernel.claimed_revertible_counter = 2;
    builder.previous_kernel.counter = 3;

    builder.previous_kernel.append_note_hashes(1);
    let note_hash = builder.previous_kernel.note_hashes.get(0);
    // Counter > claimed_revertible_counter implies it's revertible, but will be ignored since the tx is private-only.
    assert(note_hash.inner.counter > builder.previous_kernel.claimed_revertible_counter);

    let pi = builder.execute_with_siloing();

    // This note hash is non-revertible and should be uniquified.
    let unique_note_hash = builder.compute_output_unique_siloed_note_hash(note_hash, 0);
    assert_array_eq(pi.end.note_hashes.array, [unique_note_hash]);
}

#[test]
fn siloing_before_min_revertible_side_effect_counter_is_set() {
    let mut builder = TestBuilder::new();

    // The tx is not private-only, so we can't uniquify revertible note hashes with nonces.
    builder.previous_kernel.is_private_only = false;
    // The actual counter is set in a later iteration.
    assert_eq(builder.previous_kernel.min_revertible_side_effect_counter, 0);

    // This note hash is non-revertible and should be uniquified.
    builder.previous_kernel.append_note_hashes(1);
    let non_revertible_note_hash = builder.previous_kernel.note_hashes.get(0);

    // The circuit should use the claimed counter to determine if the note hash is revertible.
    builder.previous_kernel.claimed_revertible_counter = builder.previous_kernel.counter + 999;
    builder.previous_kernel.counter = builder.previous_kernel.claimed_revertible_counter + 1;

    // This note hash is revertible and should be siloed.
    builder.previous_kernel.append_note_hashes(1);
    let revertible_note_hash = builder.previous_kernel.note_hashes.get(1);

    let pi = builder.execute_with_siloing();

    let unique_siloed_note_hash =
        builder.compute_output_unique_siloed_note_hash(non_revertible_note_hash, 0);
    let siloed_note_hash = builder.compute_output_siloed_note_hash(revertible_note_hash);
    assert_array_eq(
        pi.end.note_hashes.array,
        [unique_siloed_note_hash, siloed_note_hash],
    );
}

// The note-nonce base must be the tx's first *surviving* nullifier, never a squashed one.
//
// Case B (no protocol nullifier injected): the first emitted nullifier `N0` is part of a transient
// (note_hash, nullifier) pair, so this terminal reset squashes it and it is never inserted into the
// nullifier tree. The surviving note hash must take its nonce from the surviving nullifier `N1`,
// which is tree-inserted and therefore globally unique. A nonce derived from the never-inserted `N0`
// would let two txs emit-and-squash the same `N0` and produce colliding unique note hashes for
// identical note content (Faerie-Gold).
#[test]
fn note_nonce_derives_from_surviving_first_nullifier() {
    let mut builder = TestBuilder::new();

    // Private-only, so all note hashes are uniquified with nonces (no revertible carve-out).
    builder.previous_kernel.is_private_only = true;

    // C0 (will be squashed) and C1 (survivor).
    builder.previous_kernel.append_note_hashes(2);
    // N0 is the tx's first nullifier (no protocol nullifier injected); N1 survives.
    builder.previous_kernel.append_nullifiers(2);

    let note_hashes = builder.previous_kernel.note_hashes.storage();
    let nullifiers = builder.previous_kernel.nullifiers.storage();

    // Make (C0, N0) a transient pair: the first nullifier N0 nullifies C0.
    builder.nullify_pending_note_hash(0, 0);

    let pi = builder.execute_with_siloing();

    // N0 is squashed out: only N1 remains in the output (so only N1 is tree-inserted).
    assert_array_eq(
        pi.end.nullifiers.array,
        builder.compute_output_nullifiers([nullifiers[1]]),
    );
    assert_eq(pi.end.nullifiers.length, 1);

    // The survivor C1's nonce derives from the surviving first nullifier N1, NOT the squashed N0.
    assert_array_eq(
        pi.end.note_hashes.array,
        [builder.compute_output_unique_siloed_note_hash_with_first_nullifier(
            note_hashes[1],
            0,
            nullifiers[1],
        )],
    );
    assert_eq(pi.end.note_hashes.length, 1);
}

// The note-nonce base (`output.end.nullifiers[0]`) must never be an empty slot. If every nullifier
// is squashed while a note hash survives, the post-squash output has zero nullifiers and index 0 is
// empty, which would give a degenerate (zero) nonce base shared across txs.
//
// The reset itself does NOT reject this - it would happily uniquify the survivor against the empty
// slot. The guarantee lives entirely in the tail: `validate_previous_kernel_for_tail` asserts
// `end.nullifiers.length != 0` on the post-squash output. This test pins that boundary by running
// the reset and then the tail check exactly as `private_kernel_reset_tail` does, and asserting the
// tail rejects the 0-survivor output. (No nullifier padding is supplied, so the output length is
// truly zero; supplying padding would instead yield a real, tree-inserted nonce base.)
#[test(should_fail_with = "TX must create at least one nullifier")]
fn terminal_reset_squashing_every_nullifier_is_rejected_by_tail() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.is_private_only = true;
    builder.previous_kernel.set_fee_payer(AztecAddress::from_field(234234));

    // C0 (will be squashed) and C1 (survivor).
    builder.previous_kernel.append_note_hashes(2);
    // N0 is the tx's only nullifier.
    builder.previous_kernel.append_nullifiers(1);

    // Make (C0, N0) a transient pair, so the terminal reset squashes the only nullifier.
    builder.nullify_pending_note_hash(0, 0);

    let output = builder.execute_with_siloing();

    // The reset accepted a 0-nullifier output; the tail is what rejects it.
    validate_previous_kernel_for_tail(output, false);
}

#[test(should_fail_with = "Propagated note hash does not match")]
fn extra_note_hash_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    // 1 extra note hash beyond the claimed length.
    builder.previous_kernel.append_note_hashes(2);
    let note_hashes = builder.previous_kernel.note_hashes.storage();
    builder.previous_kernel.note_hashes = BoundedVec::from_parts_unchecked(note_hashes, 1);

    let _ = builder.execute_with_siloing();

    // This test fails because the composer doesn't add siloed note hashes beyond the claimed length, but the transient
    // data validator processes all items within NOTE_HASH_SILOING_AMOUNT and expects a siloed note hash in the output.
    // If the output does contain the extra note hashes, the validator will still catch it and fail.
    // See the test propagated_note_hashes_tests.nr > previous_note_hashes_beyond_claimed_length.
}

#[test(should_fail_with = "Propagated nullifier does not match")]
fn extra_nullifiers_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    // 1 extra nullifier beyond the claimed length.
    builder.previous_kernel.append_nullifiers(2);
    let nullifiers = builder.previous_kernel.nullifiers.storage();
    builder.previous_kernel.nullifiers = BoundedVec::from_parts_unchecked(nullifiers, 1);

    let _ = builder.execute_with_siloing();

    // This test fails because the composer doesn't add siloed nullifiers beyond the claimed length, but the transient
    // data validator processes all items within NULLIFIER_SILOING_AMOUNT and expects a siloed nullifier in the output.
    // If the output does contain extra nullifiers, the validator will still catch it and fail.
    // See the test propagated_nullifiers_tests.nr > previous_nullifiers_beyond_claimed_length.
}

#[test(should_fail_with = "Propagated private log does not match")]
fn extra_private_logs_beyond_claimed_length() {
    let mut builder = TestBuilder::new();

    // 1 extra private log beyond the claimed length.
    builder.previous_kernel.append_private_logs(2);
    let private_logs = builder.previous_kernel.private_logs.storage();
    builder.previous_kernel.private_logs = BoundedVec::from_parts_unchecked(private_logs, 1);

    let _ = builder.execute_with_siloing();

    // This test fails because the composer doesn't add siloed private logs beyond the claimed length, but the transient
    // data validator processes all items within PRIVATE_LOG_SILOING_AMOUNT and expects a siloed log in the output.
    // If the output does contain extra private logs, the validator will still catch it and fail.
    // See the test propagated_private_logs_tests.nr > previous_private_logs_beyond_claimed_length.
}
