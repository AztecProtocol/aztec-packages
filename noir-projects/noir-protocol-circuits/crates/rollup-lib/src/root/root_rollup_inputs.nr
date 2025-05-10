use crate::{
    abis::previous_rollup_block_data::PreviousRollupBlockData, components,
    root::root_rollup_public_inputs::RootRollupPublicInputs,
};
use types::{
    constants::{
        AZTEC_MAX_EPOCH_DURATION, BLOCK_MERGE_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
        BLOCK_ROOT_ROLLUP_INDEX, BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX, PROOF_TYPE_ROOT_ROLLUP_HONK,
    },
    traits::Empty,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 4] = [
    BLOCK_ROOT_ROLLUP_INDEX,
    BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
    BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
    BLOCK_MERGE_ROLLUP_INDEX,
];

pub struct RootRollupInputs {
    pub previous_rollup_data: [PreviousRollupBlockData; 2],
    pub prover_id: Field,
}

impl Empty for RootRollupInputs {
    fn empty() -> Self {
        RootRollupInputs {
            previous_rollup_data: [PreviousRollupBlockData::empty(); 2],
            prover_id: 0,
        }
    }
}

impl RootRollupInputs {
    pub fn root_rollup_circuit(self) -> RootRollupPublicInputs {
        // Verify the previous rollup proofs
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollup_data[0].verify(PROOF_TYPE_ROOT_ROLLUP_HONK); // root rollup honk proof type so we do full IPA recursive verifier
            self.previous_rollup_data[0].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

            self.previous_rollup_data[1].verify(PROOF_TYPE_ROOT_ROLLUP_HONK); // root rollup honk proof type so we do full IPA recursive verifier
            self.previous_rollup_data[1].validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        }

        let left = self.previous_rollup_data[0].block_root_or_block_merge_public_inputs;
        let right = self.previous_rollup_data[1].block_root_or_block_merge_public_inputs;

        // TODO(#7346): Constrain block rollup structure
        // For full wonkiness (no wasted proving of padding blocks for any number of blocks, but more complex hash recalculation):
        //  components::assert_blocks_filled_from_left(left, right);
        // For variable height but balanced tree (no wasted proving only for number of blocks = power of 2, simpler hash recalculation):
        //  assert(left.num_blocks == right.num_blocks)
        //  if (num_blocks == 1) { assert(vk_witness.index == BLOCK_ROOT_ROLLUP_INDEX) } else { assert(vk_witness.index == BLOCK_MERGE_ROLLUP_INDEX)}
        // ^ Where instead of num_txs, use num_blocks = (end_global_variables.block_number - start_global_variables.block_number) + 1
        components::assert_prev_block_rollups_follow_on_from_each_other(left, right);

        // Make sure that the total number of blocks in the epoch does not exceed the max, preventing the accumulated
        // data below (proposed_block_header_hashes, fees, blob_public_inputs) from being truncated.
        let num_blocks = (right.end_global_variables.block_number as u32)
            - (left.start_global_variables.block_number as u32)
            + 1;
        assert(num_blocks <= AZTEC_MAX_EPOCH_DURATION, "too many blocks in root rollup");

        let proposed_block_header_hashes =
            components::accumulate_proposed_block_header_hashes(left, right);

        let fees = components::accumulate_blocks_fees(left, right);

        // TODO: We need to eventually accumulate blob info to a single BlobPublicInputs instance which will verify multiple blobs in one call
        // For now, we do them individually
        // How we accumulate is being worked on by @Mike
        // let blob_public_inputs = left.blob_public_inputs.accumulate(right.blob_public_inputs);
        let blob_public_inputs = components::accumulate_blob_public_inputs(left, right);

        RootRollupPublicInputs {
            previous_archive_root: left.previous_archive.root,
            end_archive_root: right.new_archive.root,
            proposed_block_header_hashes,
            fees,
            chain_id: right.end_global_variables.chain_id,
            version: right.end_global_variables.version,
            vk_tree_root: left.vk_tree_root,
            protocol_contract_tree_root: left.protocol_contract_tree_root,
            prover_id: self.prover_id,
            blob_public_inputs,
        }
    }
}
