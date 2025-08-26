use crate::base::components::PublicTubeDataValidator;
use super::PublicTubeDataValidatorBuilder;
use types::constants::AVM_MAX_PROCESSABLE_L2_GAS;

impl PublicTubeDataValidatorBuilder {

    pub fn validate_gas_settings(self) {
        let tube_data = self.tube_data.to_public_tube_data();
        PublicTubeDataValidator::new(tube_data).validate_gas_settings();
    }
}

#[test(should_fail_with = "l2 gas limit exceeds max processable l2 gas")]
fn public_tube_validate_gas_settings_l2_gas_limit_exceeds_max_processable_l2_gas_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new();

    builder.tube_data.tx_context.gas_settings.gas_limits.l2_gas = AVM_MAX_PROCESSABLE_L2_GAS + 1;

    builder.validate_gas_settings();
}
