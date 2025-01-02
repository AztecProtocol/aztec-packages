use super::validate_tube_data::validate_max_fees_per_gas;
use dep::types::abis::{constant_rollup_data::ConstantRollupData, tube::PublicTubeData};

pub struct PublicTubeDataValidator {
    pub data: PublicTubeData,
}

// TODO: Move relevant verifications here.
impl PublicTubeDataValidator {
    pub fn new(data: PublicTubeData) -> Self {
        PublicTubeDataValidator { data }
    }

    pub fn verify_proof(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree(self.tube_data.public_inputs.constants.vk_tree_root, ALLOWED_PREVIOUS_CIRCUITS);
        }
    }

    pub fn validate_with_rollup_data(self, constants: ConstantRollupData) {
        validate_max_fees_per_gas(
            self.data.public_inputs.constants.tx_context.gas_settings.max_fees_per_gas,
            constants.global_variables.gas_fees,
        );
    }
}
