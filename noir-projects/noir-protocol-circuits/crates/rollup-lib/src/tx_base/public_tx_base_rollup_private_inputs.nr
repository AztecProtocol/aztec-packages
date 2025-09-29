use crate::{
    abis::{PublicTubePublicInputs, TxRollupPublicInputs},
    tx_base::components::{PublicTxBaseInputsValidator, TxBasePublicInputsComposer},
};
use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        avm_circuit_public_inputs::AvmCircuitPublicInputs, sponge_blob::SpongeBlob,
    },
    constants::{ARCHIVE_HEIGHT, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX},
    proof::proof_data::{AvmV2ProofData, RollupHonkProofData},
};

pub struct PublicTxBaseRollupPrivateInputs {
    // The public inputs of `private_tail_to_public` was propagated to `hiding_kernel_to_public` and then to
    // `public_tube`, whose public inputs are identical to those inputs, and are validated in this circuit.
    pub(crate) public_tube_proof_data: RollupHonkProofData<PublicTubePublicInputs>,

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
    // These fields are validated against the hashes committed to and propagated from the private tail kernel. The
    // fields themselves are added to the blobs, instead of the hashes.
    pub(crate) contract_class_log_fields: [[Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS]; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl PublicTxBaseRollupPrivateInputs {
    pub fn execute(self) -> TxRollupPublicInputs {
        let composer = TxBasePublicInputsComposer::new_from_public_tube_and_avm(
            self.public_tube_proof_data.public_inputs,
            self.avm_proof_data.public_inputs,
            self.last_archive,
            self.contract_class_log_fields,
            self.start_sponge_blob,
        );

        PublicTxBaseInputsValidator::new(
            self.public_tube_proof_data,
            self.avm_proof_data,
            composer.constants,
            self.anchor_block_archive_sibling_path,
        )
            .validate();

        composer.finish()
    }
}
