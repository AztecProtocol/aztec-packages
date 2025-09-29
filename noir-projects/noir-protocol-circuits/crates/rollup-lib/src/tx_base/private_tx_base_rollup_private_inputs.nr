use crate::{
    abis::TxRollupPublicInputs,
    tx_base::components::{
        PrivateTxBaseInputsValidator, TreeSnapshotDiffHints, TxBasePublicInputsComposer,
    },
};
use dep::types::{
    abis::{
        block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        partial_state_reference::PartialStateReference, sponge_blob::SpongeBlob,
    },
    constants::{ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    proof::proof_data::CivcProofData,
};

pub struct PrivateTxBaseRollupPrivateInputs {
    // The public inputs of `private_kernel_tail` are propagated to `hiding_kernel_to_rollup`, whose public inputs are
    // identical to those inputs, and are validated in this circuit.
    pub(crate) hiding_kernel_proof_data: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,

    // Constants shared by all txs in the same block.
    pub(crate) constants: BlockConstantData,

    // Tree snapshots immediately before this tx.
    // This circuit inserts new leaves to the snapshots. The resulting snapshots become the `start_tree_snapshots` for
    // the next tx, and are validated in `tx_merge` or `block_root` to ensure continuity.
    // The `start_tree_snapshots` of the first tx in a checkpoint must match the previous checkpoint's end tree
    // snapshots, and are validated in `checkpoint_root`.
    pub(crate) start_tree_snapshots: PartialStateReference,

    // The sponge blob immediately before this tx.
    // This circuit absorbs the tx effect into the sponge blob. The resulting sponge blob becomes the
    // `start_sponge_blob` for the next tx, and is validated in `tx_merge`, `block_root` and `block_merge` to ensure
    // continuity.
    // The `start_sponge_blob` of the first tx in a checkpoint contains no fields and is validated in `checkpoint_root`.
    pub(crate) start_sponge_blob: SpongeBlob,

    // Fields of the contract class logs.
    // These fields are validated against the hashes committed to and propagated from the private tail kernel. The
    // fields themselves are added to the blobs, instead of the hashes.
    pub(crate) contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],

    // Preimage of the fee payer's balance leaf.
    // Ensures the fee payer has sufficient balance to cover the tx fee. The fee is deducted and the public data tree
    // leaf is updated in this circuit.
    pub(crate) fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,

    // Sibling path proving that the anchor block header used during tx execution exists in the archive tree.
    pub(crate) anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Hints for inserting or updating leaves in `start_tree_snapshots`.
    pub(crate) tree_snapshot_diff_hints: TreeSnapshotDiffHints,
}

impl PrivateTxBaseRollupPrivateInputs {
    pub fn execute(self) -> TxRollupPublicInputs {
        let validator = PrivateTxBaseInputsValidator::new(
            self.hiding_kernel_proof_data,
            self.constants,
            self.start_tree_snapshots,
            self.contract_class_log_fields,
            self.fee_payer_balance_leaf_preimage,
            self.anchor_block_archive_sibling_path,
        );
        validator.validate();

        let composer = TxBasePublicInputsComposer::new_from_private_to_rollup(
            self.hiding_kernel_proof_data.public_inputs,
            self.constants,
            self.start_tree_snapshots,
            self.start_sponge_blob,
            self.contract_class_log_fields,
            self.fee_payer_balance_leaf_preimage,
            self.tree_snapshot_diff_hints,
        );

        validator.validate_fee_payer_balance(composer.tx_effect.transaction_fee);

        composer.finish()
    }
}
