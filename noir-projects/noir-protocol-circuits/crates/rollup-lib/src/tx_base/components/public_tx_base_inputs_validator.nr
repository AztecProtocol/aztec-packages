use crate::{abis::PublicTubePublicInputs, tx_base::components::private_tail_validator};
use super::fees::compute_effective_gas_fees;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, block_constant_data::BlockConstantData,
    },
    constants::{ARCHIVE_HEIGHT, AVM_VK_INDEX, PUBLIC_TUBE_VK_INDEX},
    proof::proof_data::{AvmV2ProofData, RollupHonkProofData},
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
    assert_eq(array_from_private, array_from_avm, f"Mismatched {name} between private and avm");

    let length = array_length(array_from_private);
    assert_eq(length, expected_length, f"Mismatched {name} array length between private and avm");
}

pub struct PublicTxBaseInputsValidator {
    public_tube_proof_data: RollupHonkProofData<PublicTubePublicInputs>,
    avm_proof_data: AvmV2ProofData<AvmCircuitPublicInputs>,
    constants: BlockConstantData,
    anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl PublicTxBaseInputsValidator {
    pub fn new(
        public_tube_proof_data: RollupHonkProofData<PublicTubePublicInputs>,
        avm_proof_data: AvmV2ProofData<AvmCircuitPublicInputs>,
        constants: BlockConstantData,
        anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    ) -> Self {
        PublicTxBaseInputsValidator {
            public_tube_proof_data,
            avm_proof_data,
            constants,
            anchor_block_archive_sibling_path,
        }
    }

    pub fn validate(self) {
        self.validate_public_tube_proof_and_vk();
        self.validate_avm_proof_and_vk();

        // The public inputs of `private_tail_to_public` are propagated to `hiding_kernel_to_public` and then to
        // `public_tube`. The following two functions verify the public inputs to ensure that the private side was
        // executed correctly and that the data from private is passed to the AVM properly.
        self.validate_private_tail();
        self.validate_public_tube_against_avm();
    }

    fn validate_public_tube_proof_and_vk(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.public_tube_proof_data.verify_proof();
        }

        assert_eq(
            self.public_tube_proof_data.vk_data.leaf_index,
            PUBLIC_TUBE_VK_INDEX,
            "Incorrect public tube vk index",
        );

        let vk_tree_root = self.constants.vk_tree_root;
        self.public_tube_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);
    }

    fn validate_avm_proof_and_vk(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.avm_proof_data.verify_proof_with_columns();
        }

        assert_eq(self.avm_proof_data.vk_data.leaf_index, AVM_VK_INDEX, "Incorrect avm vk index");

        // TODO(#17162): Add avm vk hash to the tree and uncomment the following.
        // let vk_tree_root = self.constants.vk_tree_root;
        // self.avm_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);
    }

    fn validate_private_tail(self) {
        let private_tail = self.public_tube_proof_data.public_inputs.private_tail;

        private_tail_validator::validate_tx_constant_data(
            private_tail.constants,
            self.constants,
            self.anchor_block_archive_sibling_path,
        );

        // Note: `validate_contract_class_logs` is called in `public_tx_effect_builder` after the non-revertible and
        // revertible accumulated data are merged, or after the revertible data is discarded, depending on the revert
        // flag.

        private_tail_validator::validate_include_by_timestamp(
            private_tail.include_by_timestamp,
            self.constants.global_variables,
        );
    }

    fn validate_public_tube_against_avm(self) {
        let avm = self.avm_proof_data.public_inputs;
        let public_tube = self.public_tube_proof_data.public_inputs;

        // --- Prover id ---

        assert_eq(
            public_tube.prover_id,
            avm.prover_id,
            "Mismatched prover_id between private and avm",
        );

        let private_tail = public_tube.private_tail;

        // --- Protocol contracts ---

        assert_eq(
            private_tail.constants.protocol_contracts_hash,
            avm.protocol_contracts.hash(),
            "Mismatched protocol_contracts between private and avm",
        );

        // --- Gas and fees ---

        assert_eq(
            private_tail.gas_used,
            avm.start_gas_used,
            "Mismatched start_gas_used between private and avm",
        );

        assert_eq(
            private_tail.constants.tx_context.gas_settings,
            avm.gas_settings,
            "Mismatched gas_settings between private and avm",
        );

        assert_eq(
            compute_effective_gas_fees(
                avm.global_variables.gas_fees,
                private_tail.constants.tx_context.gas_settings,
            ),
            avm.effective_gas_fees,
            "Incorrect effective gas fees used in the avm",
        );

        assert_eq(
            private_tail.fee_payer,
            avm.fee_payer,
            "Mismatched fee_payer between private and avm",
        );

        // --- Public call requests ---

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
            "Mismatched public_teardown_call_request between private and avm",
        );

        // --- Non-revertible accumulated data ---

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

        // --- Revertible accumulated data ---

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

        // --- Other fields in the "Inputs" part of the AVM's public inputs ---

        // `global_variables`: part of the block constant data, validated in `tx_merge` and `block_root` to ensure
        // consistency across all txs in the block. The `chain_id` and `version` are validated in
        // `private_tail_validator` to ensure they match the values in the private tail.

        // `l1_to_l2_message_tree` in `start_tree_snapshots`: part of the block constant data, remains constant for all
        // txs in the block. The value is validated as follows:
        // - For the first block: `block_root` checks that it matches the snapshot after inserting new messages.
        // - For subsequent blocks: `block_merge` and `checkpoint_root` check that it matches the value in the previous
        //   block.

        // The remaining snapshots in `start_tree_snapshots` are exported via public inputs and validated in `tx_merge`
        // or `block_root` to ensure they match the previous tx's `end_tree_snapshots`.
        // For the first tx in a checkpoint, `checkpoint_root` validates that they match the snapshots from the last
        // block of the previous checkpoint.
    }
}
