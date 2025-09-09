use crate::base::components::{
    constants::validate_tx_constant_data, include_by_timestamp::validate_include_by_timestamp,
};
use super::fees::compute_effective_gas_fees;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmProofData, block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    },
    constants::{ARCHIVE_HEIGHT, AVM_MAX_PROCESSABLE_L2_GAS, PUBLIC_TUBE_VK_INDEX},
    merkle_tree::MembershipWitness,
    proof::{proof_data::RollupHonkProofData, traits::Verifiable},
    traits::Empty,
    utils::arrays::array_length,
};

fn assert_eq_array_and_length<T, let N: u32, let M: u32>(
    array_from_private: [T; N],
    array_from_avm: [T; N],
    expected_length: u32,
    name: str<M>,
)
where
    T: Empty,
{
    assert_eq(array_from_private, array_from_avm, f"{name} mismatch between private and avm");

    let length = array_length(array_from_private);
    assert_eq(length, expected_length, f"{name} array length mismatch between private and avm");
}

pub struct PublicTxBaseInputsValidator {
    public_tube_proof_data: RollupHonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    avm_proof_data: AvmProofData,
    constants: BlockConstantData,
    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
}

impl PublicTxBaseInputsValidator {
    pub fn new(
        public_tube_proof_data: RollupHonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
        avm_proof_data: AvmProofData,
        constants: BlockConstantData,
        archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    ) -> Self {
        PublicTxBaseInputsValidator {
            public_tube_proof_data,
            avm_proof_data,
            constants,
            archive_root_membership_witness,
        }
    }

    pub fn validate(self) {
        self.validate_public_tube_proof_and_vk();
        self.validate_avm_proof_and_vk();

        // The public inputs of `private_tail_to_public` was propagated to `hiding_kernel_to_public` and then to
        // `public_tube`. The following two functions verify the public inputs of `private_tail_to_public` to ensure
        // that everything was done properly on the private side, and the data from private is fed to the avm correctly.
        self.validate_private_tail();
        self.validate_private_tail_against_avm();
    }

    fn validate_public_tube_proof_and_vk(self) {
        assert_eq(self.public_tube_proof_data.vk_data.leaf_index, PUBLIC_TUBE_VK_INDEX);

        if !dep::std::runtime::is_unconstrained() {
            self.public_tube_proof_data.verify_proof();

            let vk_tree_root = self.constants.vk_tree_root;
            self.public_tube_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);
        }
    }

    fn validate_avm_proof_and_vk(self) {
        if !dep::std::runtime::is_unconstrained() {
            // TODO(#8470)
            self.avm_proof_data.verify();
            // TODO: Add avm vk hash to the tree and uncomment this.
            // self.avm_proof_data.validate_vk_in_vk_tree(constants.vk_tree_root);
        }
    }

    fn validate_private_tail(self) {
        let private_tail = self.public_tube_proof_data.public_inputs;

        validate_tx_constant_data(
            private_tail.constants,
            self.constants,
            self.archive_root_membership_witness,
        );

        validate_include_by_timestamp(
            private_tail.include_by_timestamp,
            self.constants.global_variables,
        );

        // TODO: This should be moved to the private kernels once they are not used for gas estimation anymore.
        let gas_settings = private_tail.constants.tx_context.gas_settings;
        assert(
            gas_settings.gas_limits.l2_gas <= AVM_MAX_PROCESSABLE_L2_GAS,
            "l2 gas limit exceeds max processable l2 gas",
        );
    }

    fn validate_private_tail_against_avm(self) {
        let private_tail = self.public_tube_proof_data.public_inputs;
        let avm = self.avm_proof_data.public_inputs;

        // global_variables and start_tree_snapshots.l1_to_l2_message_tree are part of the block constant data, which
        // is exported through public inputs and will be checked in merge or block root rollup to make sure that it's
        // the same for all txs in the block. For l1_to_l2_message_tree, it has to match the value listed in the
        // previous block header, which is validated in the block root rollup.

        // The rest of the values in start_tree_snapshots are also exported as start_state through public inputs and is
        // validated as follows:
        // - For the first tx, block root rollup checks that the start state matches the previous block's end state.
        // - For all subsequent txs, the merge or block root rollup checks that it matches the previous tx's end state.

        assert_eq(
            private_tail.gas_used,
            avm.start_gas_used,
            "start_gas_used mismatch between private and avm",
        );

        assert_eq(
            private_tail.constants.tx_context.gas_settings,
            avm.gas_settings,
            "unexpected gas settings used in the AVM",
        );

        assert_eq(
            compute_effective_gas_fees(
                avm.global_variables.gas_fees, // AVM global_variables are validated to be equal in validate_combined_constant_data
                private_tail.constants.tx_context.gas_settings,
            ),
            avm.effective_gas_fees,
            "unexpected effective gas fees used in the AVM",
        );

        assert_eq(
            private_tail.fee_payer,
            avm.fee_payer,
            "fee_payer mismatch between private and avm",
        );

        // Public call requests.

        assert_eq_array_and_length(
            private_tail.non_revertible_accumulated_data.public_call_requests,
            avm.public_setup_call_requests,
            avm.public_call_request_array_lengths.setup_calls,
            "non-revertible public_call_requests",
        );

        assert_eq_array_and_length(
            private_tail.revertible_accumulated_data.public_call_requests,
            avm.public_app_logic_call_requests,
            avm.public_call_request_array_lengths.app_logic_calls,
            "revertible public_call_requests",
        );

        assert_eq(
            private_tail.public_teardown_call_request,
            avm.public_teardown_call_request,
            "public_teardown_call_request mismatch between private and avm",
        );

        // Non-revertible accumulated data.

        assert_eq_array_and_length(
            private_tail.non_revertible_accumulated_data.note_hashes,
            avm.previous_non_revertible_accumulated_data.note_hashes,
            avm.previous_non_revertible_accumulated_data_array_lengths.note_hashes,
            "non-revertible note_hashes",
        );

        assert_eq_array_and_length(
            private_tail.non_revertible_accumulated_data.nullifiers,
            avm.previous_non_revertible_accumulated_data.nullifiers,
            avm.previous_non_revertible_accumulated_data_array_lengths.nullifiers,
            "non-revertible nullifiers",
        );

        assert_eq_array_and_length(
            private_tail.non_revertible_accumulated_data.l2_to_l1_msgs,
            avm.previous_non_revertible_accumulated_data.l2_to_l1_msgs,
            avm.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs,
            "non-revertible l2_to_l1_msgs",
        );

        // Revertible accumulated data.

        assert_eq_array_and_length(
            private_tail.revertible_accumulated_data.note_hashes,
            avm.previous_revertible_accumulated_data.note_hashes,
            avm.previous_revertible_accumulated_data_array_lengths.note_hashes,
            "revertible note_hashes",
        );

        assert_eq_array_and_length(
            private_tail.revertible_accumulated_data.nullifiers,
            avm.previous_revertible_accumulated_data.nullifiers,
            avm.previous_revertible_accumulated_data_array_lengths.nullifiers,
            "revertible nullifiers",
        );

        assert_eq_array_and_length(
            private_tail.revertible_accumulated_data.l2_to_l1_msgs,
            avm.previous_revertible_accumulated_data.l2_to_l1_msgs,
            avm.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs,
            "revertible l2_to_l1_msgs",
        );
    }
}
