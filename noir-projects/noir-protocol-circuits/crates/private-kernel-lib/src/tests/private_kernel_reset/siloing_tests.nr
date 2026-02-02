use super::TestBuilder;
use types::tests::utils::{assert_array_eq, pad_end};

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
fn siloing_for_private_only_tx_without_accumulated_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.claimed_first_nullifier = 13579;

    builder.previous_kernel.is_private_only = true;

    builder.previous_kernel.append_note_hashes(1);

    let note_hash = builder.previous_kernel.note_hashes.get(0);

    let pi = builder.execute_with_siloing();

    // Even though no nullifiers are present, the note hash can still be uniquified (with the claimed first nullifier).
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

#[test(should_fail_with = "Note hashes have been siloed in a previous reset")]
fn siloing_note_hashes_again_fails() {
    let mut builder = TestBuilder::new();

    // The note hash at index 0 is siloed.
    builder.previous_kernel.append_siloed_note_hashes(1);
    // The rest of the note hashes are not siloed.
    builder.previous_kernel.append_note_hashes(2);

    let _ = builder.execute_with_siloing();
}

#[test(should_fail_with = "Nullifiers have been siloed in a previous reset")]
fn siloing_nullifiers_again() {
    let mut builder = TestBuilder::new();

    // The first 2 nullifiers are siloed.
    builder.previous_kernel.append_siloed_nullifiers(2);
    // The rest of the nullifiers are not siloed.
    builder.previous_kernel.append_nullifiers(2);

    let nullifiers = builder.previous_kernel.nullifiers.storage();

    let pi = builder.execute_with_siloing();

    let siloed_nullifiers = builder.compute_output_nullifiers([nullifiers[2], nullifiers[3]]);
    assert_array_eq(
        pi.end.nullifiers.array,
        [nullifiers[0], nullifiers[1], siloed_nullifiers[0], siloed_nullifiers[1]],
    );
}

#[test(should_fail_with = "Private logs have been siloed in a previous reset")]
fn siloing_private_logs_again() {
    let mut builder = TestBuilder::new();

    // The first 2 logs are siloed.
    builder.previous_kernel.append_siloed_private_logs(2);
    // The rest of the logs are not siloed.
    builder.previous_kernel.append_private_logs(2);

    let private_logs = builder.previous_kernel.private_logs.storage();

    let pi = builder.execute_with_siloing();

    let siloed_logs = builder.compute_output_private_logs([private_logs[2], private_logs[3]]);
    assert_array_eq(
        pi.end.private_logs.array,
        [private_logs[0], private_logs[1], siloed_logs[0], siloed_logs[1]],
    );
}
