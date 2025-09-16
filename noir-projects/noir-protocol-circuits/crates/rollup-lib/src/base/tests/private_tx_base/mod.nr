mod validate_private_tail_tests;

use crate::base::components::PrivateTxBaseInputsValidator;
use dep::types::{
    abis::{
        block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    },
    constants::{ARCHIVE_HEIGHT, HIDING_KERNEL_TO_ROLLUP_VK_INDEX},
    merkle_tree::MembershipWitness,
    proof::proof_data::CivcProofData,
    tests::fixture_builder::FixtureBuilder,
};

// TODO: Update this to generate fixtures for testing the entire PrivateBaseRollupInputs.
pub struct PrivateTxBaseTestBuilder {
    pub hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
    pub block_constant_data: BlockConstantData,
    pub archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
}

impl PrivateTxBaseTestBuilder {
    pub fn new() -> Self {
        let builder = FixtureBuilder::new().use_last_archive();

        let private_tail_public_inputs =
            builder.to_private_to_rollup_kernel_circuit_public_inputs();
        let hiding_kernel_proof_data = FixtureBuilder::make_proof_data(
            private_tail_public_inputs,
            HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
        );

        let block_constant_data = builder.to_block_constant_data();

        let archive_root_membership_witness = builder.archive_root_membership_witness;

        PrivateTxBaseTestBuilder {
            hiding_kernel_proof_data,
            block_constant_data,
            archive_root_membership_witness,
        }
    }

    pub fn validate(self) {
        PrivateTxBaseInputsValidator::new(
            self.hiding_kernel_proof_data,
            self.block_constant_data,
            self.archive_root_membership_witness,
        )
            .validate();
    }
}
