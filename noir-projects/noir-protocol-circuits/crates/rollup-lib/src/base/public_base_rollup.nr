use crate::{
    abis::{
    base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs,
    constant_rollup_data::ConstantRollupData
},
    base::{
    base_rollup_inputs::{BaseRollupInputs, KernelData},
    components::{avm_proof_data::AvmProofData, public_tube_data::PublicTubeData},
    state_diff_hints::StateDiffHints
}
};
use dep::types::{
    constants::{ARCHIVE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, TUBE_VK_INDEX},
    data::{public_data_hint::PublicDataHint, PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    merkle_tree::MembershipWitness, partial_state_reference::PartialStateReference
};

global ALLOWED_PREVIOUS_CIRCUITS = [
    TUBE_VK_INDEX,
];

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start: PartialStateReference,

    state_diff_hints: StateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

    sorted_public_data_writes: [PublicDataTreeLeaf; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    sorted_public_data_writes_indexes: [u32; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_preimages: [PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_witnesses: [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        // Skip proving for now. As we currently tweak the public inputs of the tube to be the output of public tail.
        // if !dep::std::runtime::is_unconstrained() {
        //     self.kernel_data.verify();
        //     self.kernel_data.vk_data.validate_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
        // }

        BaseRollupInputs {
            kernel_data: KernelData { public_inputs: self.tube_data.public_inputs },
            start: self.start,
            state_diff_hints: self.state_diff_hints,
            fee_payer_fee_juice_balance_read_hint: self.fee_payer_fee_juice_balance_read_hint,
            sorted_public_data_writes: self.sorted_public_data_writes,
            sorted_public_data_writes_indexes: self.sorted_public_data_writes_indexes,
            low_public_data_writes_preimages: self.low_public_data_writes_preimages,
            low_public_data_writes_witnesses: self.low_public_data_writes_witnesses,
            archive_root_membership_witness: self.archive_root_membership_witness,
            constants: self.constants
        }.base_rollup_circuit()
    }
}
