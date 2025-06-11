pub mod root_rollup_inputs;
pub mod root_rollup_public_inputs;

// Re-exports
pub use root_rollup_inputs::RootRollupInputs;
pub use root_rollup_public_inputs::RootRollupPublicInputs;

mod tests {
    use crate::tests::root_rollup_inputs::default_root_rollup_inputs;
    use dep::types::tests::utils::assert_array_eq;

    #[test]
    fn root_rollup_end_state() {
        let inputs = default_root_rollup_inputs();
        let outputs = inputs.root_rollup_circuit();

        let left = inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

        assert_eq(outputs.previous_archive_root, left.previous_archive.root);

        assert_eq(outputs.end_archive_root, right.new_archive.root);

        assert_array_eq(
            outputs.proposed_block_header_hashes,
            [left.proposed_block_header_hashes[0], right.proposed_block_header_hashes[0]],
        );

        assert_array_eq(outputs.fees, [left.fees[0], right.fees[0]]);

        assert_eq(outputs.chain_id, left.start_global_variables.chain_id);
        assert_eq(outputs.chain_id, right.end_global_variables.chain_id);

        assert_eq(outputs.version, left.start_global_variables.version);
        assert_eq(outputs.version, right.end_global_variables.version);

        assert_eq(outputs.vk_tree_root, left.constants.vk_tree_root);
        assert_eq(outputs.vk_tree_root, right.constants.vk_tree_root);

        assert_eq(outputs.protocol_contract_tree_root, left.constants.protocol_contract_tree_root);
        assert_eq(outputs.protocol_contract_tree_root, right.constants.protocol_contract_tree_root);

        assert_eq(outputs.prover_id, left.constants.prover_id);
        assert_eq(outputs.prover_id, right.constants.prover_id);

        assert_eq(
            outputs.blob_public_inputs,
            right.blob_public_inputs.end_blob_accumulator.finalize_and_validate(
                left.blob_public_inputs.final_blob_challenges,
            ),
        );
    }

    #[test(should_fail_with = "Epoch did not start with empty blob state.")]
    unconstrained fn non_empty_start_blob_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[0].block_root_or_block_merge_public_inputs.blob_public_inputs.start_blob_accumulator.z_acc +=
            1;
        let _output = inputs.root_rollup_circuit();
    }

    #[test(should_fail_with = "Final blob challenge z mismatch.")]
    unconstrained fn blob_different_challenge_z_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.z_acc +=
            1;
        let _output = inputs.root_rollup_circuit();
    }

    #[test(should_fail_with = "Final blob challenge gamma mismatch.")]
    unconstrained fn blob_different_challenge_gamma_fails() {
        let mut inputs = default_root_rollup_inputs();
        inputs.previous_rollup_data[1].block_root_or_block_merge_public_inputs.blob_public_inputs.end_blob_accumulator.gamma_acc +=
            1;
        let _output = inputs.root_rollup_circuit();
    }
}
