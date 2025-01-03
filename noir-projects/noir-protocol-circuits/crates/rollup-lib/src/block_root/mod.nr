mod block_root_rollup_inputs;
mod empty_block_root_rollup_inputs;

// Re-exports
pub use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
pub use block_root_rollup_inputs::BlockRootRollupInputs;
pub use empty_block_root_rollup_inputs::EmptyBlockRootRollupInputs;

mod tests {
    use crate::tests::block_root_rollup_inputs::default_block_root_rollup_inputs;
    use dep::types::hash::accumulate_sha256;
    use std::hash::poseidon2::Poseidon2;

    #[test]
    fn check_block_hashes_empty_blocks() {
        let expected_out_hash = accumulate_sha256([1, 2]);

        let inputs = default_block_root_rollup_inputs();
        let output = inputs.block_root_rollup_circuit();

        // check out hash
        assert_eq(output.out_hash, expected_out_hash);
    }

    #[test]
    fn end_constants() {
        let inputs = default_block_root_rollup_inputs();
        let outputs = inputs.block_root_rollup_circuit();

        assert(outputs.previous_archive.eq(
            inputs.previous_rollup_data[0]
                .base_or_merge_rollup_public_inputs
                .constants
                .last_archive,
        ));
        assert(outputs.start_global_variables.eq(
            inputs.previous_rollup_data[1]
                .base_or_merge_rollup_public_inputs
                .constants
                .global_variables,
        ));
    }

    #[test]
    fn check_blob() {
        // Note: this test will not run in unconstrained, because it reaches the foreign call
        // TODO(#10323): remove the oracle and switch this test to unconstrained
        let inputs = default_block_root_rollup_inputs();
        let outputs = inputs.block_root_rollup_circuit();

        let mut expected_sponge =
            inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob;
        expected_sponge.absorb([1, 2], expected_sponge.expected_fields);

        assert(expected_sponge.eq(
            inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.end_sponge_blob,
        ));

        let hashed_tx_effects = expected_sponge.squeeze();
        let expected_z = Poseidon2::hash(
            [
                hashed_tx_effects,
                inputs.blob_commitments[0].inner[0],
                inputs.blob_commitments[0].inner[1],
            ],
            3,
        );

        assert(outputs.blob_public_inputs[0].inner[0].z == expected_z);
    }

    #[test(should_fail_with = "block's first blob sponge was not empty")]
    unconstrained fn check_blob_empty() {
        let mut inputs = default_block_root_rollup_inputs();
        inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.start_sponge_blob.fields =
            1;
        let _ = inputs.block_root_rollup_circuit();
    }
}
