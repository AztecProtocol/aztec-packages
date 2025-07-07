use crate::base::components::{
    constants::validate_tx_constant_data, include_by_timestamp::validate_include_by_timestamp,
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

    pub fn validate_proof_and_vk(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.data.verify();
            // TODO(#7410): Add private tube vk hash to the tree and uncomment the following check.
            // self.data.vk_data.validate_vk_in_vk_tree();
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

        validate_include_by_timestamp(tube_data.include_by_timestamp, constants.global_variables);
    }
}
