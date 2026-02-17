use crate::{
    abis::TxRollupPublicInputs,
    tx_base::components::{
        PrivateTxBaseInputsValidator, TreeSnapshotDiffHints, TxBasePublicInputsComposer,
    },
};
use types::{
    abis::{
        block_constant_data::BlockConstantData,
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        partial_state_reference::PartialStateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    proof::proof_data::ChonkProofData,
};

pub struct PrivateTxBaseRollupPrivateInputs {
    // The public inputs of `private_kernel_tail` are propagated to `hiding_kernel_to_rollup`, whose public inputs are
    // identical to those inputs, and are validated in this circuit.
    pub(crate) hiding_kernel_proof_data: ChonkProofData<PrivateToRollupKernelCircuitPublicInputs>,

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

/// The Private Tx Base Rollup circuit processes a private-only transaction in the rollup.
/// It validates and incorporates the transaction's state changes into the rollup's accumulated data.
///
/// This circuit:
/// - Verifies the hiding kernel proof, which validates and propagates the output of the Private Kernel Tail circuit
/// - Validates that the transaction's anchor block exists in the archive tree
/// - Validates the fee payer's balance and deducts the transaction fee from it
/// - Validates the contract class log hashes from Private Kernel Tail against the provided log fields
/// - Silos the L2 to L1 messages and computes the out hash
/// - Inserts new note hashes, nullifiers, and the public data write for the fee payer's updated balance into their
///   respective trees
/// - Absorbs the transaction effects into the sponge blob for data availability
///
/// The output feeds into a Tx Merge circuit if more transactions need to be combined,
/// or directly into a Block Root circuit if the block contains only one or two transactions, or if the other
/// transactions have already been merged into a tree whose root is this transaction's left sibling.
///
/// VkIndex: PRIVATE_TX_BASE_ROLLUP_VK_INDEX
pub fn execute(inputs: PrivateTxBaseRollupPrivateInputs) -> TxRollupPublicInputs {
    let validator = PrivateTxBaseInputsValidator::new(
        inputs.hiding_kernel_proof_data,
        inputs.constants,
        inputs.contract_class_log_fields,
        inputs.fee_payer_balance_leaf_preimage,
        inputs.anchor_block_archive_sibling_path,
    );
    validator.validate();

    let composer = TxBasePublicInputsComposer::new_from_private_to_rollup(
        inputs.hiding_kernel_proof_data.public_inputs,
        inputs.constants,
        inputs.start_tree_snapshots,
        inputs.start_sponge_blob,
        inputs.contract_class_log_fields,
        inputs.fee_payer_balance_leaf_preimage,
        inputs.tree_snapshot_diff_hints,
    );

    validator.validate_fee_payer_balance(composer.tx_effect.transaction_fee);

    composer.finish()
}
