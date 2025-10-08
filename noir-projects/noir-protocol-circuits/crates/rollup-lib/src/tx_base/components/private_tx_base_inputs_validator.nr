use crate::tx_base::components::{
    fees::compute_fee_payer_fee_juice_balance_leaf_slot, private_tail_validator,
};
use dep::types::{
    abis::{
        block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        partial_state_reference::PartialStateReference,
    },
    constants::{
        ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    proof::proof_data::CivcProofData,
};

pub struct PrivateTxBaseInputsValidator {
    hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
    constants: BlockConstantData,
    start_tree_snapshots: PartialStateReference,
    contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
    anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl PrivateTxBaseInputsValidator {
    pub fn new(
        hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
        constants: BlockConstantData,
        start_tree_snapshots: PartialStateReference,
        contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
        fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
        anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    ) -> Self {
        PrivateTxBaseInputsValidator {
            hiding_kernel_proof_data,
            constants,
            start_tree_snapshots,
            contract_class_log_fields,
            fee_payer_balance_leaf_preimage,
            anchor_block_archive_sibling_path,
        }
    }

    pub fn validate(self) {
        self.validate_hiding_kernel_proof_and_vk();
        self.validate_private_tail();
    }

    pub fn validate_fee_payer_balance(self, transaction_fee: Field) {
        // Ensure that the given leaf preimage is for the correct fee payer.
        let leaf_preimage = self.fee_payer_balance_leaf_preimage;
        let fee_payer = self.hiding_kernel_proof_data.public_inputs.fee_payer;
        let leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
        assert_eq(leaf_preimage.slot, leaf_slot, "Wrong leaf slot for fee payer balance");

        // Ensure that the fee payer has enough balance to pay for the transaction.
        let balance = leaf_preimage.value;
        assert(
            !balance.lt(transaction_fee),
            "Not enough balance for fee payer to pay for transaction",
        );

        // The membership check that ensures the `fee_payer_balance_leaf_preimage` does exist in the public data tree is
        // done in `update_public_data_tree_leaf.nr`, while updating the leaf to reflect the fee payer's new balance.
    }

    fn validate_hiding_kernel_proof_and_vk(self) {
        if !dep::std::runtime::is_unconstrained() {
            self.hiding_kernel_proof_data.verify_proof();
        }

        assert_eq(
            self.hiding_kernel_proof_data.vk_data.leaf_index,
            HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
            "Incorrect hiding kernel vk index",
        );

        let vk_tree_root = self.constants.vk_tree_root;
        self.hiding_kernel_proof_data.vk_data.validate_in_vk_tree(vk_tree_root);
    }

    fn validate_private_tail(self) {
        // The public inputs of `private_kernel_tail` was propagated through `hiding_kernel_to_rollup`.
        let private_tail = self.hiding_kernel_proof_data.public_inputs;

        private_tail_validator::validate_tx_constant_data(
            private_tail.constants,
            self.constants,
            self.anchor_block_archive_sibling_path,
        );

        private_tail_validator::validate_include_by_timestamp(
            private_tail.include_by_timestamp,
            self.constants.global_variables,
        );

        private_tail_validator::validate_contract_class_logs(
            private_tail.end.contract_class_logs_hashes,
            self.contract_class_log_fields,
        );
    }
}
