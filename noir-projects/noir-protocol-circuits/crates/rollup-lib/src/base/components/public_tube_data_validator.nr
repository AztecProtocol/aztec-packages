use crate::base::components::{
    constants::validate_tx_constant_data, gas::clamp_gas_settings_for_avm,
    validation_requests::validate_max_block_number,
};
use super::fees::compute_effective_gas_fees;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, block_constant_data::BlockConstantData,
        tube::PublicTubeData,
    },
    constants::ARCHIVE_HEIGHT,
    merkle_tree::MembershipWitness,
    proof::traits::Verifiable,
    traits::Empty,
    utils::arrays::array_length,
};

fn assert_eq_array_and_length<T, let N: u32, let M: u32>(
    array_from_tube: [T; N],
    array_from_avm: [T; N],
    expected_length: u32,
    name: str<M>,
)
where
    T: Eq + Empty,
{
    assert_eq(array_from_tube, array_from_avm, f"{name} mismatch between tube and avm");

    let length = array_length(array_from_tube);
    assert_eq(length, expected_length, f"{name} array length mismatch between tube and avm");
}

pub struct PublicTubeDataValidator {
    pub data: PublicTubeData,
}

impl PublicTubeDataValidator {
    pub fn new(data: PublicTubeData) -> Self {
        PublicTubeDataValidator { data }
    }

    pub fn verify_proof(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree(self.tube_data.public_inputs.constants.vk_tree_root, ALLOWED_PREVIOUS_CIRCUITS);
        }
    }

    pub fn validate_with_block_constant_data(
        self,
        constants: BlockConstantData,
        archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    ) {
        validate_tx_constant_data(
            self.data.public_inputs.constants,
            constants,
            archive_root_membership_witness,
        );

        validate_max_block_number(
            self.data.public_inputs.rollup_validation_requests,
            constants.global_variables.block_number,
        );
    }

    pub fn validate_with_avm_data(self, avm_data: AvmCircuitPublicInputs) {
        let tube_data = self.data.public_inputs;

        // global_variables and start_tree_snapshots.l1_to_l2_message_tree are part of the block constant data, which
        // is exported through public inputs and will be checked in merge or block root rollup to make sure that it's
        // the same for all txs in the block. For l1_to_l2_message_tree, it has to match the value listed in the
        // previous block header, which is validated in the block root rollup.

        // The rest of the values in start_tree_snapshots are also exported as start_state through public inputs and is
        // validated as follows:
        // - For the first tx, block root rollup checks that the start state matches the previous block's end state.
        // - For all subsequent txs, the merge or block root rollup checks that it matches the previous tx's end state.

        assert_eq(
            tube_data.gas_used,
            avm_data.start_gas_used,
            "start_gas_used mismatch between tube and avm",
        );

        assert_eq(
            clamp_gas_settings_for_avm(
                tube_data.constants.tx_context.gas_settings,
                tube_data.gas_used,
            ),
            avm_data.gas_settings,
            "unexpected gas settings used in the AVM",
        );

        assert_eq(
            compute_effective_gas_fees(
                avm_data.global_variables.gas_fees, // AVM global_variables are validated to be equal in validate_combined_constant_data
                tube_data.constants.tx_context.gas_settings,
            ),
            avm_data.effective_gas_fees,
            "unexpected effective gas fees used in the AVM",
        );

        assert_eq(
            tube_data.fee_payer,
            avm_data.fee_payer,
            "fee_payer mismatch between tube and avm",
        );

        // Public call requests.

        assert_eq_array_and_length(
            tube_data.non_revertible_accumulated_data.public_call_requests,
            avm_data.public_setup_call_requests,
            avm_data.public_call_request_array_lengths.setup_calls,
            "non-revertible public_call_requests",
        );

        assert_eq_array_and_length(
            tube_data.revertible_accumulated_data.public_call_requests,
            avm_data.public_app_logic_call_requests,
            avm_data.public_call_request_array_lengths.app_logic_calls,
            "revertible public_call_requests",
        );

        assert_eq(
            tube_data.public_teardown_call_request,
            avm_data.public_teardown_call_request,
            "public_teardown_call_request mismatch between tube and avm",
        );

        // Non-revertible accumulated data.

        assert_eq_array_and_length(
            tube_data.non_revertible_accumulated_data.note_hashes,
            avm_data.previous_non_revertible_accumulated_data.note_hashes,
            avm_data.previous_non_revertible_accumulated_data_array_lengths.note_hashes,
            "non-revertible note_hashes",
        );

        assert_eq_array_and_length(
            tube_data.non_revertible_accumulated_data.nullifiers,
            avm_data.previous_non_revertible_accumulated_data.nullifiers,
            avm_data.previous_non_revertible_accumulated_data_array_lengths.nullifiers,
            "non-revertible nullifiers",
        );

        assert_eq_array_and_length(
            tube_data.non_revertible_accumulated_data.l2_to_l1_msgs,
            avm_data.previous_non_revertible_accumulated_data.l2_to_l1_msgs,
            avm_data.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs,
            "non-revertible l2_to_l1_msgs",
        );

        // Revertible accumulated data.

        assert_eq_array_and_length(
            tube_data.revertible_accumulated_data.note_hashes,
            avm_data.previous_revertible_accumulated_data.note_hashes,
            avm_data.previous_revertible_accumulated_data_array_lengths.note_hashes,
            "revertible note_hashes",
        );

        assert_eq_array_and_length(
            tube_data.revertible_accumulated_data.nullifiers,
            avm_data.previous_revertible_accumulated_data.nullifiers,
            avm_data.previous_revertible_accumulated_data_array_lengths.nullifiers,
            "revertible nullifiers",
        );

        assert_eq_array_and_length(
            tube_data.revertible_accumulated_data.l2_to_l1_msgs,
            avm_data.previous_revertible_accumulated_data.l2_to_l1_msgs,
            avm_data.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs,
            "revertible l2_to_l1_msgs",
        );
    }
}
