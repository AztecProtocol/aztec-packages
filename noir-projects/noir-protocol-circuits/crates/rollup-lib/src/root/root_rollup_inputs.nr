use crate::{
    abis::previous_rollup_block_data::PreviousRollupBlockData,
    components, root::root_rollup_public_inputs::RootRollupPublicInputs
};

// TODO(Miranda): Handle vks
// global ALLOWED_PREVIOUS_CIRCUITS = [
//     BASE_ROLLUP_INDEX,
//     MERGE_ROLLUP_INDEX,
// ];

struct RootRollupInputs {
    previous_rollup_data : [PreviousRollupBlockData; 2],
}

impl Empty for RootRollupInputs {
    fn empty() -> Self {
        RootRollupInputs {
            previous_rollup_data : [PreviousRollupBlockData::empty(); 2],
        }
    }
}

impl RootRollupInputs {
    pub fn root_rollup_circuit(self) -> RootRollupPublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify();
            // TODO(#7410) we need the tube vk to reinstate this
            // self.previous_rollup_data[0].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify();
            // TODO(#7410) we need the tube vk to reinstate this
            // self.previous_rollup_data[1].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

        components::assert_prev_block_rollups_follow_on_from_each_other(left, right);

        let out_hash = components::compute_blocks_out_hash(self.previous_rollup_data);

        let fees = components::accumulate_blocks_fees(left, right);

        RootRollupPublicInputs {
            previous_archive: left.previous_archive,
            end_archive: right.new_archive,
            end_block_hash: right.end_block_hash,
            end_timestamp: right.end_global_variables.timestamp,
            end_block_number: right.end_global_variables.block_number,
            out_hash,
            fees
        }
    }
}
