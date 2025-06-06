use crate::base::components::{
    gas::clamp_gas_settings_for_avm, validate_tube_data::validate_max_fees_per_gas,
};
use super::fees::compute_effective_gas_fees;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, constant_rollup_data::ConstantRollupData,
        tube::PublicTubeData,
    },
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

// TODO: Move relevant verifications here.
impl PublicTubeDataValidator {
    pub fn new(data: PublicTubeData) -> Self {
        PublicTubeDataValidator { data }
    }

    pub fn validate_proof(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree(self.tube_data.public_inputs.constants.vk_tree_root, ALLOWED_PREVIOUS_CIRCUITS);
        }
    }

    pub fn validate_with_rollup_data(self, constants: ConstantRollupData) {
        validate_max_fees_per_gas(
            self.data.public_inputs.constants.tx_context.gas_settings.max_fees_per_gas,
            constants.global_variables.gas_fees,
        );
    }

    pub fn validate_with_avm_data(self, avm_data: AvmCircuitPublicInputs) {
        let tube_data = self.data.public_inputs;

        // global_variables is checked in public_base_rollup.nr > validate_combined_constant_data()
        // The constant data is exported from the public inputs and is checked later on to make sure it matches other txs's constant data.

        // start_tree_snapshots is exported from the public inputs and is checked later on:
        // - For the first tx, it's checked in the block root rollup that it matches the previous block's end state.
        // - For the subsequent txs, it's checked in the merge or block root rollup that it matches the previous tx's end state.
        // TODO: export l1_to_l2_message_tree and check in the block root rollup.

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
