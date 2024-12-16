use super::validate_tube_data::validate_max_fees_per_gas;
use dep::types::abis::{constant_rollup_data::ConstantRollupData, tube::PrivateTubeData};

pub struct PrivateTubeDataValidator {
    pub data: PrivateTubeData,
}

// TODO: Move relevant verifications here.
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

    pub fn validate_with_rollup_data(self, constants: ConstantRollupData) {
        validate_max_fees_per_gas(
            self.data.public_inputs.constants.tx_context.gas_settings.max_fees_per_gas,
            constants.global_variables.gas_fees,
        );
    }
}
