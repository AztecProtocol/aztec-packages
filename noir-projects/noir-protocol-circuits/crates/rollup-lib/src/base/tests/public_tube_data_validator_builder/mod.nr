mod validate_with_avm_data;
mod validate_with_rollup_data;

use crate::base::components::PublicTubeDataValidator;
use dep::types::tests::fixture_builder::FixtureBuilder;

pub struct PublicTubeDataValidatorBuilder {
    pub tube_data: FixtureBuilder,
    pub rollup_data: FixtureBuilder,
    pub avm_data: FixtureBuilder,
}

impl PublicTubeDataValidatorBuilder {
    pub fn new() -> Self {
        PublicTubeDataValidatorBuilder {
            tube_data: FixtureBuilder::new(),
            rollup_data: FixtureBuilder::new(),
            avm_data: FixtureBuilder::new(),
        }
    }

    pub fn validate_with_rollup_data(self) {
        let tube_data = self.tube_data.to_public_tube_data();
        let rollup_data = self.rollup_data.to_constant_rollup_data();
        PublicTubeDataValidator::new(tube_data).validate_with_rollup_data(rollup_data);
    }

    pub fn validate_with_avm_data(self) {
        let tube_data = self.tube_data.to_public_tube_data();
        let avm_data = self.avm_data.to_avm_circuit_public_inputs();
        PublicTubeDataValidator::new(tube_data).validate_with_avm_data(avm_data);
    }
}
