pub mod root_rollup_inputs;
pub mod root_rollup_public_inputs;

// Re-exports
pub use root_rollup_inputs::RootRollupInputs;
pub use root_rollup_public_inputs::RootRollupPublicInputs;

mod tests {
    use crate::tests::root_rollup_inputs::default_root_rollup_inputs;
    use dep::types::hash::accumulate_sha256;

    #[test]
    fn check_block_hashes_empty_blocks() {
        let expected_out_hash = accumulate_sha256([1, 2]);

        let inputs = default_root_rollup_inputs();
        let outputs = inputs.root_rollup_circuit();

        // check out hash
        assert_eq(outputs.out_hash, expected_out_hash);
    }

    #[test]
    fn end_state() {
        let inputs = default_root_rollup_inputs();
        let outputs = inputs.root_rollup_circuit();

        assert(outputs.previous_archive.eq(
            inputs.previous_rollup_data[0]
                .block_root_or_block_merge_public_inputs
                .previous_archive,
        ));

        assert(outputs.end_archive.eq(
            inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.new_archive,
        ));

        assert(outputs.end_timestamp.eq(
            inputs.previous_rollup_data[1]
                .block_root_or_block_merge_public_inputs
                .end_global_variables
                .timestamp,
        ));
    }

    #[test(should_fail_with = "Epoch did not start with empty blob state.")]
    unconstrained fn non_empty_start_blob_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.start_blob_accumulator.z +=
            1;
        let _output = inputs.root_rollup_circuit();
    }

    #[test(should_fail_with = "Final blob challenge z mismatch.")]
    unconstrained fn blob_different_challenge_z_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.z +=
            1;
        let _output = inputs.root_rollup_circuit();
    }

    #[test(should_fail_with = "Final blob challenge gamma mismatch.")]
    unconstrained fn blob_different_challenge_gamma_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.gamma +=
            1;
        let _output = inputs.root_rollup_circuit();
    }
}
