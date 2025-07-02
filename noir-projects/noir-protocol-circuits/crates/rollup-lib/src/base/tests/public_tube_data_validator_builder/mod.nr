mod validate_with_avm_data;
mod validate_with_block_constant_data;

use crate::base::components::PublicTubeDataValidator;
use dep::types::{
    abis::block_constant_data::BlockConstantData, tests::fixture_builder::FixtureBuilder,
};

pub struct PublicTubeDataValidatorBuilder {
    pub tube_data: FixtureBuilder,
    pub avm_data: FixtureBuilder,
    pub block_constant_data: BlockConstantData,
}

impl PublicTubeDataValidatorBuilder {
    pub fn new() -> Self {
        let mut tube_data = FixtureBuilder::new().use_last_archive();
        tube_data.set_include_by_timestamp(tube_data.global_variables.timestamp);

        let block_constant_data = tube_data.to_block_constant_data();
        PublicTubeDataValidatorBuilder {
            tube_data,
            avm_data: FixtureBuilder::new().use_last_archive(),
            block_constant_data,
        }
    }

    pub fn validate_with_block_constant_data(self) {
        let tube_data = self.tube_data.to_public_tube_data();
        PublicTubeDataValidator::new(tube_data).validate_with_block_constant_data(
            self.block_constant_data,
            self.tube_data.archive_root_membership_witness,
        );
    }

    pub fn validate_with_avm_data(self) {
        let tube_data = self.tube_data.to_public_tube_data();
        let avm_data = self.avm_data.to_avm_circuit_public_inputs();
        PublicTubeDataValidator::new(tube_data).validate_with_avm_data(avm_data);
    }
}
