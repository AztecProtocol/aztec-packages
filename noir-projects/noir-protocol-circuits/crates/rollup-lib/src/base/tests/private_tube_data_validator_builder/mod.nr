mod validate_with_rollup_data;

use crate::base::components::PrivateTubeDataValidator;
use dep::types::tests::fixture_builder::FixtureBuilder;

pub struct PrivateTubeDataValidatorBuilder {
    pub tube_data: FixtureBuilder,
    pub rollup_data: FixtureBuilder,
}

impl PrivateTubeDataValidatorBuilder {
    pub fn new() -> Self {
        PrivateTubeDataValidatorBuilder {
            tube_data: FixtureBuilder::new(),
            rollup_data: FixtureBuilder::new(),
        }
    }

    pub fn validate_with_rollup_data(self) {
        let tube_data = self.tube_data.to_private_tube_data();
        let rollup_data = self.rollup_data.to_constant_rollup_data();
        PrivateTubeDataValidator::new(tube_data).validate_with_rollup_data(rollup_data);
    }
}
