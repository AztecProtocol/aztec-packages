use crate::{
    abis::{PublicChonkVerifierPublicInputs, TxRollupPublicInputs},
    tx_base::components::{PublicTxBaseInputsValidator, TxBasePublicInputsComposer},
};
use ::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        avm_circuit_public_inputs::AvmCircuitPublicInputs,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    proof::proof_data::{AvmV2ProofData, RollupHonkProofData},
};

pub struct PublicTxBaseRollupPrivateInputs {
    // The public inputs of `private_tail_to_public` was propagated to `hiding_kernel_to_public` and then to
    // `public_chonk_verifier`, whose public inputs are identical to those inputs, and are validated in this circuit.
    pub(crate) public_chonk_verifier_proof_data: RollupHonkProofData<PublicChonkVerifierPublicInputs>,

    // AVM proof data. The public inputs contains the data from executing the public functions.
    pub(crate) avm_proof_data: AvmV2ProofData<AvmCircuitPublicInputs>,

    // The sponge blob immediately before this tx.
    // This circuit absorbs the tx effect into the sponge blob. The resulting sponge blob becomes the
    // `start_sponge_blob` for the next tx, and is validated in `tx_merge`, `block_root` and `block_merge` to ensure
    // continuity.
    // The `start_sponge_blob` of the first tx in a checkpoint contains no fields and is validated in `checkpoint_root`.
    pub(crate) start_sponge_blob: SpongeBlob,

    // The archive tree snapshot immediately before this tx. This will be set in the block's constant data.
    pub(crate) last_archive: AppendOnlyTreeSnapshot,

    // Sibling path proving that the anchor block header used during tx execution exists in the archive tree.
    pub(crate) anchor_block_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Fields of the contract class logs.
    // These fields are validated against the contract class log hashes that are committed to and propagated
    // from the private tail kernel. The fields themselves are added to the blobs, instead of the hashes.
    // Note: if the avm reverted, only the _non-revertible_ contract class logs will be fed into this circuit, and
    // only the _non-revertible_ contract class log hashes will be reconciled.
    pub(crate) contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

/// The Public Tx Base Rollup circuit processes a transaction with public execution in the rollup.
/// It validates and incorporates the transaction's state changes into the rollup's accumulated data.
///
/// This circuit:
/// - Verifies the proof from the AVM (public execution phase)
/// - Verifies the public chonk verifier proof, which validates and propagates the output of the Private Kernel
///   Tail-to-Public circuit
/// - Validates the consistency between the output of the AVM and the output of the Private Kernel Tail-to-Public
/// - Silos the L2 to L1 messages and computes the out hash
/// - Validates the contract class log hashes from Private Kernel Tail-to-Public against the provided log fields
/// - Absorbs the transaction effects into the sponge blob for data availability
///
/// The output feeds into a Tx Merge circuit if more transactions need to be combined,
/// or directly into a Block Root circuit if the block contains only one or two transactions, or if the other
/// transactions have already been merged into a tree whose root is this transaction's left sibling.
///
/// VkIndex: PUBLIC_TX_BASE_ROLLUP_VK_INDEX
pub fn execute(inputs: PublicTxBaseRollupPrivateInputs) -> TxRollupPublicInputs {
    let composer = TxBasePublicInputsComposer::new_from_public_chonk_verifier_and_avm(
        inputs.public_chonk_verifier_proof_data.public_inputs,
        inputs.avm_proof_data.public_inputs,
        inputs.last_archive,
        inputs.contract_class_log_fields,
        inputs.start_sponge_blob,
    );

    PublicTxBaseInputsValidator::new(
        inputs.public_chonk_verifier_proof_data,
        inputs.avm_proof_data,
        composer.constants, // where applicable, these constants have been copied-over from the avm's public inputs.
        inputs.anchor_block_archive_sibling_path,
    )
        .validate();

    composer.finish()
}
