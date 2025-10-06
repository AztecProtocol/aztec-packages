use crate::{
    abis::{PublicTubePublicInputs, TxEffect, TxRollupPublicInputs},
    tx_base::components::{
        private_tx_effect_builder,
        public_tx_effect_builder,
        tree_snapshot_builder::{build_tree_snapshots, TreeSnapshotDiffHints},
        tx_blob_data::{append_tx_effect_to_sponge_blob, TxEffectArrayLengths},
    },
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        avm_circuit_public_inputs::AvmCircuitPublicInputs, block_constant_data::BlockConstantData,
        gas::Gas, kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        partial_state_reference::PartialStateReference, sponge_blob::SpongeBlob,
    },
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_L2_TO_L1_MSG_SUBTREES_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::UnbalancedMerkleTree,
};

pub struct TxBasePublicInputsComposer {
    pub(crate) constants: BlockConstantData,
    pub(crate) tx_effect: TxEffect,
    tx_effect_array_lengths: TxEffectArrayLengths,
    start_tree_snapshots: PartialStateReference,
    end_tree_snapshots: PartialStateReference,
    start_sponge_blob: SpongeBlob,
    gas_used: Gas,
}

impl TxBasePublicInputsComposer {
    pub fn new_from_private_to_rollup(
        private_to_rollup: PrivateToRollupKernelCircuitPublicInputs,
        constants: BlockConstantData,
        start_tree_snapshots: PartialStateReference,
        start_sponge_blob: SpongeBlob,
        contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
        fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
        tree_snapshot_diff_hints: TreeSnapshotDiffHints,
    ) -> Self {
        let (tx_effect, tx_effect_array_lengths) = private_tx_effect_builder::build_tx_effect(
            private_to_rollup,
            constants,
            contract_class_log_fields,
            fee_payer_balance_leaf_preimage,
        );

        let fee_payer_balance_write = tx_effect.public_data_writes[0];
        let end_tree_snapshots = build_tree_snapshots(
            start_tree_snapshots,
            tx_effect.note_hashes,
            tx_effect.nullifiers,
            fee_payer_balance_leaf_preimage,
            fee_payer_balance_write.value,
            tree_snapshot_diff_hints,
        );

        Self {
            constants,
            tx_effect,
            tx_effect_array_lengths,
            start_tree_snapshots,
            end_tree_snapshots,
            start_sponge_blob,
            gas_used: private_to_rollup.gas_used,
        }
    }

    pub fn new_from_public_tube_and_avm(
        public_tube: PublicTubePublicInputs,
        avm: AvmCircuitPublicInputs,
        last_archive: AppendOnlyTreeSnapshot,
        contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
        start_sponge_blob: SpongeBlob,
    ) -> Self {
        let private_to_public = public_tube.private_tail;

        // Note: Some values below are copied from `avm` rather than `private_to_public` and this must remain unchanged.
        // The constants are checked in `private_tail_validator` to ensure they match the values in `private_to_public`.
        let constants = BlockConstantData {
            last_archive,
            l1_to_l2_tree_snapshot: avm.start_tree_snapshots.l1_to_l2_message_tree,
            global_variables: avm.global_variables,
            vk_tree_root: private_to_public.constants.vk_tree_root,
            protocol_contracts_hash: private_to_public.constants.protocol_contracts_hash,
            // We take the prover id of the public tube, but we validate that it matches the prover id of the avm in validate_public_tube_against_avm
            prover_id: public_tube.prover_id,
        };

        let (tx_effect, tx_effect_array_lengths) = public_tx_effect_builder::build_tx_effect(
            private_to_public,
            avm,
            contract_class_log_fields,
        );

        let start_tree_snapshots = avm.start_tree_snapshots.to_partial_state_reference();
        let end_tree_snapshots = avm.end_tree_snapshots.to_partial_state_reference();

        Self {
            constants,
            tx_effect,
            tx_effect_array_lengths,
            start_tree_snapshots,
            end_tree_snapshots,
            start_sponge_blob,
            gas_used: avm.end_gas_used,
        }
    }

    pub fn finish(self) -> TxRollupPublicInputs {
        let end_sponge_blob = append_tx_effect_to_sponge_blob(
            self.tx_effect,
            self.tx_effect_array_lengths,
            self.start_sponge_blob,
        );

        let out_hash = self.compute_kernel_out_hash();

        TxRollupPublicInputs {
            num_txs: 1,
            constants: self.constants,
            start_tree_snapshots: self.start_tree_snapshots,
            end_tree_snapshots: self.end_tree_snapshots,
            start_sponge_blob: self.start_sponge_blob,
            end_sponge_blob,
            out_hash,
            accumulated_fees: self.tx_effect.transaction_fee,
            accumulated_mana_used: self.gas_used.l2_gas as Field,
        }
    }

    fn compute_kernel_out_hash(self) -> Field {
        let l2_to_l1_msgs = self.tx_effect.l2_to_l1_msgs;
        let num_non_empty_items = self.tx_effect_array_lengths.l2_to_l1_msgs;
        let merkle_tree = UnbalancedMerkleTree::new_sha::<MAX_L2_TO_L1_MSGS_PER_TX, MAX_L2_TO_L1_MSG_SUBTREES_PER_TX>(
            l2_to_l1_msgs,
            num_non_empty_items,
        );
        merkle_tree.get_root()
    }
}
