use crate::base::components::{
    constants::validate_tx_constant_data, include_by_timestamp::validate_include_by_timestamp,
};
use dep::types::{
    abis::{block_constant_data::BlockConstantData, tube::PrivateTubeData},
    constants::{ARCHIVE_HEIGHT, AVM_MAX_PROCESSABLE_L2_GAS},
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

    // TODO: This should be moved to the private kernels once they are not used for gas estimation anymore.
    pub fn validate_gas_settings(self) {
        let gas_settings = self.data.public_inputs.constants.tx_context.gas_settings;
        assert(
            gas_settings.gas_limits.l2_gas <= AVM_MAX_PROCESSABLE_L2_GAS,
            "l2 gas limit exceeds max processable l2 gas",
        );
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
