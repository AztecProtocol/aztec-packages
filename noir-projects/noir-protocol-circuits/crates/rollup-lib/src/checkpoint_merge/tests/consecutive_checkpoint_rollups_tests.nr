use super::TestBuilder;

#[test]
fn correct_default_inputs() {
    let builder = TestBuilder::default();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::default();

    // Tweak the chain_id of the right rollup.
    builder.right_rollup.constants.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_version() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the right rollup.
    builder.right_rollup.constants.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_vk_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the vk_tree_root of the right rollup.
    builder.right_rollup.constants.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn mismatch_vk_tree_root_on_left_rollup() {
    let mut builder = TestBuilder::default();

    // Tweak the vk_tree_root of the left rollup.
    builder.left_rollup.constants.vk_tree_root += 1;

    // Note that the error message is different to the test above where value is changed on the right rollup.
    // Because we validate the vk against the vk_tree_root from the left rollup.
    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_protocol_contracts_hash() {
    let mut builder = TestBuilder::default();

    // Tweak the protocol_contracts_hash of the right rollup.
    builder.right_rollup.constants.protocol_contracts_hash += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_prover_id() {
    let mut builder = TestBuilder::default();

    // Tweak the prover_id of the right rollup.
    builder.right_rollup.constants.prover_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archive_roots() {
    let mut builder = TestBuilder::default();

    // Tweak the previous archive root of the right rollup.
    builder.right_rollup.previous_archive.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archive_next_available_leaf_indices() {
    let mut builder = TestBuilder::default();

    // Tweak the next_available_leaf_index of the right rollup.
    builder.right_rollup.previous_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched blob accumulators: expected right.start_blob_accumulator to match left.end_blob_accumulator")]
fn non_consecutive_blob_accumulators() {
    let mut builder = TestBuilder::default();

    // Tweak the start_blob_accumulator of the right rollup.
    builder.right_rollup.start_blob_accumulator.blob_commitments_hash_acc += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched final blob challenges of an epoch in checkpoint rollups")]
fn mismatch_final_blob_challenges_z() {
    let mut builder = TestBuilder::default();

    // Tweak the final_blob_challenges of the right rollup.
    builder.right_rollup.final_blob_challenges.z += 1;

    builder.execute_and_fail();
}
