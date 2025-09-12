mod validate_private_tail_against_avm_tests;
mod validate_private_tail_tests;

use crate::base::components::PublicTxBaseInputsValidator;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmProofData, block_constant_data::BlockConstantData,
        gas_fees::GasFees, kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    },
    constants::{ARCHIVE_HEIGHT, PUBLIC_TUBE_VK_INDEX},
    merkle_tree::MembershipWitness,
    proof::proof_data::RollupHonkProofData,
    tests::fixture_builder::FixtureBuilder,
};

// TODO: Update this to generate fixtures for testing the entire PublicBaseRollupInputs.
pub struct PublicTxBaseTestBuilder {
    pub public_tube_proof_data: RollupHonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    pub avm_proof_data: AvmProofData,
    pub block_constant_data: BlockConstantData,
    pub archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
}

impl PublicTxBaseTestBuilder {
    pub fn new() -> Self {
        let mut builder = FixtureBuilder::new().use_last_archive();

        builder.gas_used.l2_gas = 111;
        builder.start_gas_used.l2_gas = 111;

        builder.tx_context.gas_settings.gas_limits.l2_gas = 444;

        builder.tx_context.gas_settings.teardown_gas_limits.l2_gas = 333;

        builder.global_variables.gas_fees = GasFees::new(100, 100);

        builder.tx_context.gas_settings.max_fees_per_gas = GasFees::new(150, 150);

        builder.tx_context.gas_settings.max_priority_fees_per_gas = GasFees::new(100, 100);

        builder.effective_gas_fees = GasFees::new(150, 150);

        builder.append_note_hashes(2);

        builder.append_nullifiers(3);

        builder.append_l2_to_l1_msgs(1);

        builder.append_public_call_requests(2);

        builder.end_setup();

        builder.append_note_hashes(1);

        builder.append_nullifiers(1);

        builder.append_l2_to_l1_msgs(2);

        builder.append_public_call_requests(3);

        builder.set_public_teardown_call_request();

        let private_tail_public_inputs =
            builder.to_private_to_public_kernel_circuit_public_inputs();
        let public_tube_proof_data =
            FixtureBuilder::make_proof_data(private_tail_public_inputs, PUBLIC_TUBE_VK_INDEX);

        let avm_proof_data = builder.to_avm_proof_data();

        let block_constant_data = builder.to_block_constant_data();

        let archive_root_membership_witness = builder.archive_root_membership_witness;

        PublicTxBaseTestBuilder {
            public_tube_proof_data,
            avm_proof_data,
            block_constant_data,
            archive_root_membership_witness,
        }
    }

    pub fn validate(self) {
        PublicTxBaseInputsValidator::new(
            self.public_tube_proof_data,
            self.avm_proof_data,
            self.block_constant_data,
            self.archive_root_membership_witness,
        )
            .validate();
    }
}
