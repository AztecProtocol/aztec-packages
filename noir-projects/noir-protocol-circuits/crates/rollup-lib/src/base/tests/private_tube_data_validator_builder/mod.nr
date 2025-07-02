mod validate_with_block_constant_data;

use crate::base::components::PrivateTubeDataValidator;
use dep::types::{
    abis::block_constant_data::BlockConstantData, tests::fixture_builder::FixtureBuilder,
};

pub struct PrivateTubeDataValidatorBuilder {
    pub tube_data: FixtureBuilder,
    pub block_constant_data: BlockConstantData,
}

impl PrivateTubeDataValidatorBuilder {
    pub fn new() -> Self {
        let mut tube_data = FixtureBuilder::new().use_last_archive();
        tube_data.set_include_by_timestamp(tube_data.global_variables.timestamp);

        let block_constant_data = tube_data.to_block_constant_data();
        PrivateTubeDataValidatorBuilder { tube_data, block_constant_data }
    }

    pub fn validate_with_block_constant_data(self) {
        let tube_data = self.tube_data.to_private_tube_data();
        PrivateTubeDataValidator::new(tube_data).validate_with_block_constant_data(
            self.block_constant_data,
            self.tube_data.archive_root_membership_witness,
        );
    }
}
