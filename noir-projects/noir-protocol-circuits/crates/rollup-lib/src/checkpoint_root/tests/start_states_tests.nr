use super::TestBuilder;

#[test]
fn correct_default_inputs() {
    let builder = TestBuilder::default();
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test(should_fail_with = "The start blob sponge was not empty")]
fn start_sponge_blob_not_empty() {
    let mut builder = TestBuilder::default();

    // Absorb a field to the start sponge blob.
    builder.left_rollup.start_sponge_blob.absorb([123], 1);

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_l1_to_l2_message_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the root of the l1_to_l2_message_tree on the left rollup.
    builder.left_rollup.start_state.l1_to_l2_message_tree.root += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_l1_to_l2_message_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default();

    // Tweak the next available leaf index of the l1_to_l2_message_tree on the left rollup.
    builder.left_rollup.start_state.l1_to_l2_message_tree.next_available_leaf_index += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_note_hash_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the root of the note_hash_tree on the left rollup.
    builder.left_rollup.start_state.partial.note_hash_tree.root += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_note_hash_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default();

    // Tweak the next available leaf index of the note_hash_tree on the left rollup.
    builder.left_rollup.start_state.partial.note_hash_tree.next_available_leaf_index += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_nullifier_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the root of the nullifier_tree on the left rollup.
    builder.left_rollup.start_state.partial.nullifier_tree.root += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_nullifier_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default();

    // Tweak the next available leaf index of the nullifier_tree on the left rollup.
    builder.left_rollup.start_state.partial.nullifier_tree.next_available_leaf_index += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_public_data_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the root of the public_data_tree on the left rollup.
    builder.left_rollup.start_state.partial.public_data_tree.root += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start state of the checkpoint does not match the state in the previous block header")]
fn mismatch_public_data_tree_next_available_leaf_index() {
    let mut builder = TestBuilder::default();

    // Tweak the next available leaf index of the public_data_tree on the left rollup.
    builder.left_rollup.start_state.partial.public_data_tree.next_available_leaf_index += 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start timestamp must be after the previous block's timestamp")]
fn start_timestamp_before_previous_block_timestamp() {
    let mut builder = TestBuilder::default();

    // Tweak the start timestamp of the left rollup to be before the previous block's timestamp.
    let previous_block_header = builder.hints.previous_block_header;
    builder.left_rollup.start_timestamp = previous_block_header.global_variables.timestamp - 1;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "The start timestamp must be after the previous block's timestamp")]
fn start_timestamp_equals_previous_block_timestamp() {
    let mut builder = TestBuilder::default();

    // Tweak the start timestamp of the left rollup to be equal to the previous block's timestamp.
    let previous_block_header = builder.hints.previous_block_header;
    builder.left_rollup.start_timestamp = previous_block_header.global_variables.timestamp;

    builder.execute_with_mock_and_fail();
}

#[test(should_fail_with = "Hash of the previous block header is not the last leaf in the archive tree")]
fn previous_block_timestamp_not_in_archive() {
    let mut builder = TestBuilder::default();

    // Tweak the archive root so that the previous block header hash is no longer a leaf in the archive tree.
    builder.left_rollup.previous_archive.root += 1;

    builder.execute_with_mock_and_fail();
}
