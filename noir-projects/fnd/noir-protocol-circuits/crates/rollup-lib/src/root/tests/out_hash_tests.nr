use super::TestBuilder;

#[test(should_fail_with = "Epoch did not start with empty out hash tree root")]
fn non_empty_out_hash_root() {
    let mut builder = TestBuilder::default();

    // Tweak the root of the previous_out_hash in the left rollup.
    builder.left_rollup.previous_out_hash.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Epoch did not start with zero out hash tree index")]
fn non_zero_next_available_leaf_index() {
    let mut builder = TestBuilder::default();

    // Tweak the next_available_leaf_index in the left rollup.
    builder.left_rollup.previous_out_hash.next_available_leaf_index = 1;

    builder.execute_and_fail();
}
