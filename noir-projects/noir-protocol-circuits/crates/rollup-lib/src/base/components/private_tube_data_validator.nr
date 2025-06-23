use crate::base::components::{
    constants::validate_tx_constant_data, validation_requests::validate_max_block_number,
};
use dep::types::{
    abis::{block_constant_data::BlockConstantData, tube::PrivateTubeData},
    constants::ARCHIVE_HEIGHT,
    merkle_tree::MembershipWitness,
    proof::traits::Verifiable,
};

pub struct PrivateTubeDataValidator {
    pub data: PrivateTubeData,
}

impl PrivateTubeDataValidator {
    pub fn new(data: PrivateTubeData) -> Self {
        PrivateTubeDataValidator { data }
    }

    pub fn verify_proof<let N: u32>(self, _allowed_previous_circuits: [u32; N]) {
        if !dep::std::runtime::is_unconstrained() {
            self.data.verify();
            // TODO(#7410)
            // self.data.vk_data.validate_in_vk_tree(self.data.public_inputs.constants.vk_tree_root, allowed_previous_circuits);
        }
    }

    pub fn validate_with_block_constant_data(
        self,
        constants: BlockConstantData,
        archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    ) {
        let tube_data = self.data.public_inputs;

        validate_tx_constant_data(
            tube_data.constants,
            constants,
            archive_root_membership_witness,
        );

        validate_max_block_number(
            tube_data.rollup_validation_requests,
            constants.global_variables.block_number,
        );
    }
}
