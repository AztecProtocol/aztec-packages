use crate::root::utils::compute_epoch_out_hash::compute_epoch_out_hash;
use super::TestBuilder;
use types::{
    constants::{AZTEC_MAX_EPOCH_DURATION, CHECKPOINT_MERGE_ROLLUP_VK_INDEX},
    tests::utils::pad_end,
};

// Note: We only test a few cases here to ensure the code path is triggered. More comprehensive tests for validating
// consecutive rollups can be found in `checkpoint_merge/tests/consecutive_checkpoint_rollups_tests.nr`.

#[test]
fn correct_default_inputs() {
    let builder = TestBuilder::default();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_constants() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the left rollup.
    builder.left_rollup.constants.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archives() {
    let mut builder = TestBuilder::default();

    // Tweak the previous_archive of the right rollup.
    builder.right_rollup.previous_archive.root += 1;

    builder.execute_and_fail();
}

#[test]
fn correct_epoch_out_hash() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        4,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    builder.left_rollup.out_hashes[0] = 11;
    builder.left_rollup.out_hashes[1] = 0;
    builder.left_rollup.out_hashes[2] = 0;
    builder.left_rollup.out_hashes[3] = 44;
    builder.right_rollup.out_hashes[0] = 0;
    builder.right_rollup.out_hashes[1] = 66;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let checkpoint_out_hashes: [Field; AZTEC_MAX_EPOCH_DURATION] = pad_end([11, 0, 0, 44, 0, 66]);
    let expected_out_hash = compute_epoch_out_hash(checkpoint_out_hashes);
    assert_eq(pi.out_hash, expected_out_hash);

    // The following is generated from `yarn-project/stdlib/src/messaging/out_hash.test.ts`
    let out_hash_from_ts = 0x00f83de1d6645701e7faa407066fad314e8c42676338856beb5da9d4062fbb28;
    assert_eq(expected_out_hash, out_hash_from_ts);
}
