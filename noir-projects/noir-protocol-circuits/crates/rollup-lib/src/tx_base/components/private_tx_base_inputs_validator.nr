use crate::tx_base::components::{
    constants::validate_tx_constant_data, include_by_timestamp::validate_include_by_timestamp,
};
use dep::types::{
    abis::{
        block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    },
    constants::{ARCHIVE_HEIGHT, AVM_MAX_PROCESSABLE_L2_GAS, HIDING_KERNEL_TO_ROLLUP_VK_INDEX},
    merkle_tree::MembershipWitness,
    proof::proof_data::CivcProofData,
};

pub struct PrivateTxBaseInputsValidator {
    hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
    constants: BlockConstantData,
    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
}

impl PrivateTxBaseInputsValidator {
    pub fn new(
        hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
        constants: BlockConstantData,
        archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    ) -> Self {
        PrivateTxBaseInputsValidator {
            hiding_kernel_proof_data,
            constants,
            archive_root_membership_witness,
        }
    }

    pub fn validate(self) {
        self.validate_hiding_kernel_proof_and_vk();
        self.validate_private_tail_against_block_constant_data();
        self.validate_gas_settings();
    }

    fn validate_hiding_kernel_proof_and_vk(self) {
        assert_eq(
            self.hiding_kernel_proof_data.vk_data.leaf_index,
            HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
        );

        if !dep::std::runtime::is_unconstrained() {
            self.hiding_kernel_proof_data.verify_proof();

            let vk_tree_root = self.constants.vk_tree_root;
            self.hiding_kernel_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);
        }
    }

    fn validate_private_tail_against_block_constant_data(self) {
        // The public inputs of `private_kernel_tail` was propagated through `hiding_kernel_to_rollup`.
        let civc = self.hiding_kernel_proof_data.public_inputs;

        validate_tx_constant_data(
            civc.constants,
            self.constants,
            self.archive_root_membership_witness,
        );

        validate_include_by_timestamp(civc.include_by_timestamp, self.constants.global_variables);
    }

    // TODO: This should be moved to the private kernels once they are not used for gas estimation anymore.
    fn validate_gas_settings(self) {
        let gas_settings =
            self.hiding_kernel_proof_data.public_inputs.constants.tx_context.gas_settings;
        assert(
            gas_settings.gas_limits.l2_gas <= AVM_MAX_PROCESSABLE_L2_GAS,
            "l2 gas limit exceeds max processable l2 gas",
        );
    }
}
