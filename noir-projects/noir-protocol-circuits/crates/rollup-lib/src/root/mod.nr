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

        assert_eq(outputs.vk_tree_root, left.vk_tree_root);
        assert_eq(outputs.vk_tree_root, right.vk_tree_root);

        assert_eq(outputs.protocol_contract_tree_root, left.protocol_contract_tree_root);
        assert_eq(outputs.protocol_contract_tree_root, right.protocol_contract_tree_root);

        assert_eq(outputs.prover_id, left.prover_id);
        assert_eq(outputs.prover_id, right.prover_id);

        assert_array_eq(
            outputs.blob_public_inputs,
            [left.blob_public_inputs[0], right.blob_public_inputs[0]],
        );
    }
}
