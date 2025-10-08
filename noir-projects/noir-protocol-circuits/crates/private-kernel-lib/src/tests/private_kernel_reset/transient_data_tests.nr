use super::TestBuilder;
use types::tests::utils::assert_array_eq;

// Note: Only a few cases are tested here to ensure that the code path to the `TransientDataValidator` is reached.
// More comprehensive tests for squashing and propagating data can be found in `reset/transient_data/tests`.

#[test]
fn squash_transient_data_and_propagate_kept_items() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes_with_logs(2);
    builder.previous_kernel.append_note_hashes(3);
    builder.previous_kernel.append_private_logs(1);
    builder.previous_kernel.append_nullifiers(4);

    // The nullifier at index 3 is nullifying the note hash at index 0;
    builder.nullify_pending_note_hash(3, 0);
    // The nullifier at index 1 is nullifying the note hash at index 2;
    builder.nullify_pending_note_hash(1, 2);

    let note_hashes = builder.previous_kernel.note_hashes.storage();
    let nullifiers = builder.previous_kernel.nullifiers.storage();
    let private_logs = builder.previous_kernel.private_logs.storage();
    let public_inputs = builder.execute();

    // The note hashes at index 0 and 2 are squashed.
    assert_array_eq(
        public_inputs.end.note_hashes.array,
        [note_hashes[1], note_hashes[3], note_hashes[4]],
    );

    // The nullifier at index 1 and 3 are squashed.
    assert_array_eq(
        public_inputs.end.nullifiers.array,
        [nullifiers[0], nullifiers[2]],
    );

    // The log at index 0 are squashed along with the note hash at index 0.
    assert_array_eq(
        public_inputs.end.private_logs.array,
        [private_logs[1], private_logs[2]],
    );
}

#[test(should_fail_with = "Value of the hinted transient note hash does not match")]
fn wrong_transient_nullifier_index_for_note_hash() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes(1);
    builder.previous_kernel.append_nullifiers(2);

    // The nullifier at index 1 is nullifying the note hash at index 0;
    builder.nullify_pending_note_hash(1, 0);
    // Change the hint to point to a different nullifier.
    builder.transient_data_squashing_hints[0].nullifier_index = 0;

    builder.failed();
}
